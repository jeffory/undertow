// SKY — WORKER A OWNS THIS FILE.
// FogExp2 (Shallows: bone-teal over near-black base), gradient background (a
// large inverted vertex-colored sphere, no textures), cool low-intensity moon
// directional light that rakes the scene, and a few distant low-poly islet
// silhouettes near the fog boundary to frame the fog. Plain functions + module
// state, vertex colors only, zero textures (plan 01 §3.2, T4).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from './renderer';
import { getAsset, hasAsset } from './assets';

// Palette (spec 8.1 / plan 01 §3.2): bone-teal over near-black water base.
const SKY_TOP = 0x0a1418; // deep near-black with a hint of teal
const SKY_HORIZON = 0x16303c; // bone-teal toward the horizon (brightened so a band reads)
const SKY_BOTTOM = 0x050709; // darkest near the waterline
const FOG_COLOR = 0x122c3a; // bone-teal fog (brighter so the distance ghosts visibly)

const ISLETS = 3;

// Lighthouse (replaces one distant islet cone): the generated model is 22m
// tall; scale it down to read as a landmark at the fog line without filling
// the frame. The warm lantern patch + point light sit at the top.
const LIGHTHOUSE_SCALE = 0.23;
const LANTERN_COLOR = 0xffcf8a;

let fog: THREE.FogExp2 | null = null;
let moon: THREE.DirectionalLight | null = null;
let islets: THREE.Group | null = null;
let bgSphere: THREE.Mesh | null = null;
let lighthouseBody: THREE.Object3D | null = null; // cone fallback -> loaded model
let lighthouseSwapped = false;

function makeIslet(seedIdx: number): THREE.Mesh {
  // Low-poly silhouette: a squat cone that RISES above the waterline (base at
  // y≈0, apex at full height) so it reads against the fog, unlike the previous
  // cones whose bulk sat below the plane and left only a nub above the water.
  const height = 1.1 + seedIdx * 0.3;
  const geo = new THREE.ConeGeometry(1.0 + (seedIdx % 3) * 0.3, height, 6);
  geo.translate(0, height * 0.5 - 0.3, 0); // base a hair below the waterline

  // Unlit dark silhouette (MeshBasic) so it reads as a shape against the fog,
  // then fog-blended toward the fog colour as it recedes.
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(0x0a1c26);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // small cones at the horizon must not get culled
  mesh.position.y = 0.4; // base sits in the waterline, apex rises above
  return mesh;
}

// Build the lighthouse group that replaces one distant islet cone. It carries a
// cone fallback body (until the generated model lands), a warm emissive patch
// at the lantern room, and a small warm point light. All scaled/positioned to
// the islet so it respects FogExp2 like the other silhouettes.
function makeLighthouse(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0.4, z);
  group.scale.setScalar(LIGHTHOUSE_SCALE);

  // body: cone fallback (a taller cone reads as a tower) until the model lands
  const bodyGeo = new THREE.ConeGeometry(2.6, 20, 8);
  bodyGeo.translate(0, 10, 0);
  const bodyPos = bodyGeo.attributes.position as THREE.BufferAttribute;
  const bodyCol = new Float32Array(bodyPos.count * 3);
  const c = new THREE.Color(0x0a1c26);
  for (let i = 0; i < bodyCol.length; i++) bodyCol[i] = i % 3 === 1 ? c.g : i % 3 === 0 ? c.r : c.b;
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(bodyCol, 3));
  lighthouseBody = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  (lighthouseBody as THREE.Mesh).frustumCulled = false;
  group.add(lighthouseBody);

  // warm emissive lantern patch at the top (fog-blended so it ghosts at range)
  const patchGeo = new THREE.OctahedronGeometry(0.9, 0);
  patchGeo.translate(0, 18.5, 0); // near the top of the tower
  const patchPos = patchGeo.attributes.position as THREE.BufferAttribute;
  const patchCol = new Float32Array(patchPos.count * 3);
  const pc = new THREE.Color(LANTERN_COLOR);
  for (let i = 0; i < patchCol.length; i++) patchCol[i] = i % 3 === 0 ? pc.r : i % 3 === 1 ? pc.g : pc.b;
  patchGeo.setAttribute('color', new THREE.BufferAttribute(patchCol, 3));
  const patch = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  patch.frustumCulled = false;
  group.add(patch);

  // small warm point light at the lantern room (short range — warms the tower
  // itself; the emissive patch carries the visible glow at fog distance)
  const lantern = new THREE.PointLight(LANTERN_COLOR, 2.0, 9, 2);
  lantern.position.y = 18.5;
  group.add(lantern);

  return group;
}

