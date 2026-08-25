// Waves — pure Gerstner wave math (plan 01 §3.2, T6). No three, no DOM.
// Single source of truth for the wave table: the CPU-side waterHeightAt()
// samples the same Gerstner sum the water vertex shader renders, and the GLSL
// generators emit the same constants, so CPU and GPU can never drift.
// Split out of render/water.ts so game logic (and Node unit tests) can import
// the wave math without pulling in three.

export interface GerstnerWave {
  direction: number; // radians in the XZ plane (0 = +X, PI/2 = +Z)
  wavelength: number; // world units
  amplitude: number; // world units
  speed: number; // phase speed, world units / s
  steepness: number; // q (0..1): horizontal displacement amp = q * amplitude
}

// --- Gerstner wave parameter table ---
//  dir(rad) | λ |  A   |  c  |  q
//    0.4    | 42| 0.55 | 2.0 | 0.90
//    2.0    | 28| 0.40 | 1.6 | 0.85
//    4.5    | 18| 0.28 | 3.2 | 0.70
// Non-self-intersection requires Σ q·A·k < 1; here it sums to ~0.22, so no pinching.
export const WAVES: GerstnerWave[] = [
  { direction: 0.4, wavelength: 42, amplitude: 0.55, speed: 2.0, steepness: 0.9 },
  { direction: 2.0, wavelength: 28, amplitude: 0.4, speed: 1.6, steepness: 0.85 },
  { direction: 4.5, wavelength: 18, amplitude: 0.28, speed: 3.2, steepness: 0.7 },
];

// Peak surface height = Σ amplitudes (~1.23). The shader's crest-accent and
// foam thresholds are expressed as fractions of this so they stay coupled to
// the wave table (single source of truth for the wave constants).
export const WAVE_MAX_HEIGHT = WAVES.reduce((s, w) => s + w.amplitude, 0);

export function wavenumber(wavelength: number): number {
  return (2 * Math.PI) / wavelength;
}

// GLSL const declarations for the wave table (K, A, Q, C, and unit direction D
// in the XZ plane). Generated from WAVES so shader and CPU never drift.
export function waveConstsGlsl(): string {
  return WAVES.map((w, i) => {
    const dx = Math.sin(w.direction);
    const dz = Math.cos(w.direction);
    return [
      `const float K_${i} = ${wavenumber(w.wavelength).toFixed(6)};`,
      `const float A_${i} = ${w.amplitude.toFixed(4)};`,
      `const float Q_${i} = ${w.steepness.toFixed(4)};`,
      `const float C_${i} = ${w.speed.toFixed(4)};`,
      `const vec2 D_${i} = vec2(${dx.toFixed(6)}, ${dz.toFixed(6)});`,
    ].join('\n');
  }).join('\n');
}

// One unrolled Gerstner step per wave: displaces `transformed` (x = horizontal
// along the wave, y = height, z = horizontal along the wave), accumulates the
// height for the depth gradient, and builds the analytic surface derivatives
// dPdx/dPdz used for the normal (so moon/lantern Lambert actually shades the
// wave slopes). f = k·(D·P) - k·c·t  (phase speed c, ω = k·c).
export function waveBodyGlsl(): string {
  return WAVES.map((_, i) => `
  {
    float f_${i} = K_${i} * (D_${i}.x * transformed.x + D_${i}.y * transformed.z) - K_${i} * C_${i} * uTime;
    float s_${i} = sin(f_${i});
    float c_${i} = cos(f_${i});
    transformed.x += Q_${i} * A_${i} * D_${i}.x * c_${i};
    transformed.y += A_${i} * s_${i};
    transformed.z += Q_${i} * A_${i} * D_${i}.y * c_${i};
    height += A_${i} * s_${i};
    float qs_${i} = Q_${i} * A_${i} * K_${i} * s_${i};
    float ak_${i} = A_${i} * K_${i} * c_${i};
    dPdx.x += -qs_${i} * D_${i}.x * D_${i}.x;
    dPdx.y += ak_${i} * D_${i}.x;
    dPdx.z += -qs_${i} * D_${i}.x * D_${i}.y;
    dPdz.x += -qs_${i} * D_${i}.y * D_${i}.x;
    dPdz.y += ak_${i} * D_${i}.y;
    dPdz.z += -qs_${i} * D_${i}.y * D_${i}.y;
  }`).join('\n');
}

// CPU-side surface height for the same Gerstner sum the vertex shader renders —
// the boat worker bobs the hull on this. Same constants as WAVES (single source
// of truth); only the height term, since horizontal displacement doesn't lift.
export function waterHeightAt(x: number, z: number, timeSeconds: number): number {
  let h = 0;
  for (const w of WAVES) {
    const k = wavenumber(w.wavelength);
    const f = k * (Math.sin(w.direction) * x + Math.cos(w.direction) * z) - k * w.speed * timeSeconds;
    h += w.amplitude * Math.sin(f);
  }
  return h;
}
