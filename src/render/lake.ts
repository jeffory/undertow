// LAKE RENDER — M3 round 1 (task scope 4). Renders the procedural lake:
// every islet's polygon as a flat-shaded earth mesh with slight height
// variation, distinct primitive markers for wrecks / buoys / sinkholes, cloned
// rocks.glb instances on islet edges, and the lighthouse on the designated
// start islet. Perf: islet meshes are a handful of tris each; markers are 1-2
// draw calls each; the heavy geometry is the shared rocks.glb clones
// (budgeted to ~4) and one lighthouse instance. Visible in BOTH modes (the
// lake is the world; ground.ts's debug disc only shows without a lake).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { Buoy, Islet, LakeMap, Wreck } from '../gen/lakeMap';
import { polygonCentroid } from '../core/poly';
import { getAsset, hasAsset } from './assets';

export const GROUND_Y = 0.25; // islet top surface, above the water plane

// Earth palette (matches the M1 debug ground) with per-islet slight variation
const EARTH_TOP = 0x6a5336;
const EARTH_EDGE = 0x3a2c1c;

const WRECK_COLOR = 0x1c1512; // near-black timber
const BUOY_PRIMARY = 0xffb45e; // warm amber — the extraction buoy near the start
const BUOY_SECONDARY = 0x9db8d4; // pale bone-teal — the mid-map buoy
const SINKHOLE_COLOR = 0x04070a; // the descent gap

const LIGHTHOUSE_SCALE = 0.18; // 22m glb → ~4m tower on the start islet
const ROCK_SCALE = 0.45; // rocks.glb (2.2m) → ~1m shoreline boulders

let lakeGroup: THREE.Group | null = null;
let builtFor: LakeMap | null = null;

const buoyMarkers: Array<{ group: THREE.Group; phase: number; buoyId: number }> = [];

// --- lighthouse glb swap (same pattern as the old sky.ts lighthouse) ----------
let lighthouseBody: THREE.Object3D | null = null;
let lighthouseSwapped = false;

// --- islet mesh ---------------------------------------------------------------

// Triangle fan from the polygon centroid with a slightly lifted centre vertex:
// a gentle dome, flat-shaded, rim darker than the top. Star-shaped (radial-order)
// polygons make the fan valid; winding matches ground.ts so normals face +Y.
function buildIsletGeometry(poly: { x: number; z: number }[]): THREE.BufferGeometry {
  const c = polygonCentroid(poly);
  const n = poly.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cTop = new THREE.Color(EARTH_TOP);
  const cEdge = new THREE.Color(EARTH_EDGE);
  const col = new THREE.Color();

  positions.push(c.x, GROUND_Y + 0.6, c.z);
  col.copy(cTop);
  colors.push(col.r, col.g, col.b);

  for (let i = 0; i < n; i++) {
    const v = poly[i]!;
    positions.push(v.x, GROUND_Y, v.z);
    col.lerpColors(cTop, cEdge, (i % 2) * 0.3 + 0.15);
    colors.push(col.r, col.g, col.b);
  }
  for (let i = 0; i < n; i++) {
    indices.push(0, ((i + 1) % n) + 1, i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildIsletMesh(iso: Islet): THREE.Mesh {
  const geo = buildIsletGeometry(iso.poly);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(geo, mat);
}

// --- markers ------------------------------------------------------------------

function buildWreck(wreck: Wreck): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: WRECK_COLOR });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.4), mat);
  hull.position.y = GROUND_Y + 0.1;
  hull.rotation.y = wreck.id * 1.3;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 0.12), mat);
  mast.position.y = GROUND_Y + 0.75;
  mast.rotation.z = 0.12;
  g.add(mast);
  g.position.set(wreck.pos.x, 0, wreck.pos.z);
  return g;
}

function buildBuoy(buoy: Buoy): { group: THREE.Group; phase: number; buoyId: number } {
  const g = new THREE.Group();
  const color = buoy.primary ? BUOY_PRIMARY : BUOY_SECONDARY;
  const float = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.25, 8),
    new THREE.MeshLambertMaterial({ color }),
  );
  float.position.y = 0.3;
  g.add(float);
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshBasicMaterial({ color }),
  );
  top.position.y = 0.55;
  g.add(top);
  g.position.set(buoy.pos.x, GROUND_Y, buoy.pos.z);
  return { group: g, phase: buoy.id * 2.1, buoyId: buoy.id };
}

