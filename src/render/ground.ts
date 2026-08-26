// GROUND — M1 scaffold: the debug walkable islet (plan 01 §4.1). A flat-shaded,
// vertex-coloured low-poly disc of dark earth (~20m radius) centred on the
// origin, shown only in foot mode. Its collision boundary lives in
// world.ground { x, z, radius } — the collision system keeps actors inside it.
// The procedural map (03) replaces this islet later; the scaffold owns it.
// Vertex colours only, zero textures.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { getAsset, hasAsset } from './assets';

export const GROUND_Y = 0.25; // top surface of the islet, above the water plane
const GROUND_RADIUS = 20; // must match world.ground.radius (world.ts)
const GROUND_SEGMENTS = 36; // low-poly rim
const GROUND_TOP = 0x6a5336; // dark earth, centre (lifted so the moon+ambient shape it — reads as a dark grey-brown islet, not void black)
const GROUND_EDGE = 0x3a2c1c; // darker rim so the bank reads against the water

// Rocks (generated prop) cloned onto the islet's edge, varied yaw/scale.
// Radius band keeps them on the bank, clear of the player's foot spawn.
const ROCK_SPAWNS: Array<{ angle: number; radius: number; scale: number; yaw: number }> = [
  { angle: Math.PI * 0.08, radius: 16.5, scale: 0.7, yaw: 0.4 },
  { angle: Math.PI * 0.78, radius: 17.0, scale: 0.55, yaw: 2.1 },
  { angle: Math.PI * 1.42, radius: 16.0, scale: 0.85, yaw: 4.4 },
];

let mesh: THREE.Mesh | null = null;
let props: THREE.Group | null = null;
let rocksAdded = false;

function addRocks(): void {
  if (rocksAdded || !props || !hasAsset('rocks')) return;
  for (const s of ROCK_SPAWNS) {
    const model = getAsset('rocks');
    if (!model) return;
    model.position.set(Math.cos(s.angle) * s.radius, GROUND_Y, Math.sin(s.angle) * s.radius);
    model.rotation.y = s.yaw;
    model.scale.setScalar(s.scale);
    props.add(model);
  }
  rocksAdded = true;
}

function buildGroundGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const cTop = new THREE.Color(GROUND_TOP);
  const cEdge = new THREE.Color(GROUND_EDGE);
  const col = new THREE.Color();

  // centre vertex
  positions.push(0, 0, 0);
  col.copy(cTop);
  colors.push(col.r, col.g, col.b);

  // rim fan (counter-clockwise when viewed from +Y → +Y normals)
  for (let i = 0; i <= GROUND_SEGMENTS; i++) {
    const a = (i / GROUND_SEGMENTS) * Math.PI * 2;
    positions.push(Math.cos(a) * GROUND_RADIUS, 0, Math.sin(a) * GROUND_RADIUS);
    col.lerpColors(cTop, cEdge, (i % 2) * 0.35 + 0.12); // subtle rim variation
    colors.push(col.r, col.g, col.b);
  }
  for (let i = 0; i < GROUND_SEGMENTS; i++) {
    // clockwise winding (viewed from +Y) so the fan's normals point up — the
    // naive (0, i+1, i+2) order produces -Y normals and the disc is culled.
    indices.push(0, i + 2, i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function initGround(scene: THREE.Scene): void {
  const geo = buildGroundGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, GROUND_Y, 0);
  mesh.visible = false; // foot mode only
  mesh.name = 'ground:disc';
  scene.add(mesh);

  // Group for the islet props (rocks) — toggled with the ground, foot mode only.
  props = new THREE.Group();
  props.visible = false;
  props.name = 'ground:props';
  scene.add(props);
}

export function updateGround(world: WorldState, _dt: number): void {
  if (!mesh || !props) return;
  // M3: when a procedural lake exists it renders the real islets — the M1 debug
  // disc and its rocks only appear in the legacy no-lake world (plan 03 §2.4).
  const hasLake = world.lake !== null;
  const foot = world.mode === 'foot' && !hasLake;
  mesh.visible = foot;
  props.visible = foot;
  if (foot) addRocks();
}