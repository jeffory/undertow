// LINES — T10 line render (plan 02 §9, spec 13.4). The line is the
// protagonist: a quadratic Bézier catenary from the player's rod-tip to the
// hooked catch, sagging by (1 − tension/100), coloured green→amber→red by
// tension, drawn as a crisp 1px filament core with a soft additive halo so it
// outreads fog and dark water. Renders every fight in world.tether.fights (M2
// has one; the boat / reverse fights slot in through the same per-fight
// endpoint loop). Two draw calls per fight (line + glow). Vertex colours only,
// zero textures. The only render code in this plan — imports three, never game
// logic.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { TetherFight } from '../game/tether';
import { groundYAt } from './lake';
import { WATER_FISH_Y } from './fishMesh';
import { PLAYER_ENTITY, FISH_ENTITY, POSTMASTER_ENTITY } from '../game/tether';

// The end of the line that is NOT the hauling end. For every M2/M6 fight that is
// world.fish; for a reverse fight (05 §2.2) it is the boss. Falls back to the
// player so a fight whose far end has despawned draws a zero-length line rather
// than throwing.
function farEnd(world: WorldState, fight: TetherFight): { x: number; z: number } {
  const ep = fight.a.owner === 'player' ? fight.b : fight.a;
  if (ep.anchor.kind === 'boat') return { x: world.boat.x, z: world.boat.z };
  if (ep.anchor.kind === 'fixed') return ep.anchor.point;
  if (ep.anchor.entityId === POSTMASTER_ENTITY) {
    return { x: world.postmaster.x, z: world.postmaster.z };
  }
  if (ep.anchor.entityId === FISH_ENTITY && world.fish) {
    return { x: world.fish.x, z: world.fish.z };
  }
  if (ep.anchor.entityId === PLAYER_ENTITY) return { x: world.player.x, z: world.player.z };
  const es = world.entities;
  const i = ep.anchor.entityId * 3;
  return { x: es.positions[i] ?? world.player.x, z: es.positions[i + 2] ?? world.player.z };
}

// --- tuning ----------------------------------------------------------------
const SEGMENTS = 16; // bezier samples
const K_SAG = 1.5; // metres of sag at zero tension (plan §9)
const HOOK_Y = 0.45; // fish hook point above the islet
const DIVE_DROP = 0.8; // how far the hook sinks while the catch dives
const THRASH_AMP = 0.12; // drag jitter amplitude (m)
const FLASH_SECONDS = 0.3; // telegraph white-flash duration (s)

// Filament anchors (task t4): the line's origin must never emerge from the
// keeper's torso. On foot it rides a held rod tip at hand height, slightly
// forward + right of the player (heading space: +X = right, +Z = forward — a
// real rod prop lands later). On boat it lands on the stern winch post when
// the boat group carries one, else a boat-local stern point behind the helm.
const ROD_TIP_OFFSET = { right: 0.35, up: 1.25, fwd: 0.3 };
const BOAT_STERN_OFFSET = { right: 0, up: 1.0, back: 1.2 };

// Glow halo — a 5-row triangle strip with a quadratic alpha falloff, so the
// line reads as a crisp 1px filament core with a soft additive halo (the old
// 3-row / high-alpha ribbon read as a fat translucent tube).
const GLOW_ROWS = 5;
const GLOW_HALF_WIDTH = 0.24; // outer glow row offset (m)
const GLOW_ROW_SPACING = GLOW_HALF_WIDTH / ((GLOW_ROWS - 1) / 2);
const GLOW_ALPHA: readonly number[] = [0.0, 0.3, 0.6, 0.3, 0.0];

// 3-stop line palette (task t4, art bible): green #33ff88 (slack) → amber
// #ffcc44 (~70%) → red #ff3344 (near snap). Tension colour updates every
// frame while a fight is live.
const COLOR_CALM = new THREE.Color(0x33ff88);
const COLOR_WARN = new THREE.Color(0xffcc44);
const COLOR_DANGER = new THREE.Color(0xff3344);
const COLOR_FLASH = new THREE.Color(0xffffff); // telegraph white-flash
const WARN_STOP = 0.7; // amber colour at 70% of the ceiling