function buildSinkhole(sinkhole: { pos: { x: number; z: number } }): THREE.Mesh {
  const geo = new THREE.CircleGeometry(2.2, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: SINKHOLE_COLOR,
    transparent: true,
    opacity: 0.9,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(sinkhole.pos.x, 0.02, sinkhole.pos.z);
  return m;
}

// --- rocks (approved rocks.glb clones on islet edges, budgeted) ----------------
// Rocks load async after boot, so they are placed lazily (like the keeper /
// rowboat / lighthouse swaps) rather than during the one-shot rebuild.
interface RockSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

let rockSpawns: RockSpawn[] = [];
let rocksAdded = false;

function computeRockSpawns(lake: LakeMap): void {
  rockSpawns.length = 0;
  rocksAdded = false;
  for (const iso of lake.islets) {
    if (iso.kind === 'rock') continue; // pure obstacles stay bare (a `return`
    // here aborted rock placement for every islet after the first rock islet)
    // start islet + every 3rd walkable islet keeps the tri budget well under 450k
    if (iso.id !== 0 && iso.id % 3 !== 0) continue;
    const v = iso.poly[iso.id % iso.poly.length]!;
    rockSpawns.push({ x: v.x, y: GROUND_Y, z: v.z, yaw: iso.id * 1.7 });
  }
}

function tryAddRocks(): void {
  if (rocksAdded || !lakeGroup || !hasAsset('rocks')) return;
  for (const spawn of rockSpawns) {
    const model = getAsset('rocks');
    if (!model) return;
    model.scale.setScalar(ROCK_SCALE);
    model.rotation.y = spawn.yaw;
    model.position.set(spawn.x, spawn.y, spawn.z);
    lakeGroup.add(model);
  }
  rocksAdded = true;
}

// --- lighthouse ---------------------------------------------------------------
function buildLighthouse(iso: Islet): THREE.Group {
  const group = new THREE.Group();
  group.position.set(iso.center.x, 0, iso.center.z);
  group.scale.setScalar(LIGHTHOUSE_SCALE);

  // cone body fallback until the generated model lands
  const bodyGeo = new THREE.ConeGeometry(2.6, 20, 8);
  bodyGeo.translate(0, 10, 0);
  lighthouseBody = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0x0a1c26 }));
  group.add(lighthouseBody);

  // warm lantern patch + short point light at the top
  const patch = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9, 0),
    new THREE.MeshBasicMaterial({ color: 0xffcf8a }),
  );
  patch.position.y = 18.5;
  group.add(patch);
  const lantern = new THREE.PointLight(0xffcf8a, 1.5, 12, 2);
  lantern.position.y = 18.5;
  group.add(lantern);

  lighthouseSwapped = false;
  return group;
}

function trySwapLighthouse(): void {
  if (lighthouseSwapped || !lighthouseBody || !hasAsset('lighthouse')) return;
  const model = getAsset('lighthouse');
  if (!model) return;
  const parent = lighthouseBody.parent;
  if (parent) {
    parent.remove(lighthouseBody);
    const cone = lighthouseBody as THREE.Mesh;
    if (cone.isMesh) {
      cone.geometry.dispose();
      (cone.material as THREE.Material).dispose();
    }
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.frustumCulled = false;
    });
    parent.add(model);
  }
  lighthouseBody = null;
  lighthouseSwapped = true;
}

// --- rebuild ------------------------------------------------------------------
function disposeObject(obj: THREE.Object3D): void {
  // GLB clones from assets.getAsset() SHARE geometry/materials with the cached
  // source (tagged sharedAsset) — disposing them would free the cache's GPU
  // buffers and every later clone (run 2's rocks/lighthouse) would render as
  // nothing. Skip those subtrees; dispose only geometry this module built.
  if (obj.userData.sharedAsset) return;
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) {
    mesh.geometry?.dispose();
    const m = mesh.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  }
  for (const child of obj.children) disposeObject(child);
}

function rebuild(lake: LakeMap): void {
  if (!lakeGroup) return;
  for (const child of [...lakeGroup.children]) {
    disposeObject(child);
    lakeGroup.remove(child);
  }
  buoyMarkers.length = 0;
  lighthouseBody = null;
  lighthouseSwapped = false;
  computeRockSpawns(lake);

  for (const iso of lake.islets) {
    lakeGroup.add(buildIsletMesh(iso));
  }
  for (const wreck of lake.wrecks) lakeGroup.add(buildWreck(wreck));
  for (const buoy of lake.buoys) {
    const marker = buildBuoy(buoy);
    buoyMarkers.push(marker);
    lakeGroup.add(marker.group);
  }
  for (const sinkhole of lake.sinkholes) lakeGroup.add(buildSinkhole(sinkhole));
  const start = lake.islets[lake.startIslet];
  if (start) lakeGroup.add(buildLighthouse(start));
}

// --- system -------------------------------------------------------------------
export function initLake(scene: THREE.Scene): void {
  lakeGroup = new THREE.Group();
  scene.add(lakeGroup);
}

export function updateLake(world: WorldState, _dt: number): void {
  if (!lakeGroup) return;
  const lake = world.lake;
  if (!lake) {
    lakeGroup.visible = false;
    return;
  }
  if (builtFor !== lake) {
    rebuild(lake);
    builtFor = lake;
  }
  lakeGroup.visible = true;
  trySwapLighthouse();
  tryAddRocks();

  // buoys bob gently on the surface; a submerging buoy sinks with the false-dawn
  // clock (nightClockSystem drives buoy.submergeProgress) so it cannot extract
  const t = world.time.elapsed;
  for (let i = 0; i < buoyMarkers.length; i++) {
    const marker = buoyMarkers[i]!;
    // match by buoy ID, not by array index — the old Map was keyed by id but
    // probed with the marker's array index, a silent mismatch if ids ever
    // diverge from their positions
    const buoy = lake.buoys.find((b) => b.id === marker.buoyId);
    const sink = buoy ? buoy.submergeProgress : 0;
    marker.group.position.y =
      GROUND_Y + Math.sin(t * 2 + marker.phase) * 0.08 * (1 - sink) - sink * 5;
    marker.group.visible = sink < 1;
  }
}