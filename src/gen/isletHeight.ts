// ISLET HEIGHT — deterministic per-islet terrain height field (CRITICAL round B,
// task t2). Pure and three-free (like lakeMap): given an Islet,
// `isletHeightAt(iso, x, z)` returns the ground height offset in metres above
// the waterline at a world point. The render islet mesh (render/lake.ts) and the
// entity grounding (player / fish / tether-line / props) BOTH sample this same
// function, so feet meet the terrain exactly.
//
// Shape: the shoreline rim sits at ~0 m (waterline), the height rises toward the
// interior to a per-islet peak in the 0.3-0.9 m band (the "rising toward the
// center" mandate), and a low-amplitude seeded value-noise bump perturbs the
// dome so the surface reads as craggy faceted rock rather than a smooth cone.
// Everything is a pure function of the Islet data (id + center), so the field
// is byte-identical across runs, pages, and render passes — and the walkable
// polygon collision contract is untouched (this file never reads the hull).

import type { Islet } from './lakeMap';

// Tuning (the CRITICAL bar: "craggy, faceted slate-rock islets ... stepped
// height, readable shoreline"). Interior rise is deliberately gentle so combat
// readability holds — a docked player moves across at most ~0.9 m of relief.
export const ISLET_RISE_MIN = 0.35; // metres of interior rise (low end of the band)
export const ISLET_RISE_MAX = 0.85; // metres of interior rise (high end of the band)
const NOISE_CELLS = 2.4; // value-noise lattice cells across the islet radius
const NOISE_OCTAVES = 3; // fBm octaves (each 0.5 amplitude of the last)
const DOME_POW = 1.45; // radial falloff: ~1 at centre → 0 at the rim
const NOISE_MIX = 0.28; // how much the noise perturbs the dome (0 = smooth dome)

// --- deterministic hash → [0,1). Integer lattice only (cell coords are ints),
// so the same (seed, cell) always yields the same value on every platform.
function hash2(seed: number, x: number, z: number): number {
  let h = seed >>> 0;
  h = (h ^ Math.imul(x | 0, 0x27d4eb2d)) >>> 0;
  h = (h ^ Math.imul(z | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Bilinear value noise at lattice-space (x, z): 0..1.
function valueNoise(seed: number, x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = smoothstep(x - xi);
  const zf = smoothstep(z - zi);
  const v00 = hash2(seed, xi, zi);
  const v10 = hash2(seed, xi + 1, zi);
  const v01 = hash2(seed, xi, zi + 1);
  const v11 = hash2(seed, xi + 1, zi + 1);
  const a = v00 + (v10 - v00) * xf;
  const b = v01 + (v11 - v01) * xf;
  return a + (b - a) * zf;
}

// fBm → roughly -1..1. Octave frequency doubles, amplitude halves.
function fbm(seed: number, x: number, z: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < NOISE_OCTAVES; o++) {
    sum += (valueNoise(seed ^ (o * 0x9e3779b1), x * f, z * f) - 0.5) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return norm > 0 ? (sum / norm) * 2 : 0;
}

// A stable 32-bit seed folded from the islet's own data: id + centre. Two
// lakes with the same islet id but different centres get different terrain.
export function isletHeightSeed(iso: Islet): number {
  let h = Math.imul(iso.id + 1, 0x9e3779b1);
  h = (h ^ Math.imul(Math.round((iso.center.x + 120) * 1000), 0x85ebca6b)) >>> 0;
  h = (h ^ Math.imul(Math.round((iso.center.z + 120) * 1000), 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h >>> 0;
}

// Deterministic [0, 1) from an islet's seed plus two ints — for scattering
// props (rocks) around a shoreline reproducibly.
export function isletHash01(iso: Islet, a: number, b: number): number {
  let h = isletHeightSeed(iso) >>> 0;
  h = (h ^ Math.imul((a | 0) + 1, 0x27d4eb2d)) >>> 0;
  h = (h ^ Math.imul((b | 0) + 1, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Furthest polygon vertex from the islet centre — the field's rim radius.
export function isletMaxRadius(iso: Islet): number {
  let m = 0;
  for (const v of iso.poly) {
    const d = Math.hypot(v.x - iso.center.x, v.z - iso.center.z);
    if (d > m) m = d;
  }
  return m;
}

// Per-islet peak rise in metres (deterministic, within the 0.3-0.9 band).
export function isletPeakRise(iso: Islet): number {
  return ISLET_RISE_MIN + (ISLET_RISE_MAX - ISLET_RISE_MIN) * hash2(isletHeightSeed(iso), 999, 999);
}

// Ground height offset (m) above the waterline at (x, z) on islet `iso`.
// 0 on the shoreline rim; rises toward the interior. Points beyond the rim
// (r > max vertex radius) clamp to the rim height (0) — so a fish or player
// dragged past the shore into the water reads as at the waterline, never
// sinking or floating above the shore line.
export function isletHeightAt(iso: Islet, x: number, z: number): number {
  const seed = isletHeightSeed(iso);
  const maxR = isletMaxRadius(iso);
  if (maxR <= 1e-4) return 0;
  const dx = x - iso.center.x;
  const dz = z - iso.center.z;
  const r = Math.hypot(dx, dz);
  const t = Math.min(1, r / maxR); // 0 centre, 1 rim
  const dome = Math.pow(Math.max(0, 1 - t), DOME_POW);
  const n = fbm(seed, (dx / maxR) * NOISE_CELLS, (dz / maxR) * NOISE_CELLS);
  const h = dome * isletPeakRise(iso) * (1 + n * NOISE_MIX);
  return h > 0 ? h : 0;
}