// Pure helpers (exported so the T10 acceptance can be unit-tested).

// 3-stop lerp by tension: green at 0 → amber at the ~70 warn stop → red at the
// ceiling. Reads live fight.tension every frame (updateRig), so the filament
// walks the palette during a fight.
export function tensionColor(
  tension: number,
  ceiling: number,
  out: THREE.Color,
): THREE.Color {
  const p = Math.min(1, Math.max(0, tension / ceiling));
  if (p <= WARN_STOP) {
    out.copy(COLOR_CALM).lerp(COLOR_WARN, p / WARN_STOP);
  } else {
    out.copy(COLOR_WARN).lerp(COLOR_DANGER, (p - WARN_STOP) / (1 - WARN_STOP));
  }
  return out;
}

// Sag depth in metres: 0 at the ceiling (taut), kSag at 0 tension (deep droop).
export function lineSag(tension: number, ceiling: number): number {
  return (1 - Math.min(1, Math.max(0, tension / ceiling))) * K_SAG;
}

// --- per-fight rig ----------------------------------------------------------
interface LineRig {
  fightId: number;
  root: THREE.Group;
  line: THREE.Line;
  glow: THREE.Mesh;
  linePos: Float32Array; // (SEGMENTS+1)*3
  lineCol: Float32Array; // (SEGMENTS+1)*3
  glowPos: Float32Array; // (SEGMENTS+1)*GLOW_ROWS verts * 3
  glowCol: Float32Array; // (SEGMENTS+1)*GLOW_ROWS verts * 4 (rgba)
  thrash: number; // 1 → decays; drives the drag jitter
  flash: number; // 1 → decays; white line flash on telegraph
  dive: number; // 1 → decays; hook sinks while the catch dives
}

const N_POINTS = SEGMENTS + 1;

function setRow(
  arr: Float32Array,
  v: number,
  x: number,
  y: number,
  z: number,
): void {
  arr[v * 3] = x;
  arr[v * 3 + 1] = y;
  arr[v * 3 + 2] = z;
}

function buildRig(fightId: number): LineRig {
  const root = new THREE.Group();

  // Core line — one vertex per bezier sample, shared colour per frame.
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(N_POINTS * 3), 3),
  );
  lineGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(N_POINTS * 3), 3),
  );
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, fog: false, depthTest: false, transparent: true });
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;
  line.renderOrder = 91;

  // Glow halo — a GLOW_ROWS triangle strip so the alpha falls off softly;
  // additive + vertex alpha reads as a halo over dark water.
  const glowGeo = new THREE.BufferGeometry();
  const vCount = N_POINTS * GLOW_ROWS;
  glowGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(vCount * 3), 3),
  );
  glowGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(vCount * 4), 4),
  );
  const idx: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const a0 = s * GLOW_ROWS;
    const a1 = (s + 1) * GLOW_ROWS;
    for (let r = 0; r < GLOW_ROWS - 1; r++) {
      const l0 = a0 + r;
      const r0 = a0 + r + 1;
      const l1 = a1 + r;
      const r1 = a1 + r + 1;
      idx.push(l0, r0, l1, r0, r1, l1); // quad between row r and r+1
    }
  }
  glowGeo.setIndex(idx);
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false, // spec 13.4: the line wins every priority fight
    side: THREE.DoubleSide,
    // r160 renders transparent DoubleSide materials in two passes (back+front)
    // — a thin ribbon needs only one; forceSinglePass keeps it 1 draw call.
    forceSinglePass: true,
    fog: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = 90;

  root.add(line);
  root.add(glow);
  return {
    fightId,
    root,
    line,
    glow,
    // The rig arrays ARE the geometry attribute arrays — updateRig writes into
    // them directly and flags needsUpdate. (A prior version allocated separate
    // arrays here, so the geometry never received a single write.)
    linePos: (lineGeo.attributes.position as THREE.BufferAttribute).array as Float32Array,
    lineCol: (lineGeo.attributes.color as THREE.BufferAttribute).array as Float32Array,
    glowPos: (glowGeo.attributes.position as THREE.BufferAttribute).array as Float32Array,
    glowCol: (glowGeo.attributes.color as THREE.BufferAttribute).array as Float32Array,
    thrash: 0,
    flash: 0,
    dive: 0,
  };
}

