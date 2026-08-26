// SKY — WORKER A OWNS THIS FILE.
// FogExp2 (dark-teal atmosphere over near-black base), gradient background (a
// large inverted vertex-colored sphere, no textures), cool low-intensity moon
// directional light that rakes the scene, and a faint rotating lighthouse beam
// (additive cone from the lantern room, fog:false, round A). Plain functions +
// module state, vertex colors only, zero textures (plan 01 §3.2, T4). Distant
// islet silhouettes moved to the procedural lake render (M3).
//
// Round A changes (VS QA: night sky + fog atmosphere):
//   - Fog color deepened toward dark teal (palette endpoints live in
//     game/clock.ts skyPaletteForPhase — edited there) and density nudged up.
//   - A faint horizon band is baked into the gradient sphere just above the
//     waterline so the void reads as night sky, not flat grey.
//   - A rotating translucent lighthouse beam (additive, fog:false) sweeps from
//     the lighthouse lantern at the phase-driven sweep rate.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { currentRenderContext } from './renderer';
import {
  phaseAt,
  runElapsedMs,
  skyPaletteForPhase,
  beamSweepHzForPhase,
} from '../game/clock';
import type { ClockPhase } from '../game/clock';

// Palette (spec 8.1 / plan 01 §3.2): dark teal over near-black water base.
const SKY_TOP = 0x080e12; // deep near-black with a hint of teal
const SKY_HORIZON = 0x10222c; // teal toward the horizon (band reads against the fog)
const SKY_BOTTOM = 0x040608; // darkest near the waterline
const FOG_COLOR = 0x0c202a; // dark-teal fog
const HORIZON_BAND_FACTOR = 1.32; // horizon band brightening factor
const HORIZON_BAND_CENTER = 0.04; // local-h center of the band (just above eye level)
const HORIZON_BAND_SIGMA = 0.11; // band width in local-h units
const HORIZON_BAND_STRENGTH = 0.4; // how strongly the band lifts the horizon color

// Lighthouse beam (round A): a soft additive cone sweeping from the lantern room.
const BEAM_COLOR = 0xffe6b0; // warm pale — the lantern's light, additive
const BEAM_OPACITY = 0.07;
const BEAM_RADIUS = 9;
const BEAM_LENGTH = 130;
const BEAM_MIN_LANTERN_Y = 2.5; // lighthouse lantern sits at world y≈3.3; boat/keeper lamps are ≤1.7

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
let curDensity = 0.016;

const tmpTop = new THREE.Color();
const tmpHorizon = new THREE.Color();
const tmpBottom = new THREE.Color();
const tmpFog = new THREE.Color();

// --- lighthouse beam state -----------------------------------------------------
let beamMesh: THREE.Mesh | null = null;
let beamTarget: THREE.Object3D | null = null;
let beamAngle = 0.6;
const UP = new THREE.Vector3(0, 1, 0);
const beamDir = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

function paletteColors(pal: ReturnType<typeof skyPaletteForPhase>): void {
  tmpTop.setRGB(pal.top[0] / 255, pal.top[1] / 255, pal.top[2] / 255);
  tmpHorizon.setRGB(pal.horizon[0] / 255, pal.horizon[1] / 255, pal.horizon[2] / 255);
  tmpBottom.setRGB(pal.bottom[0] / 255, pal.bottom[1] / 255, pal.bottom[2] / 255);
  tmpFog.setRGB(pal.fog[0] / 255, pal.fog[1] / 255, pal.fog[2] / 255);
}

// Shared sky gradient: bottom → horizon up to eye level, then horizon → top,
// plus a faint brightened band hugging the horizon so the far void reads as a
// night sky rather than flat grey. `bandColor` is the brightened horizon tint.
function gradientAt(
  h: number,
  top: THREE.Color,
  horizon: THREE.Color,
  bottom: THREE.Color,
  bandColor: THREE.Color,
  out: THREE.Color,
): void {
  out.lerpColors(bottom, horizon, h * 0.5 + 0.5);
  out.lerp(top, Math.max(0, h) * 0.6);
  const band = Math.exp(-Math.pow((h - HORIZON_BAND_CENTER) / HORIZON_BAND_SIGMA, 2));
  out.lerp(bandColor, band * HORIZON_BAND_STRENGTH);
}

