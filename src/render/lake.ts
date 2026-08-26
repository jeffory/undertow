// LAKE RENDER — M3 round 1 (task scope 4) + CRITICAL round B islet terrain
// (task t2). Renders the procedural lake: every islet as a FLAT-SHADED,
// FACETED slate-rock mesh with stepped height relief (a deterministic height
// field from src/gen/isletHeight.ts, low-amplitude noise rising toward the
// centre) and a beveled skirt dropping below the waterline so the shore reads
// as a rocky edge, not a paper cutout. Distinct primitive markers for wrecks /
// buoys / sinkholes, cloned rocks.glb instances scattered on the SHORELINE of
// eligible islets sitting ON the terrain, and the lighthouse anchored on a
// crag at the START ISLET'S FAR EDGE (scaled ~1.6x). Perf: islet meshes are a
// few hundred tris each; markers are 1-2 draw calls each; the heavy geometry is
// the shared rocks.glb clones (budgeted) and one lighthouse instance. Visible
// in BOTH modes (the lake is the world; ground.ts's debug disc only shows
// without a lake).
//
// groundYAt(world, x, z) is the entity-grounding seam: player / fish / props /
// tether-line read their feet height from it, sampling the SAME field that
// builds the visual mesh, so feet meet the terrain exactly. The walkable
// polygon collision contract is untouched — collision still uses the hull; the
// visual skirt may overhang it slightly.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import type { Buoy, Islet, LakeMap, Wreck } from '../gen/lakeMap';
import {
  isletHeightAt,
  isletMaxRadius,
  isletPeakRise,
  isletHash01,
} from '../gen/isletHeight';
import { getAsset, hasAsset } from './assets';

export const GROUND_Y = 0.25; // islet shoreline surface, above the water plane

// --- slate-rock palette (CRITICAL bar: dark slate #1c2226..#2d353b with
// earth-brown accents near the waterline) ---------------------------------------
const SLATE_DARK = 0x1c2226; // dark slate — low slopes / shade facets
const SLATE_LIGHT = 0x2d353b; // lighter slate — raised facets catch the moon
const EARTH = 0x3a2c1c; // earth-brown accent at the waterline
const DEEP = 0x0a0d10; // near-black below the waterline (the skirt)
const WRECK_COLOR = 0x1c1512; // near-black timber
const BUOY_PRIMARY = 0xffb45e; // warm amber — the extraction buoy near the start
const BUOY_SECONDARY = 0x9db8d4; // pale bone-teal — the mid-map buoy
const SINKHOLE_COLOR = 0x04070a; // the descent gap

const LIGHTHOUSE_SCALE = 0.29; // 22m glb → ~6.4m tower (1.6x the old 0.18)
const LIGHTHOUSE_EDGE_T = 0.9; // how far toward the far edge the tower sits
const ROCK_SCALE = 0.45; // rocks.glb (2.2m) → ~1m shoreline boulders

// Islet terrain construction: ISLET_RINGS rings (the rim is the last) with 2n
// verts each (poly verts + edge midpoints — same footprint), plus a centre fan
// and an outward-and-down beveled skirt below the waterline.
const ISLET_RINGS = 4;
const SKIRT_OUT = 1.14; // skirt extends this fraction beyond the rim footprint
const SKIRT_DROP = 1.1; // skirt drops this far below GROUND_Y (below the water)

let lakeGroup: THREE.Group | null = null;
let builtFor: LakeMap | null = null;

const buoyMarkers: Array<{ group: THREE.Group; phase: number; buoyId: number }> = [];

// --- lighthouse glb swap (same pattern as the old sky.ts lighthouse) ----------
let lighthouseBody: THREE.Object3D | null = null;
let lighthouseSwapped = false;

// --- islet mesh ---------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const C_SLATE_DARK = new THREE.Color(SLATE_DARK);
const C_SLATE_LIGHT = new THREE.Color(SLATE_LIGHT);
const C_EARTH = new THREE.Color(EARTH);
const C_DEEP = new THREE.Color(DEEP);
const faceCol = new THREE.Color();

// Ring verts at scale t toward the islet centre: [p0, mid01, p1, mid12, ...].
// t=1 reproduces the exact walkable polygon (midpoints lie on its edges).
function ringVerts(iso: Islet, t: number): Array<{ x: number; z: number }> {
  const c = iso.center;
  const n = iso.poly.length;
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = iso.poly[i]!;
    const b = iso.poly[(i + 1) % n]!;
    out.push({ x: c.x + (a.x - c.x) * t, z: c.z + (a.z - c.z) * t });
    out.push({ x: c.x + ((a.x + b.x) / 2 - c.x) * t, z: c.z + ((a.z + b.z) / 2 - c.z) * t });
  }
  return out;
}

