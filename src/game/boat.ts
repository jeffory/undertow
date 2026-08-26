// BOAT — WORKER C OWNS THIS FILE.
// M0 rowable boat: low-poly vertex-coloured mesh + plain kinematics (heading +
// forward thrust, drag, sinusoidal bob on the water) + camera-follow target.
// Renderer boot calls initBoat(scene); each frame the render system calls
// updateBoat(world, dt). Reads/writes world.boat (pos/heading/speed).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
// Worker B (concurrent) adds this export to src/render/water.ts. If it has not
// landed yet, final compile depends on B; the rest of this file is self-contained.
import { waterHeightAt } from '../render/water';
import { shoreAttenAt } from '../core/shore';
import { createWake, stepWake, WAKE_POOL } from '../core/wake';
import type { Islet } from '../gen/lakeMap';
// Kinematics (heading/speed integration) live in the pure module boatPhysics.ts
// and are stepped by the movement SIM system; this render module only reads.
import { MAX_SPEED } from './boatPhysics';
import { getAsset, hasAsset } from '../render/assets';

const HULL_LEN = 3.2; // bow..stern length (z)
const HULL_WIDEST = 1.7; // max beam (x)

// Rowboat (generated prop) replaces the primitive hull. The model's long axis
// is along local X (3.696m) and its pointed bow is at -X, so it needs a +90°
// base yaw to point the bow toward +Z (the game's forward at heading 0) and a
// scale to match HULL_LEN. Kinematics / bob / wake / lantern mount all keep
// riding on the boat group, untouched.
const ROWBOAT_LENGTH = 3.696;
const ROWBOAT_SCALE = HULL_LEN / ROWBOAT_LENGTH;
const ROWBOAT_YAW = Math.PI / 2;

let boat: THREE.Group | null = null;
let hullPivot: THREE.Group | null = null; // pitch/roll pivot holding hull OR rowboat
let primHull: THREE.Mesh | null = null; // primitive hull (fallback)
let rowboatSwapped = false;
let wake: THREE.Points | null = null;
const wakeState = createWake();

// --- hull geometry (flat-shaded, vertex colours, no textures) ----------------

interface Vtx {
  p: THREE.Vector3;
  c: THREE.Color;
}

const verts: Vtx[] = [];
const idx: number[] = [];

function pushTri(a: Vtx, b: Vtx, c: Vtx): void {
  const base = verts.length;
  verts.push(a, b, c);
  idx.push(base, base + 1, base + 2);
}

