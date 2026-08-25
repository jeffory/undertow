// FISH (render) — WORKER C OWNS THIS FILE.
// M1 render side (plan 01 §4.5, T16): one shared fish mesh built from ~8
// low-poly capsule-ish spine segments (vertex colours, Shallows palette —
// dark teal body, pale belly). initFish(scene) is called at renderer boot;
// updateFishMesh(world, dt) each display frame reads world.fish.spine and CPU-
// bends the merged geometry per segment, rolls the corpse belly-up from
// deadTilt, and flashes an emissive overlay while hitFlash > 0. The mesh is
// hidden while world.fish is null or the mode is boat. Vertex colours only,
// zero textures. All three.js imports live here, never in game logic.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldState } from '../core/world';
import { SPINE_SEGMENTS } from '../core/world';
import { GROUND_Y } from './ground';
import { HIT_FLASH_DURATION } from '../game/fish';

// --- Shallows palette (plan 8.1: bone-teal accents on near-black) ------------
// Lifted so the body reads as a clearly visible dark teal under the weak moon +
// ambient (the curved sides only catch ambient, so an un-lifted 0x2a5a5b body
// sank to near-black). Kept moody: dark teal back, pale bone belly.
const BODY = 0x45858a; // dark teal body
const BODY_DARK = 0x336a6f; // deep teal — dorsal / back
const BELLY = 0xdfe9dc; // pale bone belly
const HEAD = 0x3c767b; // slightly darker head
const TAIL = 0x336a6f; // tail matches the back

// --- spine geometry -----------------------------------------------------------
const SEG_LEN = 0.5; // spine segment spacing (m)
const SEG_RADIAL = 8; // verts around a segment (low-poly)
const SEG_HEIGHT = 0.88; // × SEG_LEN = segment length
const HEAD_RADIUS = 0.31;
// tail → head radial profile (taper)
const RADII = [0.13, 0.19, 0.26, 0.31, 0.34, 0.34, 0.33, 0.30];

let outer: THREE.Group | null = null; // yaw (facing) + position
let inner: THREE.Group | null = null; // roll (belly-up flop)
let mesh: THREE.Mesh | null = null;
let mat: THREE.MeshLambertMaterial | null = null;
let geo: THREE.BufferGeometry | null = null;

let basePos: Float32Array | null = null; // pre-bend vertex positions
let segOfVertex: Uint8Array | null = null; // per-vertex spine segment
let baseZ: Float32Array | null = null; // per-segment spine z (m)

function segmentZ(i: number): number {
  return (i - (SPINE_SEGMENTS - 1) / 2) * SEG_LEN;
}

function paintSolid(geometry: THREE.BufferGeometry, color: number): void {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const c = new THREE.Color(color);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Belly = downward half of the segment (local -Y after the axis is laid along
// Z); blends pale belly → teal body across a band so it reads as a single fish.
function paintSegment(geometry: THREE.BufferGeometry): void {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return;
  const pos = posAttr.array as Float32Array;
  const body = new THREE.Color(BODY);
  const belly = new THREE.Color(BELLY);
  const c = new THREE.Color();
  const colors = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1]!; // after rotateX(-PI/2) the cross-section sits in X/Y
    const t = Math.min(1, Math.max(0, (y + 0.06) / 0.18));
    c.copy(belly).lerp(body, t);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// ~360 tris: 8 cylinder segments (32 each) + head sphere (80) + tail fin (12)
// + dorsal fin (12). One merged geometry = one mesh = one draw call.
function buildFishGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < SPINE_SEGMENTS; i++) {
    const r = RADII[i] ?? 0.3;
    const seg = new THREE.CylinderGeometry(r, r, SEG_LEN * SEG_HEIGHT, SEG_RADIAL, 1, false);
    seg.rotateX(-Math.PI / 2); // axis along Z, head toward +Z
    paintSegment(seg);
    seg.translate(0, 0, segmentZ(i));
    pieces.push(seg);
  }

  // head — a rounded blob on the front (+Z)
  const head = new THREE.SphereGeometry(HEAD_RADIUS, 8, 5);
  paintSolid(head, HEAD);
  head.translate(0, 0, segmentZ(SPINE_SEGMENTS - 1) + SEG_LEN / 2);
  pieces.push(head);

  // tail fin — a flat cone whose apex points backward (-Z)
  const tail = new THREE.ConeGeometry(0.3, 0.55, 6, 1, true);
  tail.scale(0.45, 0.35, 1);
  tail.rotateX(-Math.PI / 2); // apex → -Z
  paintSolid(tail, TAIL);
  tail.translate(0, 0, segmentZ(0) - SEG_LEN / 2);
  pieces.push(tail);

  // dorsal fin — a thin vertical slab near the back
  const dorsal = new THREE.BoxGeometry(0.05, 0.24, 0.5);
  paintSolid(dorsal, BODY_DARK);
  dorsal.translate(0, 0.12, -0.3);
  pieces.push(dorsal);

  const merged = mergeGeometries(pieces);
  if (!merged) throw new Error('fish geometry merge failed');
  return merged;
}