// Paint the gradient sphere's vertex colors from a palette (static at init,
// drifting each frame — same math, so init and update never diverge).
function paintSphere(
  top: THREE.Color,
  horizon: THREE.Color,
  bottom: THREE.Color,
): void {
  if (!bgGeo) return;
  const posAttr = bgGeo.attributes.position as THREE.BufferAttribute;
  const colAttr = bgGeo.attributes.color as THREE.BufferAttribute;
  const band = new THREE.Color().copy(horizon).multiplyScalar(HORIZON_BAND_FACTOR);
  const col = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i) ?? 0;
    const h = THREE.MathUtils.clamp(y / 500, -1, 1);
    gradientAt(h, top, horizon, bottom, band, col);
    colAttr.setXYZ(i, col.r, col.g, col.b);
  }
  colAttr.needsUpdate = true;
}

// Find the lighthouse lantern room: the warm PointLight whose world y is well
// above the boat/keeper lamps (lighthouse group is scaled 0.18 × local y 18.5 ≈
// 3.3; the boat and hand lanterns ride ≤1.7). Re-found lazily after lake rebuilds.
function findBeamTarget(scene: THREE.Scene): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    if ((obj as THREE.PointLight).isPointLight) {
      const y = obj.getWorldPosition(tmpPos).y;
      if (y > BEAM_MIN_LANTERN_Y) found = obj;
    }
  });
  return found;
}

function ensureBeam(scene: THREE.Scene): void {
  if (!beamMesh) {
    const geo = new THREE.ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: BEAM_COLOR,
      transparent: true,
      opacity: BEAM_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    beamMesh = new THREE.Mesh(geo, mat);
    beamMesh.frustumCulled = false;
    beamMesh.name = 'sky:beam';
    scene.add(beamMesh);
  }
}

function updateBeam(scene: THREE.Scene, phase: ClockPhase, dt: number): void {
  // Re-find the lighthouse lantern whenever it has been disposed (new run) or
  // never found yet (lake not built).
  if (beamTarget && !beamTarget.parent) beamTarget = null;
  if (!beamTarget) {
    beamTarget = findBeamTarget(scene);
    if (!beamTarget) return;
    ensureBeam(scene);
  }
  if (!beamMesh) return;

  // Sweep at the phase's beam rate (dusk slow → false-dawn fast).
  beamAngle += beamSweepHzForPhase(phase) * Math.PI * 2 * dt;

  const origin = beamTarget.getWorldPosition(tmpPos);
  beamDir.set(Math.cos(beamAngle), -0.06, Math.sin(beamAngle)).normalize();

  // Apex at the lantern, base sweeping outward along beamDir. mesh.position is
  // the cone's midpoint.
  beamMesh.position.copy(origin).addScaledVector(beamDir, BEAM_LENGTH / 2);
  beamMesh.quaternion.setFromUnitVectors(UP, beamDir.clone().negate());
}

export function initSky(scene: THREE.Scene): void {
  // --- Gradient background via a large inverted vertex-colored sphere ---
  // Radius is big enough that even the far camera never clips it; faces point
  // inward (scale -1 flips winding). No textures. 32×24 so the horizon band
  // has enough vertical resolution to stay smooth.
  const bgeo = new THREE.SphereGeometry(500, 32, 24);
  const bpos = bgeo.attributes.position as THREE.BufferAttribute;
  const bcolors = new Float32Array(bpos.count * 3);
  bgeo.setAttribute('color', new THREE.BufferAttribute(bcolors, 3));
  const bmat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  bgSphere = new THREE.Mesh(bgeo, bmat);
  bgSphere.scale.set(-1, 1, 1); // invert → render the inside
  bgSphere.name = 'sky:dome';
  scene.add(bgSphere);
  bgGeo = bgeo;

  // --- FogExp2 ---
  fog = new THREE.FogExp2(FOG_COLOR, 0.016);
  scene.fog = fog;
  scene.background = new THREE.Color(FOG_COLOR);

  // --- Moon directional light ---
  // Cool, low intensity, raking down from a low angle so it grazes the water
  // and islet silhouettes. Positioned high-ish and far off-axis; direction is
  // from position toward origin.
  moon = new THREE.DirectionalLight(0x9db8d4, 1.1);
  moon.position.set(-12, 16, -10);
  moon.target.position.set(0, 0, 0);
  moon.name = 'sky:moon';
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
  // (same per-vertex math as init, cheap for the 32×24 sphere).
  if (bgGeo) {
    paintSphere(curTop, curHorizon, curBottom);
  }

  // Lighthouse beam (fog:false so it cuts through the distance haze).
  if (ctx) {
    updateBeam(ctx.scene, phase, dt);
  }
}