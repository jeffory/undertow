// SILT — the Kelp Graves' drifting particulate (M6, plan 05 §2.1 "drifting silt
// particle layer"). One THREE.Points layer, one draw call, gated to zone 2.
//
// Technique: the same soft radial splat sprite the wake and the splash pool use
// (a bare Points particle renders as a hard square; a 32px radial gradient reads
// as suspended matter). Very low alpha, additive, so it reads as motes catching
// the lantern rather than as snow.
//
// The motes live in a box that TRAVELS WITH THE VIEWER and wraps: a mote that
// drifts out of one face re-enters through the opposite one. That keeps a sparse
// layer looking continuous everywhere on a 220×220 lake without paying for a
// lake-sized particle count. Initial positions and drift velocities come from a
// deterministic hash of the lake seed — no Math.random anywhere.

import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { KELP_ZONE } from '../gen/kelp';

const SILT_COUNT = 360; // sparse — this is atmosphere, not weather
const BOX_XZ = 64; // m — the wrapping box that follows the viewer
const BOX_Y_MIN = 0.15;
const BOX_Y_MAX = 6.5;

const SILT_COLOR = { r: 0.62, g: 0.78, b: 0.74 }; // bone-teal, drained
const SILT_OPACITY = 0.09; // "very low alpha"
const SILT_SIZE = 0.26;

// m/s — slow enough that a mote crosses a metre in several seconds.
const DRIFT_XZ = 0.22;
const DRIFT_Y = 0.05;

let root: THREE.Group | null = null;
let points: THREE.Points | null = null;
let positions: THREE.BufferAttribute | null = null;
let seeded = -1;

// per-mote home offsets + drift velocities (deterministic, seeded once)
const homeX = new Float32Array(SILT_COUNT);
const homeY = new Float32Array(SILT_COUNT);
const homeZ = new Float32Array(SILT_COUNT);
const velX = new Float32Array(SILT_COUNT);
const velY = new Float32Array(SILT_COUNT);
const velZ = new Float32Array(SILT_COUNT);

// Deterministic [0,1) hash — the same integer-lattice shape the driftwood field
// uses in render/lake.ts, so silt reproduces byte-identically for a given seed.
function hash01(seed: number, a: number): number {
  let h = seed >>> 0;
  h = (h ^ Math.imul((a | 0) + 1, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function makeSiltTexture(): THREE.Texture {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = 32;
  const g2d = cnv.getContext('2d')!;
  const grad = g2d.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g2d.fillStyle = grad;
  g2d.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cnv);
}

function seed(lakeSeed: number): void {
  for (let i = 0; i < SILT_COUNT; i++) {
    homeX[i] = (hash01(lakeSeed, i * 6 + 1) - 0.5) * BOX_XZ;
    homeZ[i] = (hash01(lakeSeed, i * 6 + 2) - 0.5) * BOX_XZ;
    homeY[i] = BOX_Y_MIN + hash01(lakeSeed, i * 6 + 3) * (BOX_Y_MAX - BOX_Y_MIN);
    velX[i] = (hash01(lakeSeed, i * 6 + 4) - 0.5) * 2 * DRIFT_XZ;
    velZ[i] = (hash01(lakeSeed, i * 6 + 5) - 0.5) * 2 * DRIFT_XZ;
    velY[i] = (hash01(lakeSeed, i * 6 + 6) - 0.35) * DRIFT_Y;
  }
  seeded = lakeSeed >>> 0;
}

// Wrap `v` into [-half, half) — the travelling box's toroidal fold.
function wrap(v: number, half: number): number {
  const span = half * 2;
  let x = (v + half) % span;
  if (x < 0) x += span;
  return x - half;
}

export function initSilt(scene: THREE.Scene): void {
  root = new THREE.Group();
  root.name = 'silt:root';
  root.renderOrder = 4; // under the ripple telegraphs and the splash foam
  scene.add(root);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SILT_COUNT * 3), 3));
  const colors = new Float32Array(SILT_COUNT * 3);
  for (let i = 0; i < SILT_COUNT; i++) {
    colors[i * 3] = SILT_COLOR.r;
    colors[i * 3 + 1] = SILT_COLOR.g;
    colors[i * 3 + 2] = SILT_COLOR.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  positions = geo.attributes.position as THREE.BufferAttribute;

  const mat = new THREE.PointsMaterial({
    size: SILT_SIZE,
    map: makeSiltTexture(),
    vertexColors: true,
    transparent: true,
    opacity: SILT_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // positions live in the buffer, bounds never computed
  points.name = 'silt:points';
  root.add(points);
  root.visible = false;
}

export function siltRenderState(): { visible: boolean; motes: number; draws: number } {
  const on = !!root && root.visible;
  return { visible: on, motes: on ? SILT_COUNT : 0, draws: on ? 1 : 0 };
}

export function updateSilt(world: WorldState, _dt: number): void {
  if (!root || !points || !positions) return;
  const lake = world.lake;
  const zone = world.run ? world.run.zone : 1;
  // Gated to the Kelp Graves: every other zone pays one boolean a frame.
  if (!lake || zone !== KELP_ZONE) {
    root.visible = false;
    return;
  }
  root.visible = true;
  if (seeded !== (lake.seed >>> 0)) seed(lake.seed);

  const t = world.time.elapsed;
  const cx = world.mode === 'foot' ? world.player.x : world.boat.x;
  const cz = world.mode === 'foot' ? world.player.z : world.boat.z;
  const half = BOX_XZ / 2;
  const ySpan = BOX_Y_MAX - BOX_Y_MIN;

  for (let i = 0; i < SILT_COUNT; i++) {
    const x = cx + wrap(homeX[i]! + velX[i]! * t, half);
    const z = cz + wrap(homeZ[i]! + velZ[i]! * t, half);
    const y = BOX_Y_MIN + wrap(homeY[i]! - BOX_Y_MIN + velY[i]! * t, ySpan / 2) + ySpan / 2;
    positions.setXYZ(i, x, y, z);
  }
  positions.needsUpdate = true;
}
