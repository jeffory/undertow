// KELP RENDER — the Kelp Graves' vertical columns (M6, plan 05 §2.1: "vertical
// kelp columns as instanced line-of-sight blockers — perf-budgeted ≤150 draws,
// kelp is ONE instanced mesh").
//
// The whole field is a single InstancedMesh: one geometry, one material, ONE
// draw call however many columns the seed grew (capped at MAX_KELP_COLUMNS).
// The stalk is a 5-sided tapered lathe — wide at the lakebed, narrow at the tip
// — flat-shaded with dark green-black vertex colours banded up its length, so
// the tips catch what little moon there is and the bases read as silhouette.
//
// Sway: a per-instance tilt wobble written into the instance matrices each
// frame, the same technique (and the same scratch objects, no per-frame
// allocation) as the driftwood field in render/lake.ts. ~140 matrix composes a
// frame is trivial next to the splash pool.
//
// The field itself (positions, heights, phases) is generated sim-side by
// gen/kelp.ts and rides on the LakeMap, so what is drawn here is exactly what
// the boat obstacle response, the foot collision, the drag-snag resolver and
// the LOS test are using. Nothing about the look can drift from the collision.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { LakeMap } from '../gen/lakeMap';
import { kelpBaseY } from '../gen/kelp';
import type { KelpColumn } from '../gen/kelp';
import { attenuatedWaterHeightAt } from '../core/shore';

// Dark green-black: the base is nearly the colour of the deep, the tip carries
// just enough bone-teal green to separate from the fog.
const KELP_DARK = 0x080f0c;
const KELP_LIGHT = 0x1b3129;

// The drawn stalk is a little thinner than the 0.5 m collider, so the collision
// reads as "the weed grabbed you" rather than as clipping through a post.
const VISUAL_RADIUS_SCALE = 0.78;

const RADIAL_SEGMENTS = 5;
const HEIGHT_SEGMENTS = 3; // enough for a vertex-colour band up the stalk

let root: THREE.Group | null = null;
let mesh: THREE.InstancedMesh | null = null;
let builtFor: LakeMap | null = null;
let columns: readonly KelpColumn[] = [];

// Scratch objects for the per-frame instance matrices (no per-frame allocation).
const _tiltAxis = new THREE.Vector3();
const _quatTilt = new THREE.Quaternion();
const _quatYaw = new THREE.Quaternion();
const _quat = new THREE.Quaternion();
const _axisY = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();

// A unit stalk: 1 m tall, radius 1 at the base tapering to `taper` at the tip,
// with its ORIGIN AT THE BASE so an instance can be scaled in height and pivoted
// about the lakebed (which is what makes the sway read as a stalk bending
// rather than a post rocking).
function makeStalkGeometry(): THREE.BufferGeometry {
  // Uniform taper baked here; per-column taper varies the tip via the shared
  // profile being narrow enough for all of them (a per-instance taper would
  // need per-instance geometry — the one thing an InstancedMesh cannot have).
  const geo = new THREE.CylinderGeometry(0.28, 1, 1, RADIAL_SEGMENTS, HEIGHT_SEGMENTS);
  geo.translate(0, 0.5, 0); // origin → base
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(KELP_DARK);
  const hi = new THREE.Color(KELP_LIGHT);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // 0 at the lakebed → 1 at the tip
    const t = Math.max(0, Math.min(1, pos.getY(i)));
    c.lerpColors(lo, hi, t * t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function disposeMesh(): void {
  if (!mesh || !root) return;
  root.remove(mesh);
  mesh.geometry.dispose();
  (mesh.material as THREE.Material).dispose();
  mesh = null;
}

function rebuild(lake: LakeMap): void {
  if (!root) return;
  disposeMesh();
  columns = lake.kelp;
  if (columns.length === 0) return;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m = new THREE.InstancedMesh(makeStalkGeometry(), mat, columns.length);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; // matrices are written per frame; keep it simple
  m.name = 'kelp:columns';
  mesh = m;
  root.add(m);
}

export function initKelp(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'kelp:root';
  scene.add(root);
}

// The probe/gate readout: what the field is worth right now.
export function kelpRenderState(): { columns: number; instances: number; draws: number } {
  return {
    columns: columns.length,
    instances: mesh ? mesh.count : 0,
    draws: mesh ? 1 : 0, // ONE InstancedMesh — one draw call for the whole field
  };
}

export function updateKelp(world: WorldState, _dt: number): void {
  if (!root) return;
  const lake = world.lake;
  if (!lake) {
    root.visible = false;
    return;
  }
  if (builtFor !== lake) {
    rebuild(lake);
    builtFor = lake;
  }
  root.visible = true;
  if (!mesh || columns.length === 0) return;

  const t = world.time.elapsed;
  const base = kelpBaseY();
  const islets = lake.islets;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    // The stalk is rooted on the bed and follows the swell at its tip, so it
    // bends with the same water the boat is bobbing on.
    const swell = attenuatedWaterHeightAt(islets, col.x, col.z, t);
    const tilt = Math.sin(t * col.swayFreq + col.swayPhase) * col.swayAmp;
    // Tilt about the horizontal axis perpendicular to the stalk's own yaw, so
    // neighbouring columns lean in visibly different directions.
    _tiltAxis.set(Math.cos(col.yaw), 0, Math.sin(col.yaw));
    _quatTilt.setFromAxisAngle(_tiltAxis, tilt);
    _quatYaw.setFromAxisAngle(_axisY, col.yaw);
    _quat.multiplyQuaternions(_quatTilt, _quatYaw);
    _pos.set(col.x, base, col.z);
    const r = col.radius * VISUAL_RADIUS_SCALE;
    // height reaches from the bed up past the surface by the column's own length
    _scale.set(r, col.height + swell * 0.5, r * (0.6 + col.taper));
    _matrix.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
