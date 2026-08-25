// SKY — WORKER A OWNS THIS FILE.
// FogExp2 (Shallows: bone-teal over near-black base), gradient background (a
// large inverted vertex-colored sphere, no textures), cool low-intensity moon
// directional light that rakes the scene. Plain functions + module state,
// vertex colors only, zero textures (plan 01 §3.2, T4). Distant islet
// silhouettes moved to the procedural lake render (M3).

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from './renderer';
import { phaseAt, runElapsedMs, skyPaletteForPhase } from '../game/clock';
import type { ClockPhase } from '../game/clock';

// Palette (spec 8.1 / plan 01 §3.2): bone-teal over near-black water base.
const SKY_TOP = 0x0a1418; // deep near-black with a hint of teal
const SKY_HORIZON = 0x16303c; // bone-teal toward the horizon (brightened so a band reads)
const SKY_BOTTOM = 0x050709; // darkest near the waterline
const FOG_COLOR = 0x122c3a; // bone-teal fog (brighter so the distance ghosts visibly)

let fog: THREE.FogExp2 | null = null;
let moon: THREE.DirectionalLight | null = null;
let bgSphere: THREE.Mesh | null = null;
let bgGeo: THREE.BufferGeometry | null = null;

// Night Clock phase lerp state (03 §5.2): the sky/fog palette drifts toward the
// current phase's palette — dusk bone-teal → night near-black → deep-night +blue
// fog → false-dawn pale. Values persist so the lerp is smooth.
let curTop = new THREE.Color(SKY_TOP);
let curHorizon = new THREE.Color(SKY_HORIZON);
let curBottom = new THREE.Color(SKY_BOTTOM);
let curFog = new THREE.Color(FOG_COLOR);
let curDensity = 0.015;

const tmpTop = new THREE.Color();
const tmpHorizon = new THREE.Color();
const tmpBottom = new THREE.Color();
const tmpFog = new THREE.Color();

function paletteColors(pal: ReturnType<typeof skyPaletteForPhase>): void {
  tmpTop.setRGB(pal.top[0] / 255, pal.top[1] / 255, pal.top[2] / 255);
  tmpHorizon.setRGB(pal.horizon[0] / 255, pal.horizon[1] / 255, pal.horizon[2] / 255);
  tmpBottom.setRGB(pal.bottom[0] / 255, pal.bottom[1] / 255, pal.bottom[2] / 255);
  tmpFog.setRGB(pal.fog[0] / 255, pal.fog[1] / 255, pal.fog[2] / 255);
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
  bgGeo = bgeo;

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

export function updateSky(world: WorldState, dt: number): void {
  // Keep the gradient sphere centered on the camera so it never falls behind.
  const ctx = currentRenderContext();
  if (bgSphere && ctx) {
    bgSphere.position.copy(ctx.camera.position);
  }

  // Night Clock palette drift (03 §5.2). The phase is a pure function of
  // run-relative elapsed; the palette is a per-phase endpoint we lerp toward.
  const phase: ClockPhase = world.run
    ? phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed))
    : 'dusk';
  paletteColors(skyPaletteForPhase(phase));
  const k = 1 - Math.exp(-dt * 1.4);
  curTop.lerp(tmpTop, k);
  curHorizon.lerp(tmpHorizon, k);
  curBottom.lerp(tmpBottom, k);
  curFog.lerp(tmpFog, k);
  curDensity += (skyPaletteForPhase(phase).fogDensity - curDensity) * k;

  if (fog) {
    fog.color.copy(curFog);
    fog.density = curDensity;
  }

  // Rewrite the gradient sphere's vertex colors from the drifting palette
  // (same per-vertex math as init, cheap for the 16×12 sphere).
  if (bgGeo && ctx) {
    const posAttr = bgGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = bgGeo.attributes.color as THREE.BufferAttribute;
    const col = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i) ?? 0;
      const h = THREE.MathUtils.clamp(y / 500, -1, 1);
      col.lerpColors(curBottom, curHorizon, h * 0.5 + 0.5);
      col.lerp(curTop, Math.max(0, h) * 0.6);
      colAttr.setXYZ(i, col.r, col.g, col.b);
    }
    colAttr.needsUpdate = true;
  }
}