export function initSky(scene: THREE.Scene): void {
  // --- Gradient background via a large inverted vertex-colored sphere ---
  // Radius is big enough that even the far camera never clips it; faces point
  // inward (scale -1 flips winding). No textures.
  const bgeo = new THREE.SphereGeometry(500, 16, 12);
  const bpos = bgeo.attributes.position as THREE.BufferAttribute;
  const bcolors = new Float32Array(bpos.count * 3);
  const cTop = new THREE.Color(SKY_TOP);
  const cHorizon = new THREE.Color(SKY_HORIZON);
  const cBottom = new THREE.Color(SKY_BOTTOM);
  for (let i = 0; i < bpos.count; i++) {
    const y = bpos.getY(i) ?? 0;
    const h = THREE.MathUtils.clamp(y / 500, -1, 1);
    const c = new THREE.Color().lerpColors(cBottom, cHorizon, h * 0.5 + 0.5);
    c.lerp(cTop, Math.max(0, h) * 0.6);
    bcolors[i * 3] = c.r;
    bcolors[i * 3 + 1] = c.g;
    bcolors[i * 3 + 2] = c.b;
  }
  bgeo.setAttribute('color', new THREE.BufferAttribute(bcolors, 3));
  const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  bgSphere = new THREE.Mesh(bgeo, bmat);
  bgSphere.scale.set(-1, 1, 1); // invert → render the inside
  scene.add(bgSphere);

  // --- FogExp2 ---
  fog = new THREE.FogExp2(FOG_COLOR, 0.015);
  scene.fog = fog;
  scene.background = new THREE.Color(FOG_COLOR);

  // --- Moon directional light ---
  // Cool, low intensity, raking down from a low angle so it grazes the water
  // and islet silhouettes. Positioned high-ish and far off-axis; direction is
  // from position toward origin.
  moon = new THREE.DirectionalLight(0x9db8d4, 1.1);
  moon.position.set(-12, 16, -10);
  moon.target.position.set(0, 0, 0);
  scene.add(moon);
  scene.add(moon.target);

  // --- Distant islet silhouettes near the fog boundary ---
  // The M0 camera lerps toward a near-top-down view over the boat, so the
  // readable distance/fog band sits at the frame edges; the islets are placed
  // just inside the upper-left where the moonlit water is brightest, so their
  // dark discs ghost against it.
  islets = new THREE.Group();
  const placements: Array<[number, number]> = [
    [-7.0, -4.0],
    [-4.5, -6.8],
    [-10.0, -3.2],
  ];
  for (let i = 0; i < ISLETS; i++) {
    const p = placements[i]!;
    // The first distant silhouette is the lighthouse (tower + lantern), the
    // rest stay as plain cones.
    if (i === 0) {
      islets.add(makeLighthouse(p[0], p[1]));
      continue;
    }
    const m = makeIslet(i);
    m.position.x = p[0];
    m.position.z = p[1];
    m.rotation.y = (i * 1.7) % (Math.PI * 2);
    islets.add(m);
  }
  scene.add(islets);
}

export function updateSky(world: WorldState, _dt: number): void {
  // Keep the gradient sphere centered on the camera so it never falls behind.
  const ctx = currentRenderContext();
  if (bgSphere && ctx) {
    bgSphere.position.copy(ctx.camera.position);
  }
  if (fog) fog.density = 0.015;
  // Swap the lighthouse cone fallback for the loaded model once available.
  if (!lighthouseSwapped && lighthouseBody && hasAsset('lighthouse')) {
    const model = getAsset('lighthouse');
    if (model) {
      const parent = lighthouseBody.parent;
      if (parent) {
        parent.remove(lighthouseBody);
        // Small distant towers must never be frustum-culled at the frame edge.
        model.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) obj.frustumCulled = false;
        });
        parent.add(model);
      }
      lighthouseBody = null;
    }
    lighthouseSwapped = true;
  }
  void world;
}