// Ground world-Y for a point on an islet (the visual mesh + grounding agree).
function isoY(iso: Islet, x: number, z: number): number {
  return GROUND_Y + isletHeightAt(iso, x, z);
}

// Per-face colour: slate ramp by face height + a waterline earth-brown band +
// a deterministic per-face jitter so adjacent facets read as separate blocks.
function faceColor(iso: Islet, mx: number, my: number, mz: number): THREE.Color {
  const h = my - GROUND_Y;
  const peak = Math.max(0.3, isletPeakRise(iso));
  const tTop = clamp(h / peak, 0, 1);
  faceCol.lerpColors(C_SLATE_DARK, C_SLATE_LIGHT, tTop);
  const tWater = clamp(1 - h / 0.45, 0, 1);
  faceCol.lerp(C_EARTH, tWater * 0.5);
  const jit = 0.9 + 0.2 * isletHash01(iso, Math.floor(mx * 3), Math.floor(mz * 3));
  faceCol.multiplyScalar(jit);
  return faceCol;
}

// Build the faceted terrain as a NON-INDEXED triangle soup (three duplicated
// verts per face) so computeVertexNormals yields flat per-face normals, exactly
// the "craggy faceted rock" look. Skirt faces blend earth-brown → near-black.
function buildIsletGeometry(iso: Islet): THREE.BufferGeometry {
  const m = iso.poly.length * 2; // verts per ring
  const c = iso.center;
  const positions: number[] = [];
  const colors: number[] = [];

  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    skirt: boolean,
  ): void => {
    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    let r: number;
    let g: number;
    let b: number;
    if (skirt) {
      const depth = clamp((GROUND_Y - my) / SKIRT_DROP, 0, 1);
      faceCol.lerpColors(C_EARTH, C_DEEP, depth);
      r = faceCol.r;
      g = faceCol.g;
      b = faceCol.b;
    } else {
      const col = faceColor(iso, mx, my, mz);
      r = col.r;
      g = col.g;
      b = col.b;
    }
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    colors.push(r, g, b, r, g, b, r, g, b);
  };

  // centre vertex (t=0) + rings t = k/ISLET_RINGS (k=1..ISLET_RINGS, rim last)
  const cY = isoY(iso, c.x, c.z);
  const rings: Array<Array<{ x: number; z: number }>> = [];
  for (let k = 1; k <= ISLET_RINGS; k++) rings.push(ringVerts(iso, k / ISLET_RINGS));

  // centre fan (winding: centre → earlier angle → later angle → +Y normal)
  const inner = rings[0]!;
  for (let i = 0; i < m; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % m]!;
    pushTri(c.x, cY, c.z, a.x, isoY(iso, a.x, a.z), a.z, b.x, isoY(iso, b.x, b.z), b.z, false);
  }

  // bands between rings (winding verified → outward + upward normals)
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r]!;
    const B = rings[r + 1]!;
    for (let i = 0; i < m; i++) {
      const a = A[i]!;
      const a2 = A[(i + 1) % m]!;
      const b = B[i]!;
      const b2 = B[(i + 1) % m]!;
      pushTri(
        a.x, isoY(iso, a.x, a.z), a.z,
        a2.x, isoY(iso, a2.x, a2.z), a2.z,
        b2.x, isoY(iso, b2.x, b2.z), b2.z,
        false,
      );
      pushTri(
        a.x, isoY(iso, a.x, a.z), a.z,
        b2.x, isoY(iso, b2.x, b2.z), b2.z,
        b.x, isoY(iso, b.x, b.z), b.z,
        false,
      );
    }
  }

  // skirt: rim ring → outward-and-down, dropping below the waterline
  const rim = rings[rings.length - 1]!;
  const botY = GROUND_Y - SKIRT_DROP;
  for (let i = 0; i < m; i++) {
    const a = rim[i]!;
    const a2 = rim[(i + 1) % m]!;
    const sx = c.x + (a.x - c.x) * SKIRT_OUT;
    const sz = c.z + (a.z - c.z) * SKIRT_OUT;
    const s2x = c.x + (a2.x - c.x) * SKIRT_OUT;
    const s2z = c.z + (a2.z - c.z) * SKIRT_OUT;
    pushTri(a.x, isoY(iso, a.x, a.z), a.z, s2x, botY, s2z, a2.x, isoY(iso, a2.x, a2.z), a2.z, true);
    pushTri(a.x, isoY(iso, a.x, a.z), a.z, sx, botY, sz, s2x, botY, s2z, true);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.computeVertexNormals();
  return geo;
}