export function initFish(scene: THREE.Scene): void {
  geo = buildFishGeometry();
  mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.emissive.setRGB(1, 0.25, 0.2); // hurt-flash tint (intensity animated)
  mat.emissiveIntensity = 0;
  mesh = new THREE.Mesh(geo, mat);

  inner = new THREE.Group();
  inner.add(mesh);
  outer = new THREE.Group();
  outer.add(inner);
  outer.visible = false; // hidden until a fish spawns (foot mode)
  scene.add(outer);

  // cache the build data for the per-frame CPU bend
  const pos = geo.attributes.position as THREE.BufferAttribute;
  basePos = new Float32Array(pos.array as Float32Array);
  baseZ = new Float32Array(SPINE_SEGMENTS);
  for (let i = 0; i < SPINE_SEGMENTS; i++) baseZ[i] = segmentZ(i);

  const count = pos.count;
  segOfVertex = new Uint8Array(count);
  const zMin = segmentZ(0);
  for (let v = 0; v < count; v++) {
    const z = basePos[v * 3 + 2]!;
    const seg = Math.round((z - zMin) / SEG_LEN);
    segOfVertex[v] = Math.min(SPINE_SEGMENTS - 1, Math.max(0, seg));
  }
}

export function updateFishMesh(world: WorldState, _dt: number): void {
  if (!outer || !inner || !mesh || !mat || !geo || !basePos || !segOfVertex || !baseZ) return;

  const visible = world.fish !== null && world.mode === 'foot';
  outer.visible = visible;
  if (!visible) return;

  const fish = world.fish!;
  outer.position.set(fish.x, GROUND_Y + 0.35, fish.z);
  outer.rotation.y = fish.facing;

  // belly-up flop roll about the spine axis as deadTilt goes 0→1
  inner.rotation.z = fish.deadTilt * Math.PI;

  // hurt flash: emissive overlay scaled by remaining flash time
  mat.emissiveIntensity = Math.min(1, fish.hitFlash / HIT_FLASH_DURATION) * 0.9;

  // --- CPU sine-spine bend ---------------------------------------------------
  const n = fish.spine.length;
  if (n !== SPINE_SEGMENTS) return;

  // accumulated joint angle per segment (segment 0 stays on the facing axis)
  const th = new Float32Array(n);
  let ang = 0;
  for (let i = 0; i < n; i++) {
    th[i] = ang;
    ang += fish.spine[i]!;
  }

  // joint chain along the spine (rotation about Y = horizontal undulation)
  const jx = new Float32Array(n);
  const jz = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dz = baseZ[i]! - baseZ[i - 1]!;
    const a = th[i - 1]!;
    jx[i] = jx[i - 1]! + dz * Math.sin(a);
    jz[i] = jz[i - 1]! + dz * Math.cos(a);
  }

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const pos = posAttr.array as Float32Array;
  const count = posAttr.count;
  for (let v = 0; v < count; v++) {
    const i = segOfVertex[v]!;
    const bx = basePos[v * 3]!;
    const by = basePos[v * 3 + 1]!;
    const bz = basePos[v * 3 + 2]!;
    const oz = bz - baseZ[i]!; // offset from the segment joint along the spine
    const a = th[i]!;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    pos[v * 3] = jx[i]! + bx * ca + oz * sa;
    pos[v * 3 + 1] = by;
    pos[v * 3 + 2] = jz[i]! + -bx * sa + oz * ca;
  }
  posAttr.needsUpdate = true;
  // non-indexed geometry → recomputed per-vertex normals read as flat shading
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;
  if (normal) normal.needsUpdate = true;
  geo.computeBoundingSphere();
}