function disposeRig(rig: LineRig): void {
  rig.line.geometry.dispose();
  (rig.line.material as THREE.Material).dispose();
  rig.glow.geometry.dispose();
  (rig.glow.material as THREE.Material).dispose();
}

// --- bezier helpers -----------------------------------------------------------
const P0 = new THREE.Vector3();
const P2 = new THREE.Vector3();
const CHORD = new THREE.Vector3();
const MID = new THREE.Vector3();
const PERP = new THREE.Vector3();
const CTRL = new THREE.Vector3();
const TANGENT = new THREE.Vector3();
const GLOW_PERP = new THREE.Vector3();
const TMP_COLOR = new THREE.Color();

function bezierPoint(
  p0: THREE.Vector3,
  c: THREE.Vector3,
  p2: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const u = 1 - t;
  out.set(
    u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * c.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * c.z + t * t * p2.z,
  );
  return out;
}

// Unit vector perpendicular to the chord in the horizontal (XZ) plane.
function chordPerp(chord: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.set(-chord.z, 0, chord.x);
  const len = out.length();
  if (len < 1e-6) out.set(1, 0, 0);
  else out.divideScalar(len);
  return out;
}

// Local heading-space offset → world offset for a yaw (same XZ convention as
// world.player.facing / world.boat.heading: 0 = +Z, +PI/2 = +X). `right` is
// the +X heading-space axis, `fwd` the +Z one.
function headingOffset(
  right: number,
  fwd: number,
  heading: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  out.x = right * c + fwd * s;
  out.z = -right * s + fwd * c;
  return out;
}

const SAMPLES: THREE.Vector3[] = Array.from(
  { length: N_POINTS },
  () => new THREE.Vector3(),
);