// build a V-bottom hull from lengthwise stations.
// each station ring (bow→stern): [portGunwale, portChine, keel, starChine, starGunwale]
function buildHullGeometry(): THREE.BufferGeometry {
  verts.length = 0;
  idx.length = 0;

  const wood = new THREE.Color(0x4a3a28);
  const gunwale = new THREE.Color(0x5a4630);

  const stations = 14;
  const ring = 7; // gunwale, upper, chine, keel, chine, upper, gunwale

  // normalized cross-section heights/widths per ring slot (V shape)
  const hGun = 0.34; // gunwale height above keel (relative to hull scale)
  const hChine = 0.14;
  const xGun = 1.0;
  const xChine = 0.55;

  // shape profile along length (0 = stern, 1 = bow): width and height multiplier
  const prof = [
    0.30, 0.45, 0.62, 0.78, 0.90, 0.98, 1.0, 0.99, 0.93, 0.82, 0.68, 0.52, 0.38, 0.26,
  ];

  const pts: THREE.Vector3[][] = [];
  for (let s = 0; s < stations; s++) {
    const t = s / (stations - 1); // 0 stern .. 1 bow
    const z = (t - 0.5) * HULL_LEN;
    const w = prof[s]! * HULL_WIDEST * 0.5;
    const h = prof[s]! * hGun;
    const ch = prof[s]! * hChine;
    pts.push([
      new THREE.Vector3(-w * xGun, h, z),
      new THREE.Vector3(-w * 0.78, h * 0.72, z),
      new THREE.Vector3(-w * xChine, ch, z),
      new THREE.Vector3(0, 0, z),
      new THREE.Vector3(w * xChine, ch, z),
      new THREE.Vector3(w * 0.78, h * 0.72, z),
      new THREE.Vector3(w * xGun, h, z),
    ]);
  }

  const colFor = (s: number, slot: number): THREE.Color => {
    // dark wood, slight per-face variation
    const r = 0.86 + 0.14 * Math.sin(s * 1.7 + slot * 2.1);
    const c = slot === 0 || slot === ring - 1 ? gunwale.clone() : wood.clone();
    return c.multiplyScalar(r);
  };

  // side + bottom quads between stations, and cap the stern/bow ends
  for (let s = 0; s < stations - 1; s++) {
    for (let slot = 0; slot < ring - 1; slot++) {
      const a = pts[s]![slot]!;
      const b = pts[s]![slot + 1]!;
      const c = pts[s + 1]![slot + 1]!;
      const d = pts[s + 1]![slot]!;
      const ca = colFor(s, slot);
      const cb = colFor(s, slot + 1);
      const cc = colFor(s + 1, slot + 1);
      const cd = colFor(s + 1, slot);
      // two triangles (winding outward for the outer surface)
      pushTri({ p: a.clone(), c: ca }, { p: c.clone(), c: cc }, { p: b.clone(), c: cb });
      pushTri({ p: a.clone(), c: ca }, { p: d.clone(), c: cd }, { p: c.clone(), c: cc });
    }
  }

  // close the stern end (s=0) and bow end (s=last) with a triangle fan
  const closeEnd = (s: number, outward: boolean): void => {
    const ringPts = pts[s]!;
    const keel = ringPts[3]!;
    for (let slot = 0; slot < ring - 1; slot++) {
      const a = ringPts[slot]!;
      const b = ringPts[slot + 1]!;
      const ca = colFor(s, slot);
      const cb = colFor(s, slot + 1);
      if (outward) pushTri({ p: a.clone(), c: ca }, { p: b.clone(), c: cb }, { p: keel.clone(), c: ca.clone() });
      else pushTri({ p: b.clone(), c: cb }, { p: a.clone(), c: ca }, { p: keel.clone(), c: ca.clone() });
    }
  };
  closeEnd(0, true);
  closeEnd(stations - 1, false);

  // deck: flat top between gunwales (reads as boat top from low camera)
  for (let s = 0; s < stations - 1; s++) {
    const a = pts[s]![0]!;
    const b = pts[s]![ring - 1]!;
    const c = pts[s + 1]![ring - 1]!;
    const d = pts[s + 1]![0]!;
    const ca = colFor(s, 0);
    const cc = colFor(s + 1, ring - 1);
    pushTri({ p: b.clone(), c: ca.clone() }, { p: d.clone(), c: cc.clone() }, { p: a.clone(), c: ca.clone() });
    pushTri({ p: b.clone(), c: ca.clone() }, { p: c.clone(), c: cc.clone() }, { p: d.clone(), c: cc.clone() });
  }

  // gunwale rail: thin caps along both rails for a finished rim
  for (let s = 0; s < stations - 1; s++) {
    for (const g of [0, ring - 1]) {
      const a = pts[s]![g]!;
      const b = pts[s + 1]![g]!;
      const r0 = a.clone().add(new THREE.Vector3(0, 0.06, 0));
      const r1 = b.clone().add(new THREE.Vector3(0, 0.06, 0));
      const ca = colFor(s, g);
      const cb = colFor(s + 1, g);
      pushTri({ p: r0.clone(), c: ca.clone() }, { p: a.clone(), c: ca.clone() }, { p: b.clone(), c: cb.clone() });
      pushTri({ p: r0.clone(), c: ca.clone() }, { p: b.clone(), c: cb.clone() }, { p: r1.clone(), c: cb.clone() });
    }
  }

  const pos = new Float32Array(verts.length * 3);
  const col = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]!;
    pos[i * 3] = v.p.x;
    pos[i * 3 + 1] = v.p.y;
    pos[i * 3 + 2] = v.p.z;
    col[i * 3] = v.c.r;
    col[i * 3 + 1] = v.c.g;
    col[i * 3 + 2] = v.c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function makeWake(): THREE.Points {
  // world-space splash pool (core/wake.ts, T6): one Points draw call whose
  // positions/colors are rewritten each frame from the pure particle state.
  // Additive blending: faded particles blend to nothing over the dark water.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAKE_POOL * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(WAKE_POOL * 3), 3));
  // soft radial sprite — bare Points render as hard squares (the old wake's
  // "drifting boxes" read); a 32px gradient splat reads as churned water
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const g2d = cnv.getContext('2d')!;
  const grad = g2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2d.fillStyle = grad;
  g2d.fillRect(0, 0, 32, 32);
  const mat = new THREE.PointsMaterial({
    size: 0.42,
    map: new THREE.CanvasTexture(cnv),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // positions live in the buffer, bounds never computed
  return pts;
}

export function initBoat(scene: THREE.Scene): void {
  const group = new THREE.Group();

  // Pitch/roll pivot: holds the primitive hull (fallback) and, once loaded, the
  // rowboat model. The boat group carries position + heading; the pivot carries
  // the water-bob pitch/roll so they never fight the heading rotation.
  hullPivot = new THREE.Group();
  hullPivot.position.y = 0.05; // sit slightly above the waterline sample
  group.add(hullPivot);

  const hullGeo = buildHullGeometry();
  const hullMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  primHull = new THREE.Mesh(hullGeo, hullMat);
  hullPivot.add(primHull);

  // The generated rowboat.glb carries its own bench and detailing; the old
  // primitive bench/oar props are gone (the oar read as a plank stuck through
  // the hull). A proper stowed-oar prop can return with the boat-combat pass.

  // The wake lives at SCENE level in world space — parenting it to the boat
  // group made it translate/yaw with the hull (bug B3: a wake carried by its
  // emitter reads as flicker stuck to the stern, never as a trail).
  wake = makeWake();
  wake.name = 'boat:wake';
  scene.add(wake);

  group.position.set(0, 0, 0);
  group.name = 'boat:root';
  scene.add(group);
  boat = group;
}

// Shoreline-aware surface sample (core/shore.ts, T2): the hull bobs on the
// SAME attenuated height the water shader renders, so the boat can't ride a
// phantom swell beside a shore where the visible water is flat.
let lakeIslets: readonly Islet[] = [];

function sampleWater(x: number, z: number, t: number): number {
  return waterHeightAt(x, z, t) * shoreAttenAt(lakeIslets, x, z);
}

// Swap the primitive hull for the loaded rowboat once available. The rowboat is
// scaled to HULL_LEN and yawed so its bow points +Z; it replaces the primitive
// inside the pitch/roll pivot, so all bob/kinematics/wake logic is unchanged.
function trySwapRowboat(): void {
  if (rowboatSwapped || !hullPivot || !hasAsset('rowboat')) return;
  const model = getAsset('rowboat');
  if (!model) return;
  if (primHull) {
    hullPivot.remove(primHull);
    primHull.geometry.dispose();
    (primHull.material as THREE.Material).dispose();
    primHull = null;
    // release the module-level scratch arrays too — they retain ~1000 Vector3/
    // Color objects for a hull that no longer exists
    verts.length = 0;
    idx.length = 0;
  }
  model.scale.setScalar(ROWBOAT_SCALE);
  model.rotation.y = ROWBOAT_YAW;
  hullPivot.add(model);
  rowboatSwapped = true;
}

export function updateBoat(world: WorldState, dt: number): void {
  if (!boat) return;
  // Swap the primitive hull for the loaded rowboat as soon as it's available,
  // in BOTH modes, so the parked boat on the islet also shows the real model.
  trySwapRowboat();
  // M1 scaffold: on foot the boat stays parked — no kinematics, no bob, no
  // wake. Position integration is already gated in the movement system; this
  // stops the heading/speed state from drifting on intent too.
  if (world.mode === 'foot') return;
  lakeIslets = world.lake?.islets ?? [];
  const b = world.boat;
  const int = world.intent;
  const t = world.time.elapsed;

  // Kinematics (heading + speed) advance in the movement SIM system
  // (core/systems.ts) at fixed dt — stepping them here ran once per display
  // frame, making boat feel depend on the refresh rate. This render pass only
  // reads the state for bob/wake presentation.

  // --- bob on the water (sample at bow/stern and port/starboard) -------------
  const fwdZ = 1.1; // bow offset
  const sideX = 0.6;
  const bow = sampleWater(b.x, b.z + fwdZ, t);
  const stern = sampleWater(b.x, b.z - fwdZ, t);
  const port = sampleWater(b.x - sideX, b.z, t);
  const star = sampleWater(b.x + sideX, b.z, t);

  const avg = (bow + stern + port + star) / 4;
  b.y = avg; // water surface under the hull

  // pitch (bow up/down) and roll (bank) — slight, plus speed-dependent turn lean
  const pitch = (bow - stern) * 0.18;
  const turnBank = -int.moveX * Math.min(b.speed / MAX_SPEED, 1) * 0.10;
  const roll = (port - star) * 0.18 + turnBank;

  boat.position.set(b.x, b.y, b.z);
  boat.rotation.y = b.heading;
  hullPivot!.rotation.x = pitch;
  hullPivot!.rotation.z = roll;

  // --- wake: step the pure world-space pool, write it into the buffers -------
  if (wake) {
    stepWake(wakeState, { x: b.x, z: b.z, heading: b.heading, speed: b.speed }, dt);
    const geo = wake.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < wakeState.parts.length; i++) {
      const p = wakeState.parts[i]!;
      if (p.age >= p.life) {
        pos.setXYZ(i, 0, -999, 0); // dead slot: parked out of sight
        col.setXYZ(i, 0, 0, 0);
        continue;
      }
      // ride the (shore-attenuated) water surface where the particle IS —
      // never where the boat is
      pos.setXYZ(i, p.x, sampleWater(p.x, p.z, t) + 0.07, p.z);
      const fade = 1 - p.age / p.life;
      const a = fade * fade * 0.55;
      col.setXYZ(i, 0.62 * a, 0.68 * a, 0.7 * a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
