// TOWN RENDER — the restored street on the start islet (plan 05 §1.1, task t18
// slice 3). "Restoring a building instantiates its low-poly mesh (shared
// instancing, vertex colours) into the slot."
//
// Deliberately cheap, and deliberately NOT a town: three InstancedMeshes for
// the whole street — bodies, roofs, and one warm window pane each — sharing one
// geometry apiece, with per-face vertex colours baked in. No NPC meshes, no
// lights (the window is an unlit warm basic material, so a restored building
// reads as inhabited at zero lighting cost). Eight instances maximum; only the
// restored ones are drawn (`mesh.count`).
//
// Slots come from meta/hubStreet.ts (pure, deterministic) and the restored set
// from the save's `metaState`, so the street is rebuilt only when the town
// actually changes.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { Islet } from '../gen/lakeMap';
import { isletHeightAt } from '../gen/isletHeight';
import { GROUND_Y } from './lake';
import { townSlots } from '../meta/hubStreet';
import { BUILDINGS, buildingSlotIndex } from '../content/buildings';
import { restoredIds } from '../meta/restoration';
import { getSave } from '../core/save';

// Damp timber and slate — one notch warmer than the islet rock so a restored
// premises separates from the crag it stands on without going brown.
const WALL_LO = 0x322b21; // shaded walls
const WALL_HI = 0x4c4234; // moonlit walls — dry timber, one notch off the slate
const ROOF = 0x1e2429; // wet slate roof, cooler than the walls
const WINDOW = 0xffc178; // the warm window patch — the only "presence" this round

const BODY_W = 1.5; // m
const BODY_H = 1.35;
const BODY_D = 1.25;
const ROOF_H = 0.75;
const WINDOW_W = 0.42;
const WINDOW_H = 0.34;

let townGroup: THREE.Group | null = null;
let bodies: THREE.InstancedMesh | null = null;
let roofs: THREE.InstancedMesh | null = null;
let windows: THREE.InstancedMesh | null = null;
let windowMat: THREE.MeshBasicMaterial | null = null;

// The street currently on screen — rebuilt only when this signature changes.
let builtSignature = '';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _axisY = new THREE.Vector3(0, 1, 0);

// A box with per-face vertex colours: BoxGeometry lays out 4 verts per face in
// the order +X, −X, +Y, −Y, +Z, −Z. The +Z face (the front, where the window
// goes) and +Y get the lit tone; the rest sit in shade.
function makeBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D);
  geo.translate(0, BODY_H / 2, 0); // stand on its footprint, not through it
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const lo = new THREE.Color(WALL_LO);
  const hi = new THREE.Color(WALL_HI);
  for (let f = 0; f < 6; f++) {
    const lit = f === 2 || f === 4; // +Y (top) and +Z (front)
    const c = lit ? hi : lo;
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3;
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// A four-sided pyramid, turned 45° so its ridges line up with the walls.
function makeRoofGeometry(): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(BODY_W * 0.82, ROOF_H, 4);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, BODY_H + ROOF_H / 2, 0);
  const count = geo.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(ROOF);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function makeWindowGeometry(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(WINDOW_W, WINDOW_H);
  geo.translate(0, BODY_H * 0.55, BODY_D / 2 + 0.012); // on the front face
  return geo;
}

export function initTown(scene: THREE.Scene): void {
  townGroup = new THREE.Group();
  townGroup.name = 'town:root';
  townGroup.visible = false;
  scene.add(townGroup);

  const max = BUILDINGS.length;
  bodies = new THREE.InstancedMesh(
    makeBodyGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    max,
  );
  bodies.name = 'town:bodies';
  bodies.count = 0;
  townGroup.add(bodies);

  roofs = new THREE.InstancedMesh(
    makeRoofGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    max,
  );
  roofs.name = 'town:roofs';
  roofs.count = 0;
  townGroup.add(roofs);

  windowMat = new THREE.MeshBasicMaterial({ color: WINDOW, fog: false, side: THREE.DoubleSide });
  windows = new THREE.InstancedMesh(makeWindowGeometry(), windowMat, max);
  windows.name = 'town:windows';
  windows.count = 0;
  townGroup.add(windows);
}

// Lay the restored buildings into their slots. One matrix write per building,
// only when the restored set (or the islet) changes.
function rebuild(iso: Islet, ids: readonly string[]): void {
  if (!bodies || !roofs || !windows) return;
  const slots = townSlots(iso, BUILDINGS.length);
  let n = 0;
  for (const id of ids) {
    const slot = slots[buildingSlotIndex(id)];
    if (!slot) continue;
    const y = GROUND_Y + isletHeightAt(iso, slot.x, slot.z);
    _pos.set(slot.x, y, slot.z);
    _quat.setFromAxisAngle(_axisY, slot.yaw);
    _scale.setScalar(slot.scale);
    _matrix.compose(_pos, _quat, _scale);
    bodies.setMatrixAt(n, _matrix);
    roofs.setMatrixAt(n, _matrix);
    windows.setMatrixAt(n, _matrix);
    n++;
  }
  bodies.count = n;
  roofs.count = n;
  windows.count = n;
  bodies.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  windows.instanceMatrix.needsUpdate = true;
}

export function updateTown(world: WorldState, _dt: number): void {
  if (!townGroup) return;
  const lake = world.lake;
  const iso = lake ? lake.islets[lake.startIslet] : null;
  const meta = getSave()?.metaState ?? null;
  const ids = meta && iso ? restoredIds(meta) : [];

  const signature = `${lake?.seed ?? 'none'}:${lake?.startIslet ?? -1}:${ids.join(',')}`;
  if (signature !== builtSignature) {
    if (iso) rebuild(iso, ids);
    builtSignature = signature;
  }
  townGroup.visible = ids.length > 0;

  // the windows breathe, very slightly — lamp-light, not a pulse
  if (windowMat && ids.length > 0) {
    const t = world.time.elapsed;
    windowMat.color.setHex(WINDOW);
    windowMat.color.multiplyScalar(0.9 + 0.08 * Math.sin(t * 1.3));
  }
}

// Test/probe seam: how many building instances are currently drawn.
export function townInstanceCount(): number {
  return bodies?.count ?? 0;
}
