// SKY — WORKER A OWNS THIS FILE.
// FogExp2 (Shallows: bone-teal over near-black base), gradient background (a
// large inverted vertex-colored sphere, no textures), cool low-intensity moon
// directional light that rakes the scene, and a few distant low-poly islet
// silhouettes near the fog boundary to frame the fog. Plain functions + module
// state, vertex colors only, zero textures (plan 01 §3.2, T4).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from './renderer';

// Palette (spec 8.1 / plan 01 §3.2): bone-teal over near-black water base.
const SKY_TOP = 0x0a1418; // deep near-black with a hint of teal
const SKY_HORIZON = 0x16303c; // bone-teal toward the horizon (brightened so a band reads)
const SKY_BOTTOM = 0x050709; // darkest near the waterline
const FOG_COLOR = 0x122c3a; // bone-teal fog (brighter so the distance ghosts visibly)

const ISLETS = 3;

let fog: THREE.FogExp2 | null = null;
let moon: THREE.DirectionalLight | null = null;
let islets: THREE.Group | null = null;
let bgSphere: THREE.Mesh | null = null;

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
  void world;
}
