// THE CHOIR — render (M8, plan 05 §2.3 / spec §8.1 "Choir is emissive points on
// black"). The only thing visible in the void, and the only thing the darkness
// gate deliberately does NOT suppress: they are not lit geometry, they are light.
//
// TECHNIQUE — the buoy-lantern halo, pooled. render/lake.ts buys a caged buoy
// lantern with a soft additive radial splat; render/silt.ts buys a whole drifting
// particulate layer with the same splat on a single THREE.Points. This is both:
// ONE shared canvas texture, TWO Points layers over ONE position buffer —
//
//   • the HALO layer: big, faint, cold — the bloom around each voice;
//   • the CORE layer: small, bright — the voice itself.
//
// TWO DRAW CALLS for the entire choir, which is the round's whole perf budget
// for it ("motes 1-2 draws"). No lights, no meshes, no per-mote objects.
//
// `fog: false` on both materials is the load-bearing flag: zone 4's fog is
// near-total by 20 m, and a mote that respected it would be swallowed at exactly
// the distance the design needs it visible from. "They are visible at any
// distance (they are light)" is one boolean, in the right place.
//
// Positions come from gen/choir.ts, which is pure and deterministic in (lake
// seed, index, time) — so the same seed hangs the same lights in the same water,
// and a test can assert the field without a GPU.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { CHOIR_ZONE } from '../core/zones';
import { CHOIR_MOTE_COUNT, choirMoteAt } from '../gen/choir';
import { choirDim } from '../bosses/marensEcho';

// Cold blue-green — the one colour in the game that is neither the lantern's
// sodium nor the water's bone-teal. Bioluminescence, not lamplight.
const CORE_COLOR = { r: 0.62, g: 1.0, b: 0.92 };
const HALO_COLOR = { r: 0.24, g: 0.66, b: 0.7 };

const CORE_SIZE = 0.42;
const HALO_SIZE = 2.6;
const CORE_OPACITY = 0.95;
const HALO_OPACITY = 0.3;

// The breath: every mote pulses on its own phase, slowly, so the field never
// blinks in unison.
const PULSE_HZ = 0.21;

// A verse (systems/choir.ts) flares the mote that sang for this long. It is the
// only feedback the sing event has until the audio worker lands, and it is what
// makes the screenshot of the void show a choir rather than a starfield.
const SING_FLARE_SECONDS = 2.4;
const SING_FLARE_GAIN = 1.9;

let root: THREE.Group | null = null;
let core: THREE.Points | null = null;
let halo: THREE.Points | null = null;
let positions: THREE.BufferAttribute | null = null;
let coreColors: THREE.BufferAttribute | null = null;
let haloColors: THREE.BufferAttribute | null = null;
let splat: THREE.CanvasTexture | null = null;

function makeSplat(): THREE.CanvasTexture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const g = cnv.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cnv);
}

function makeLayer(
  geo: THREE.BufferGeometry,
  size: number,
  opacity: number,
  name: string,
): THREE.Points {
  const mat = new THREE.PointsMaterial({
    size,
    map: splat,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // THE flag: they are light, so the void's fog does not get to eat them.
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; // positions live in the buffer; bounds never computed
  pts.name = name;
  return pts;
}

export function initChoir(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'choir:root';
  root.renderOrder = 6; // over the water and the ripple rings; it is the far field
  scene.add(root);

  splat = makeSplat();

  // ONE position buffer, TWO geometries pointing at it — the halo and the core
  // are the same forty points, drawn at two sizes.
  const pos = new THREE.BufferAttribute(new Float32Array(CHOIR_MOTE_COUNT * 3), 3);
  positions = pos;
  coreColors = new THREE.BufferAttribute(new Float32Array(CHOIR_MOTE_COUNT * 3), 3);
  haloColors = new THREE.BufferAttribute(new Float32Array(CHOIR_MOTE_COUNT * 3), 3);

  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', pos);
  coreGeo.setAttribute('color', coreColors);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', pos);
  haloGeo.setAttribute('color', haloColors);

  halo = makeLayer(haloGeo, HALO_SIZE, HALO_OPACITY, 'choir:halo');
  core = makeLayer(coreGeo, CORE_SIZE, CORE_OPACITY, 'choir:core');
  root.add(halo);
  root.add(core);
  root.visible = false;
}

/** Probe/gate readout: what the Choir costs and shows right now. */
export function choirRenderState(): {
  visible: boolean;
  motes: number;
  draws: number;
  singing: number;
  dim: number;
} {
  const on = !!root && root.visible;
  return {
    visible: on,
    motes: on ? CHOIR_MOTE_COUNT : 0,
    draws: on ? 2 : 0,
    singing: lastSinger,
    dim: lastDim,
  };
}

let lastSinger = -1;
// THE choirDim SEAM (M8 boss, plan 05 §2.3: "the choir motes dim slightly while
// she holds"). One multiplier on the per-mote gain, sourced from her state — so
// the void drops its voices back while Maren's Echo is on the line, the way a
// room goes quiet when someone who matters walks into it. Exactly 1 whenever she
// is not in the water, which is what keeps a Choir without her byte-identical.
let lastDim = 1;

/** Where a mote is right now, in world space — the probe's screenshot anchor. */
export function choirMoteWorld(
  world: WorldState,
  index: number,
): { x: number; y: number; z: number } | null {
  const lake = world.lake;
  if (!lake) return null;
  const m = choirMoteAt(lake.seed, index, world.time.elapsed);
  return { x: m.x, y: m.y, z: m.z };
}

export function updateChoir(world: WorldState, _dt: number): void {
  if (!root || !positions || !coreColors || !haloColors) return;
  const lake = world.lake;
  const zone = world.run ? world.run.zone : 1;
  // Gated to the Choir: every other zone pays one boolean a frame.
  if (!lake || zone !== CHOIR_ZONE) {
    root.visible = false;
    lastSinger = -1;
    return;
  }
  root.visible = true;

  const t = world.time.elapsed;
  const sang = world.choir;
  const flare =
    sang.lastAt >= 0 && t - sang.lastAt < SING_FLARE_SECONDS
      ? 1 - (t - sang.lastAt) / SING_FLARE_SECONDS
      : 0;
  lastSinger = flare > 0 ? sang.lastMote : -1;
  lastDim = choirDim(world.marensEcho);

  for (let i = 0; i < CHOIR_MOTE_COUNT; i++) {
    const m = choirMoteAt(lake.seed, i, t);
    positions.setXYZ(i, m.x, m.y, m.z);

    // The breath — a slow sine on the mote's own phase, never in unison.
    const pulse = 0.72 + 0.28 * Math.sin((t * PULSE_HZ + m.phase) * Math.PI * 2);
    // …and the flare, when this is the mote that just sang.
    const gain =
      m.brightness * pulse * (i === lastSinger ? 1 + SING_FLARE_GAIN * flare : 1) * lastDim;
    coreColors.setXYZ(i, CORE_COLOR.r * gain, CORE_COLOR.g * gain, CORE_COLOR.b * gain);
    haloColors.setXYZ(i, HALO_COLOR.r * gain, HALO_COLOR.g * gain, HALO_COLOR.b * gain);
  }
  positions.needsUpdate = true;
  coreColors.needsUpdate = true;
  haloColors.needsUpdate = true;
}
