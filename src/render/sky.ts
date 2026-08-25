// SKY — WORKER A OWNS THIS FILE.
// FogExp2 (Shallows: bone-teal over near-black base), gradient background (a
// large inverted vertex-colored sphere, no textures), cool low-intensity moon
// directional light that rakes the scene. Plain functions + module state,
// vertex colors only, zero textures (plan 01 §3.2, T4). Distant islet
// silhouettes moved to the procedural lake render (M3).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from './renderer';

// Palette (spec 8.1 / plan 01 §3.2): bone-teal over near-black water base.
const SKY_TOP = 0x0a1418; // deep near-black with a hint of teal
const SKY_HORIZON = 0x16303c; // bone-teal toward the horizon (brightened so a band reads)
const SKY_BOTTOM = 0x050709; // darkest near the waterline
const FOG_COLOR = 0x122c3a; // bone-teal fog (brighter so the distance ghosts visibly)

let fog: THREE.FogExp2 | null = null;
let moon: THREE.DirectionalLight | null = null;
let bgSphere: THREE.Mesh | null = null;

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
