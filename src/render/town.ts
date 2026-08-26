// TOWN RENDER — the restored street on the start islet (plan 05 §1.1, task t18
// slice 3; real building meshes, task t20).
//
// Two layers, in this order:
//
//   1. THE STUB. Three InstancedMeshes for the whole street — bodies, roofs,
//      and one warm window pane each — sharing one geometry apiece with per-face
//      vertex colours baked in. No lights (the window is an unlit warm basic
//      material, so a restored building reads as inhabited at zero lighting
//      cost). This is what a building stands as the instant it is paid for.
//   2. THE REAL MESH. Each building has a generated GLB in public/assets/town/.
//      They are NOT in assets/manifest.json — a fresh save has an empty town and
//      should not pay to fetch eight buildings it will never draw — so they are
//      requested on demand (assets.requestAsset) the first frame their slot is
//      restored, and swapped over the stub when they land (render/lake.ts
//      trySwapLighthouse pattern). The stub stays the pre-load fallback, and
//      stays forever if the fetch fails.
//
// The warm window survives the swap: a real building gets its own small
// emissive quad sized and placed off its own bounding box (facade centre, a
// little over a third of the way up), sharing the stub's breathing material.
//
// Slots come from meta/hubStreet.ts (pure, deterministic) and the restored set
// from the save's `metaState`, so the street is rebuilt only when the town
// actually changes — or when a building's mesh finishes loading.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { Islet } from '../gen/lakeMap';
import { isletHeightAt } from '../gen/isletHeight';
import { GROUND_Y } from './lake';
import { townSlots, type TownSlot } from '../meta/hubStreet';
import { BUILDINGS, buildingSlotIndex } from '../content/buildings';
import { restoredIds } from '../meta/restoration';
import { getSave } from '../core/save';
import { getAsset, hasAsset, requestAsset } from './assets';

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

// --- the real meshes ----------------------------------------------------------

// The generated buildings are normalized to a 4.0–5.4 m footprint (a building
// beside the 1.85 m keeper), but the street they stand on is TIGHT: hubStreet
// spaces its eight slots 0.354 × the islet's max radius apart, which is 3.3 m
// on a small islet and 4.7 m on a large one. Rather than move the slots (they
// are the doorstep positions the barks and the town door already use), each
// building is scaled to sit inside its share of the street: no building may be
// wider than this fraction of the gap to its nearest neighbour, so the row
// reads as a terrace that nearly touches rather than a pile-up.
const STREET_FIT = 0.85;

// Facade orientation. The prepped GLBs face +X (that is the "front" cell of
// tools/blender/prep.py's contact sheet, and every building was yawed to
// present its door there); the slot's `yaw` turns a +Z-facing box to the
// street, exactly as the stub does. Turning the model −90° inside its slot
// group reconciles the two, so one rotation rule covers stub and mesh alike.
const MODEL_FACING = -Math.PI / 2;

// The warm window on a real building, as fractions of its own bounding box.
const WIN_FRAC_W = 0.17;
const WIN_FRAC_H = 0.13;
const WIN_FRAC_Y = 0.38;

/** Asset-cache id for a building's generated mesh. */
export function townAssetId(id: string): string {
  return `town:${id}`;
}

/** Where that mesh is served from (public/assets/town/<id>.glb). */
export function townModelUrl(id: string): string {
  return `/assets/town/${id}.glb`;
}

/**
 * The distance between the two CLOSEST slots on the street — the gap a
 * building has to fit inside if the row is not to interpenetrate. Pure, and
 * derived from the slots themselves so it tracks any change to hubStreet's
 * spacing rather than duplicating its constants.
 */
export function tightestSlotGap(slots: readonly TownSlot[]): number {
  let min = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]!;
      const b = slots[j]!;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * How far to scale a building whose widest horizontal dimension is `footprint`
 * so it fits its share of a street whose tightest slot gap is `gap`. Never
 * scales a building UP — a mesh that already fits is left at its authored size.
 */
export function streetFitScale(footprint: number, gap: number): number {
  if (!(footprint > 0) || !(gap > 0)) return 1;
  return Math.min(1, (gap * STREET_FIT) / footprint);
}