function updateRig(
  rig: LineRig,
  world: WorldState,
  fight: TetherFight,
  dt: number,
  now: number,
): void {
  const p = world.player;
  const fish = world.fish;
  const ceiling = world.line.tensionCeiling;
  const isFoot = world.mode === 'foot';

  // Rod-tip anchor (task t4): never the keeper's torso centre. On foot the
  // origin rides a held rod tip at hand height, forward + right of the player
  // in heading space. On a boat fight it lands on the stern winch post when
  // the boat group carries one, else a boat-local stern point.
  if (fight.anchor === 'boat') {
    if (winchPost) {
      winchPost.getWorldPosition(P0);
    } else {
      const b = world.boat;
      headingOffset(0, -BOAT_STERN_OFFSET.back, b.heading, P0);
      P0.x += b.x;
      P0.z += b.z;
      P0.y = b.y + BOAT_STERN_OFFSET.up;
    }
  } else {
    headingOffset(ROD_TIP_OFFSET.right, ROD_TIP_OFFSET.fwd, p.facing, P0);
    P0.x += p.x;
    P0.z += p.z;
    P0.y = groundYAt(world, P0.x, P0.z) + ROD_TIP_OFFSET.up;
  }

  // Hook anchor on the FAR END at the fight's waterline (dive → sink). On foot
  // both anchors ride the terrain surface so the line stays attached to the
  // rod and the thing on the other end.
  //
  // 05 §2.2 — "renders every fight in world.tether.fights … the boat / reverse
  // fights slot in through the same per-fight endpoint loop" was the promise
  // this file opened with, but the far end was hard-wired to world.fish. A
  // REVERSE fight has no catch at all (the boss hooked you), so the far end is
  // resolved from the fight's own non-player endpoint. Identical for every
  // fight built before this round: their far end IS world.fish.
  const far = farEnd(world, fight);
  const diving = rig.dive > 0 || (fish ? (fish.state as string) === 'dive' : false);
  const hookBase = isFoot ? groundYAt(world, far.x, far.z) : WATER_FISH_Y;
  const hookY = hookBase + HOOK_Y - (diving ? DIVE_DROP : 0);
  P2.set(far.x, hookY, far.z);

  // Control point: the slack line droops DOWN (gravity), not sideways. The old
  // control point was midpoint + a chord-perpendicular offset — chordPerp
  // always picks the same rotational side of the chord, so the bulge bowed the
  // same way in every fight (USER report: "it always curves a specific
  // direction"). That read was tuned for the old top-down camera; at the low
  // chase camera a vertical catenary droop is both physical and readable.
  // PERP stays computed for the thrash jitter below.
  CHORD.subVectors(P2, P0);
  MID.addVectors(P0, P2).multiplyScalar(0.5);
  const sag = lineSag(fight.tension, ceiling);
  chordPerp(CHORD, PERP);
  CTRL.copy(MID);
  CTRL.y -= sag;
  if (CTRL.y < 0.08) CTRL.y = 0.08; // the belly never dips under the water

  // Thrash — small perpendicular jitter on the control point while a drag is
  // fresh; sells the yank.
  if (rig.thrash > 0.001) {
    const jit = Math.sin(now * 40 + rig.fightId * 7) * THRASH_AMP * rig.thrash;
    CTRL.addScaledVector(PERP, jit);
  }

  for (let i = 0; i <= SEGMENTS; i++) {
    bezierPoint(P0, CTRL, P2, i / SEGMENTS, SAMPLES[i]!);
  }

  // Colour: 3-stop by tension, blended toward white during the telegraph flash.
  tensionColor(fight.tension, ceiling, TMP_COLOR);
  if (rig.flash > 0.001) TMP_COLOR.lerp(COLOR_FLASH, Math.min(1, rig.flash));

  // Line vertices + colours.
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = SAMPLES[i]!;
    setRow(rig.linePos, i, s.x, s.y, s.z);
    rig.lineCol[i * 3] = TMP_COLOR.r;
    rig.lineCol[i * 3 + 1] = TMP_COLOR.g;
    rig.lineCol[i * 3 + 2] = TMP_COLOR.b;
  }

  // Glow halo: GLOW_ROWS per sample, offset perpendicular to the line tangent,
  // alpha falling off quadratically toward the outer rows.
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = SAMPLES[i]!;
    if (i < SEGMENTS) TANGENT.subVectors(SAMPLES[i + 1]!, s);
    chordPerp(TANGENT, GLOW_PERP);
    for (let r = 0; r < GLOW_ROWS; r++) {
      const v = i * GLOW_ROWS + r;
      const off = (r - (GLOW_ROWS - 1) / 2) * GLOW_ROW_SPACING;
      setRow(rig.glowPos, v, s.x + GLOW_PERP.x * off, s.y, s.z + GLOW_PERP.z * off);
      const alpha = GLOW_ALPHA[r]!;
      rig.glowCol[v * 4] = TMP_COLOR.r;
      rig.glowCol[v * 4 + 1] = TMP_COLOR.g;
      rig.glowCol[v * 4 + 2] = TMP_COLOR.b;
      rig.glowCol[v * 4 + 3] = alpha;
    }
  }

  const linePosAttr = rig.line.geometry.attributes.position as THREE.BufferAttribute;
  const lineColAttr = rig.line.geometry.attributes.color as THREE.BufferAttribute;
  const glowPosAttr = rig.glow.geometry.attributes.position as THREE.BufferAttribute;
  const glowColAttr = rig.glow.geometry.attributes.color as THREE.BufferAttribute;
  linePosAttr.needsUpdate = true;
  lineColAttr.needsUpdate = true;
  glowPosAttr.needsUpdate = true;
  glowColAttr.needsUpdate = true;
  rig.glow.geometry.computeBoundingSphere();

  rig.thrash = Math.max(0, rig.thrash - dt * 4);
  rig.flash = Math.max(0, rig.flash - dt / FLASH_SECONDS);
  rig.dive = Math.max(0, rig.dive - dt * 2);

  rig.root.visible = true;
}

