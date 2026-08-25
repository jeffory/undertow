// NIGHT CLOCK (game) — plan 03 §5, task t12 #3. The 4-phase run clock:
// dusk → night → deep night → false dawn, 8 min each. `phaseAt` is a PURE
// function of run-relative elapsed sim-time — no event queue, no mutation, so
// it is trivially serializable and trivially timescale-invariant (elapsed
// advances N× under ?timescale, phase only ever reads the accumulated sim-time).
// One-shots (buoy submergence) are derived by comparing prev/next phase.
//
// Pure logic: no `three` imports.

export type ClockPhase = 'dusk' | 'night' | 'deepNight' | 'falseDawn';

export const PHASE_ORDER: ClockPhase[] = ['dusk', 'night', 'deepNight', 'falseDawn'];

export const PHASE_LENGTH_MS = 8 * 60 * 1000; // 8 min per phase (plan §5.3 "8-10 min", task t12 #3 "8min")
export const PHASE_LENGTH_S = 8 * 60;

export interface NightClock {
  runStartMs: number; // world.time.elapsed (seconds→ms) at run start — set once per run
  phaseLengthMs: number;
}

export function createClock(runStartMs: number, phaseLengthMs = PHASE_LENGTH_MS): NightClock {
  return { runStartMs, phaseLengthMs };
}

// Run-relative elapsed in ms, floored at 0 (the clock has not started).
export function runElapsedMs(runStartedAtS: number, elapsedS: number): number {
  return Math.max(0, (elapsedS - runStartedAtS) * 1000);
}

// 0..3, capped at the final phase (the run can overstay; false dawn holds).
export function phaseIndex(elapsedMs: number, phaseLengthMs = PHASE_LENGTH_MS): number {
  if (elapsedMs < 0) return 0;
  const i = Math.floor(elapsedMs / phaseLengthMs);
  return Math.min(3, i);
}

export function phaseAt(elapsedMs: number, phaseLengthMs = PHASE_LENGTH_MS): ClockPhase {
  return PHASE_ORDER[phaseIndex(elapsedMs, phaseLengthMs)]!;
}

// 0..1 within the current phase.
export function phaseProgress(elapsedMs: number, phaseLengthMs = PHASE_LENGTH_MS): number {
  const i = phaseIndex(elapsedMs, phaseLengthMs);
  return (elapsedMs - i * phaseLengthMs) / phaseLengthMs;
}

// --- phase effects (plan §5.3) -------------------------------------------------

export function dreadMultForPhase(phase: ClockPhase): number {
  return phase === 'dusk' ? 1.0 : 1.25; // night+ escalates all Dread gains
}

export function beamSweepHzForPhase(phase: ClockPhase): number {
  switch (phase) {
    case 'dusk': return 0.05;
    case 'night': return 0.1;
    case 'deepNight': return 0.18;
    case 'falseDawn': return 0.25;
  }
}

// --- sky palette per phase (render consumes; values are [r,g,b] 0..255) --------
export interface SkyPalette {
  top: [number, number, number];
  horizon: [number, number, number];
  bottom: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
}

// dusk bone-teal → night near-black → deep night +blue fog → false dawn pale
export function skyPaletteForPhase(phase: ClockPhase): SkyPalette {
  switch (phase) {
    case 'dusk':
      return {
        top: [10, 20, 24],
        horizon: [22, 48, 60],
        bottom: [5, 7, 9],
        fog: [18, 44, 58],
        fogDensity: 0.015,
      };
    case 'night':
      return {
        top: [6, 10, 14],
        horizon: [14, 28, 40],
        bottom: [3, 4, 6],
        fog: [12, 26, 38],
        fogDensity: 0.018,
      };
    case 'deepNight':
      return {
        top: [3, 5, 9],
        horizon: [8, 16, 28],
        bottom: [2, 3, 5],
        fog: [8, 20, 34],
        fogDensity: 0.022,
      };
    case 'falseDawn':
      return {
        top: [20, 26, 32],
        horizon: [40, 58, 70],
        bottom: [10, 14, 18],
        fog: [36, 52, 66],
        fogDensity: 0.014,
      };
  }
}

// --- false-dawn buoy submergence (plan §5.3) -----------------------------------
// At false-dawn start the secondary buoy sinks over 45s; the primary waits 90s
// then sinks over 45s. If both go under you cannot extract — the overstay
// pressure. `falseDawnElapsedS` is seconds into the false-dawn phase.
export const SECONDARY_SUBMERGE_DELAY_S = 0;
export const PRIMARY_SUBMERGE_DELAY_S = 90;
export const SUBMERGE_DURATION_S = 45;

export function buoySinkProgress(primary: boolean, falseDawnElapsedS: number): number {
  if (falseDawnElapsedS < 0) return 0;
  const delay = primary ? PRIMARY_SUBMERGE_DELAY_S : SECONDARY_SUBMERGE_DELAY_S;
  const t = (falseDawnElapsedS - delay) / SUBMERGE_DURATION_S;
  return Math.max(0, Math.min(1, t));
}