function buildIsletMesh(iso: Islet): THREE.Mesh {
  const geo = buildIsletGeometry(iso);
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

// --- rocks (rocks.glb clones scattered ON the terrain at the shoreline) --------
// Rocks load async after boot, so they are placed lazily (like the keeper /
// rowboat / lighthouse swaps) rather than during the one-shot rebuild. Rock
// spawns are deterministic per islet id (isletHash01) and their y is the terrain
// height at the spawn point, so every boulder sits ON the new faceted rock.
interface RockSpawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

let rockSpawns: RockSpawn[] = [];
let rocksAdded = false;

function computeRockSpawns(lake: LakeMap): void {
  rockSpawns.length = 0;
  rocksAdded = false;
  for (const iso of lake.islets) {
    if (iso.kind === 'rock') continue; // pure obstacles stay bare
    // start islet + every 3rd walkable islet keeps the tri budget well under 450k
    if (iso.id !== 0 && iso.id % 3 !== 0) continue;
    const count = iso.id === 0 ? 3 : 1; // the start islet gets a small crag cluster
    const maxR = isletMaxRadius(iso);
    for (let i = 0; i < count; i++) {
      const ang = isletHash01(iso, i, 1) * Math.PI * 2;
      const t = 0.8 + 0.17 * isletHash01(iso, i, 2); // shoreline band, inside the rim
      const r = maxR * t;
      const x = iso.center.x + Math.cos(ang) * r;
      const z = iso.center.z + Math.sin(ang) * r;
      rockSpawns.push({
        x,
        y: isoY(iso, x, z),
        z,
        yaw: isletHash01(iso, i, 3) * Math.PI * 2,
        scale: ROCK_SCALE * (0.8 + 0.4 * isletHash01(iso, i, 4)),
      });
    }
  }
}

function tryAddRocks(): void {
  if (rocksAdded || !lakeGroup || !hasAsset('rocks')) return;
  for (const spawn of rockSpawns) {
    const model = getAsset('rocks');
    if (!model) return;
    model.scale.setScalar(spawn.scale);
    model.rotation.y = spawn.yaw;
    model.position.set(spawn.x, spawn.y, spawn.z);
    lakeGroup.add(model);
  }
  rocksAdded = true;
}

// --- lighthouse ---------------------------------------------------------------
// The far edge of the start islet: the outermost vertex in the -X direction
// (away from the lake interior where the boat spawns) pulled slightly inward so
// the tower base stands on the rocky slope, not the rim drop.
function farEdgePoint(iso: Islet): { x: number; z: number } {
  let far = iso.poly[0]!;
  for (const v of iso.poly) if (v.x < far.x) far = v;
  const dx = far.x - iso.center.x;
  const dz = far.z - iso.center.z;
  const len = Math.hypot(dx, dz) || 1;
  const r = isletMaxRadius(iso) * LIGHTHOUSE_EDGE_T;
  return { x: iso.center.x + (dx / len) * r, z: iso.center.z + (dz / len) * r };
}

function buildLighthouse(iso: Islet): THREE.Group {
  const p = farEdgePoint(iso);
  const group = new THREE.Group();
  // anchor the tower base on the terrain at the crag — the old placement left
  // the base floating above the flat mud and its cyan-ish fallback cone read as
  // stray geometry; both are gone (slate fallback + grounded base).
  group.position.set(p.x, isoY(iso, p.x, p.z), p.z);
  group.scale.setScalar(LIGHTHOUSE_SCALE);

  // cone body fallback until the generated model lands — slate, matching the rock
  const bodyGeo = new THREE.ConeGeometry(2.6, 20, 8);
  bodyGeo.translate(0, 10, 0);
  lighthouseBody = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ color: SLATE_DARK }));
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

// --- entity grounding seam -----------------------------------------------------
// Player / fish / props / tether-line read their feet height from here. Falls
// back to the flat GROUND_Y when there is no lake or the player is not docked
// (legacy M1 world / boat mode callers never hit the foot branch).
export function groundYAt(world: WorldState, x: number, z: number): number {
  if (!world.lake || world.dockedIslet == null) return GROUND_Y;
  const iso = world.lake.islets[world.dockedIslet];
  if (!iso) return GROUND_Y;
  return isoY(iso, x, z);
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
  lakeGroup.name = 'lake:root';
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