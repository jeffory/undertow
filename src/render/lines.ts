// LINES — T10 line render (plan 02 §9, spec 13.4). The line is the
// protagonist: a quadratic Bézier catenary from the player's rod-tip to the
// hooked catch, sagging by (1 − tension/100), coloured green→white→red by
// tension, with a faint additive glow ribbon so it outreads fog and dark
// water. Renders every fight in world.tether.fights (M2 has one; the boat /
// reverse fights slot in through the same per-fight endpoint loop). Two draw
// calls per fight (line + glow). Vertex colours only, zero textures. The only
// render code in this plan — imports three, never game logic.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { TetherFight } from '../game/tether';
import { GROUND_Y } from './ground';
import { WATER_FISH_Y } from './fishMesh';

// --- tuning ----------------------------------------------------------------
const SEGMENTS = 16; // bezier samples
const K_SAG = 1.5; // metres of sag at zero tension (plan §9)
const ROD_TIP_Y = 1.0; // rod-tip attach point, ~1m up off the islet
const HOOK_Y = 0.45; // fish hook point above the islet
const DIVE_DROP = 0.8; // how far the hook sinks while the catch dives
const GLOW_HALF_WIDTH = 0.32; // glow ribbon half width (m)
const THRASH_AMP = 0.12; // drag jitter amplitude (m)
const FLASH_SECONDS = 0.3; // telegraph white-flash duration (s)
const GLOW_EDGE_ALPHA = 0.3; // soft ribbon edges
const GLOW_CENTER_ALPHA = 0.95;

// 3-stop line palette (plan §9): green (calm) → white (warn ~60) → red (snap).
const COLOR_CALM = new THREE.Color(0x22c55e);
const COLOR_WARN = new THREE.Color(0xffffff);
const COLOR_DANGER = new THREE.Color(0xef4444);
const WARN_STOP = 0.6; // warn colour at 60% of the ceiling

// Pure helpers (exported so the T10 acceptance can be unit-tested).

// 3-stop lerp by tension: green at 0 → white at warn → red at the ceiling.
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
  glowPos: Float32Array; // (SEGMENTS+1)*3 verts * 3
  glowCol: Float32Array; // (SEGMENTS+1)*3 verts * 4 (rgba)
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

  // Glow ribbon — a 3-row (left/centre/right) triangle strip so the edges fall
  // off softly; additive + vertex alpha reads as a halo over dark water.
  const glowGeo = new THREE.BufferGeometry();
  const vCount = N_POINTS * 3;
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
    const a0 = s * 3;
    const a1 = (s + 1) * 3;
    const l0 = a0;
    const c0 = a0 + 1;
    const r0 = a0 + 2;
    const l1 = a1;
    const c1 = a1 + 1;
    const r1 = a1 + 2;
    idx.push(l0, c0, l1, c0, l1, c1); // left→centre quad
    idx.push(c0, r0, c1, r0, c1, r1); // centre→right quad
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

  // Endpoints: rod-tip ≈ player + 1m up (boat deck during boat fights); hook on
  // the catch at the fight's waterline (dive → sink).
  const rodY = isFoot ? GROUND_Y + ROD_TIP_Y : WATER_FISH_Y + ROD_TIP_Y;
  const diving = rig.dive > 0 || (fish ? (fish.state as string) === 'dive' : false);
  const hookY = (isFoot ? GROUND_Y : WATER_FISH_Y) + HOOK_Y - (diving ? DIVE_DROP : 0);
  P0.set(p.x, rodY, p.z);
  P2.set(fish ? fish.x : p.x, hookY, fish ? fish.z : p.z);

  // Control point: midpoint + sideways sag (catenary in top-down) with a touch
  // of vertical droop to sell it in the low camera.
  CHORD.subVectors(P2, P0);
  MID.addVectors(P0, P2).multiplyScalar(0.5);
  const sag = lineSag(fight.tension, ceiling);
  chordPerp(CHORD, PERP);
  CTRL.copy(MID).addScaledVector(PERP, sag);
  CTRL.y -= sag * 0.25;

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
  if (rig.flash > 0.001) TMP_COLOR.lerp(COLOR_WARN, Math.min(1, rig.flash));

  // Line vertices + colours.
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = SAMPLES[i]!;
    setRow(rig.linePos, i, s.x, s.y, s.z);
    rig.lineCol[i * 3] = TMP_COLOR.r;
    rig.lineCol[i * 3 + 1] = TMP_COLOR.g;
    rig.lineCol[i * 3 + 2] = TMP_COLOR.b;
  }

  // Glow ribbon: 3 rows per sample, offset perpendicular to the line tangent.
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = SAMPLES[i]!;
    if (i < SEGMENTS) TANGENT.subVectors(SAMPLES[i + 1]!, s);
    chordPerp(TANGENT, GLOW_PERP);
    for (let r = 0; r < 3; r++) {
      const v = i * 3 + r;
      const off = (r - 1) * GLOW_HALF_WIDTH;
      setRow(rig.glowPos, v, s.x + GLOW_PERP.x * off, s.y, s.z + GLOW_PERP.z * off);
      const alpha = r === 1 ? GLOW_CENTER_ALPHA : GLOW_EDGE_ALPHA;
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

export function initLines(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.visible = false; // hidden while no fight is active
  scene.add(root);
}

export function updateLines(world: WorldState, dt: number): void {
  if (!root) return;
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
    } else {
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