// --- module state + the renderer seam -----------------------------------------
let root: THREE.Group | null = null;
const rigs = new Map<number, LineRig>();
let sceneRef: THREE.Scene | null = null; // for the boat winch-post lookup
let boatRoot: THREE.Group | null = null;
let winchPost: THREE.Object3D | null = null;
let anchorResolveTimer = 0;

export function initLines(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.visible = false; // hidden while no fight is active
  root.name = 'lines:root';
  scene.add(root);
  sceneRef = scene;
}

// Re-resolve the boat's stern winch post (~1Hz — the boat group is stable but
// the rowboat model with its winch can land after boot). updateRig reads the
// module-level `winchPost` for boat-fight anchors.
function refreshWinchPost(): void {
  anchorResolveTimer = Math.max(0, anchorResolveTimer - 1);
  if (anchorResolveTimer > 0) return;
  anchorResolveTimer = 60;
  if (!sceneRef) return;
  if (!boatRoot || !boatRoot.parent) {
    boatRoot = (sceneRef.getObjectByName('boat:root') as THREE.Group) ?? null;
  }
  winchPost = null;
  if (boatRoot) {
    boatRoot.traverse((o) => {
      if (winchPost) return;
      if (o.name && /winch/i.test(o.name)) winchPost = o;
    });
  }
}

export function updateLines(world: WorldState, dt: number): void {
  if (!root) return;
  refreshWinchPost();
  const fights = world.tether.fights;
  root.visible = fights.length > 0; // boat fights (M4) render the line too
  if (!root.visible) {
    // Reap BEFORE the early return: when the last fight ends, the early return
    // used to skip the reap loop below, so the final rig's geometries/materials
    // stayed in the Map and the scene until the NEXT fight started — and after
    // a run reset the recycled fight id 1 silently reattached to the stale rig.
    if (rigs.size > 0) {
      for (const [id, rig] of rigs) {
        root.remove(rig.root);
        disposeRig(rig);
        rigs.delete(id);
      }
    }
    return;
  }

  const now = world.time.elapsed;

  // Event triggers from this tick's stream (drags → thrash, dives → hook sink,
  // telegraphs → white flash).
  const triggers = new Map<number, { thrash: boolean; flash: boolean; dive: boolean }>();
  for (const ev of world.tetherEvents) {
    if (ev.type !== 'drag' && ev.type !== 'telegraph') continue;
    const fid = (ev as { fightId?: number }).fightId ?? -1;
    let tr = triggers.get(fid);
    if (!tr) {
      tr = { thrash: false, flash: false, dive: false };
      triggers.set(fid, tr);
    }
    if (ev.type === 'drag') {
      tr.thrash = true;
      if (ev.by === 'dive') tr.dive = true;
    } else if (!ev.occluded) {
      // M6 (plan 05 §2.1): a telegraph whose sight-line crosses a kelp column is
      // heard, not seen — the event still arrived (audio/log read it), but the
      // white flash that announces it is suppressed. In the Kelp Graves you read
      // the line's tension ramp instead, which is untouched below.
      tr.flash = true;
    }
  }

  const current = new Set<number>();
  for (const fight of fights) {
    current.add(fight.id);
    let rig = rigs.get(fight.id);
    if (!rig) {
      rig = buildRig(fight.id);
      root.add(rig.root);
      rigs.set(fight.id, rig);
    }
    const tr = triggers.get(fight.id);
    if (tr) {
      if (tr.thrash) rig.thrash = 1;
      if (tr.dive) rig.dive = 1;
      if (tr.flash) rig.flash = 1;
    }
    updateRig(rig, world, fight, dt, now);
  }

  // Reap rigs whose fight ended (snap / cut / land / butcher).
  for (const [id, rig] of rigs) {
    if (!current.has(id)) {
      root.remove(rig.root);
      disposeRig(rig);
      rigs.delete(id);
    }
  }
}