// GROUND — M1 scaffold: the debug walkable islet (plan 01 §4.1). A flat-shaded,
// vertex-coloured low-poly disc of dark earth (~20m radius) centred on the
// origin, shown only in foot mode. Its collision boundary lives in
// world.ground { x, z, radius } — the collision system keeps actors inside it.
// The procedural map (03) replaces this islet later; the scaffold owns it.
// Vertex colours only, zero textures.

import * as THREE from 'three';
import type { WorldState } from '../core/world';

export const GROUND_Y = 0.25; // top surface of the islet, above the water plane
const GROUND_RADIUS = 20; // must match world.ground.radius (world.ts)
const GROUND_SEGMENTS = 36; // low-poly rim
const GROUND_TOP = 0x6a5336; // dark earth, centre (lifted so the moon+ambient shape it — reads as a dark grey-brown islet, not void black)
const GROUND_EDGE = 0x3a2c1c; // darker rim so the bank reads against the water

let mesh: THREE.Mesh | null = null;

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
  scene.add(mesh);
}

export function updateGround(world: WorldState, _dt: number): void {
  if (!mesh) return;
  mesh.visible = world.mode === 'foot';
}