let townGroup: THREE.Group | null = null;
let models: THREE.Group | null = null; // parent of the swapped-in real buildings
let bodies: THREE.InstancedMesh | null = null;
let roofs: THREE.InstancedMesh | null = null;
let windows: THREE.InstancedMesh | null = null;
let windowMat: THREE.MeshBasicMaterial | null = null;
let modelWindowGeo: THREE.BufferGeometry | null = null;

// The street currently on screen — rebuilt only when this signature changes.
let builtSignature = '';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _axisY = new THREE.Vector3(0, 1, 0);
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

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
  geo.translate(0, BODY_H * 0.55, BODY_D / 2 + 0.012); // on the stub's front face
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

  // The real buildings' windows are sized per building, so they use a plain
  // centred quad (one geometry, shared by every swapped mesh) rather than the
  // stub's pre-offset one.
  modelWindowGeo = new THREE.PlaneGeometry(1, 1);

  models = new THREE.Group();
  models.name = 'town:models';
  townGroup.add(models);
}

// Build one restored building out of its loaded GLB: the mesh turned to face
// the street, scaled to fit the street's spacing, with its own warm window quad
// on the facade.
function makeBuilding(model: THREE.Group, slot: TownSlot, gap: number, y: number): THREE.Group {
  const group = new THREE.Group();
  model.rotation.y = MODEL_FACING;

  // Measure the mesh as authored (rotated, unscaled) to get the footprint the
  // street has to hold and the facade the window sits on.
  _box.setFromObject(model);
  _box.getSize(_size);
  const fit = streetFitScale(Math.max(_size.x, _size.z), gap) * slot.scale;
  model.scale.setScalar(fit);
  group.add(model);

  if (windowMat && modelWindowGeo) {
    const win = new THREE.Mesh(modelWindowGeo, windowMat);
    win.name = 'town:model-window';
    win.scale.set(_size.x * WIN_FRAC_W * fit, _size.y * WIN_FRAC_H * fit, 1);
    win.position.set(0, _size.y * WIN_FRAC_Y * fit, _box.max.z * fit + 0.02);
    group.add(win);
  }

  group.position.set(slot.x, y, slot.z);
  group.rotation.y = slot.yaw;
  return group;
}

// Lay the restored buildings into their slots: the ones whose mesh has landed
// as real geometry, the rest as stub instances. One matrix write per stub,
// only when the restored set (or the islet, or the loaded set) changes.
function rebuild(iso: Islet, ids: readonly string[]): void {
  if (!bodies || !roofs || !windows || !models) return;
  const slots = townSlots(iso, BUILDINGS.length);
  const gap = tightestSlotGap(slots);

  // Drop the previous street's models. GLB clones SHARE geometry/materials with
  // the asset cache (userData.sharedAsset), so they are removed, never disposed
  // — disposing one would blank every later clone.
  for (const child of [...models.children]) models.remove(child);

  let n = 0;
  for (const id of ids) {
    const slot = slots[buildingSlotIndex(id)];
    if (!slot) continue;
    const y = GROUND_Y + isletHeightAt(iso, slot.x, slot.z);

    const model = hasAsset(townAssetId(id)) ? getAsset(townAssetId(id)) : null;
    if (model) {
      const built = makeBuilding(model, slot, gap, y);
      built.name = `town:${id}`;
      models.add(built);
      continue;
    }

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

  // A building's mesh is fetched the first frame it stands, and never before.
  let loadedMask = '';
  for (const id of ids) {
    requestAsset(townAssetId(id), townModelUrl(id));
    loadedMask += hasAsset(townAssetId(id)) ? '1' : '0';
  }

  const signature = `${lake?.seed ?? 'none'}:${lake?.startIslet ?? -1}:${ids.join(',')}:${loadedMask}`;
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

// Test/probe seam: how many building STUBS are currently instanced (i.e.
// restored buildings still waiting on — or doing without — their mesh).
export function townInstanceCount(): number {
  return bodies?.count ?? 0;
}

// Test/probe seam: how many restored buildings are drawn as their real mesh.
export function townModelCount(): number {
  return models?.children.length ?? 0;
}

// Test/probe seam: buildings standing on the street, stub or mesh. This is the
// number that should equal the save's restored count, whatever has loaded.
export function townBuildingCount(): number {
  return townInstanceCount() + townModelCount();
}
