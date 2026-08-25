// NIGHT CLOCK — tests-first (plan 03 §5, task t12 #3). The phase() function is
// a pure function of run-relative elapsed sim-time, so it is trivially
// timescale-invariant (elapsed advances N× under ?timescale, phase only sees
// the accumulated sim-time). Pins the exact phase boundaries, per-phase Dread
// multipliers, beam sweep, and the false-dawn buoy submergence order.

import { describe, it, expect } from 'vitest';
import {
  PHASE_ORDER,
  PHASE_LENGTH_MS,
  PHASE_LENGTH_S,
  phaseAt,
  phaseIndex,
  phaseProgress,
  dreadMultForPhase,
  beamSweepHzForPhase,
  skyPaletteForPhase,
  buoySinkProgress,
  createClock,
  runElapsedMs,
} from '../../src/game/clock';

const MS = PHASE_LENGTH_MS;

describe('clock phase derivation (exact boundaries)', () => {
  it('dusk opens the run and covers [0, 8min)', () => {
    expect(phaseAt(0)).toBe('dusk');
    expect(phaseAt(1)).toBe('dusk');
    expect(phaseAt(MS - 1)).toBe('dusk');
  });

  it('night begins at exactly 8min and ends at 16min', () => {
    expect(phaseAt(MS)).toBe('night');
    expect(phaseAt(MS + 1)).toBe('night');
    expect(phaseAt(2 * MS - 1)).toBe('night');
  });

  it('deep night begins at exactly 16min', () => {
    expect(phaseAt(2 * MS)).toBe('deepNight');
    expect(phaseAt(2 * MS + 1)).toBe('deepNight');
    expect(phaseAt(3 * MS - 1)).toBe('deepNight');
  });

  it('false dawn begins at exactly 24min and holds past the 4th phase', () => {
    expect(phaseAt(3 * MS)).toBe('falseDawn');
    expect(phaseAt(4 * MS)).toBe('falseDawn'); // the run can overstay — still false dawn
    expect(phaseAt(10 * MS)).toBe('falseDawn');
  });

  it('negative elapsed (clock not yet started) reads as dusk', () => {
    expect(phaseAt(-1000)).toBe('dusk');
  });

  it('phaseIndex is a monotonic integer 0..3 over the phases', () => {
    expect(phaseIndex(0)).toBe(0);
    expect(phaseIndex(MS)).toBe(1);
    expect(phaseIndex(2 * MS)).toBe(2);
    expect(phaseIndex(3 * MS)).toBe(3);
    expect(phaseIndex(4 * MS)).toBe(3); // capped at the final phase
  });

  it('phaseProgress is 0..1 within a phase', () => {
    expect(phaseProgress(0)).toBe(0);
    expect(phaseProgress(MS / 2)).toBeCloseTo(0.5, 9);
    expect(phaseProgress(MS)).toBe(0); // the next phase begins at 0
  });
});

describe('clock timescale invariance', () => {
  it('phase is a pure function of sim elapsed — identical whether sim ran at 1x or 10x', () => {
    // two "runs" that reach the same sim elapsed via different step accumulation
    let t1 = 0;
    for (let i = 0; i < 600; i++) t1 += 1 / 60; // 10s of sim at 1x
    let t2 = 0;
    for (let i = 0; i < 600; i++) t2 += 10 * (1 / 60); // same 10s of sim at 10x
    expect(phaseAt(t1 * 1000)).toBe(phaseAt(t2 * 1000));
    expect(phaseAt(t1 * 1000)).toBe(phaseAt(10000));

    // long-run equivalence: a 20-min sim run produces deep night either way
    expect(phaseAt(20 * 60 * 1000)).toBe('deepNight');
  });

  it('createClock stores the epoch (ms)', () => {
    const clock = createClock(120500);
    expect(clock.runStartMs).toBe(120500);
    expect(clock.phaseLengthMs).toBe(PHASE_LENGTH_MS);
  });

  it('phase derives from run-relative elapsed (elapsed − start), floored at 0', () => {
    const startedAt = 120.5; // run began at sim t = 120.5s
    const elapsed = startedAt + 8 * 60 + 0.5; // 8min + 0.5s into the run
    expect(phaseAt(runElapsedMs(startedAt, elapsed))).toBe('night');
    expect(runElapsedMs(startedAt, startedAt - 10)).toBe(0); // before the epoch
  });
});

describe('clock phase effects (plan §5.3)', () => {
  it('dread multiplier is 1.0 at dusk and 1.25 at night and beyond', () => {
    expect(dreadMultForPhase('dusk')).toBe(1.0);
    expect(dreadMultForPhase('night')).toBe(1.25);
    expect(dreadMultForPhase('deepNight')).toBe(1.25);
    expect(dreadMultForPhase('falseDawn')).toBe(1.25);
  });

  it('beam sweep accelerates from dusk to false dawn', () => {
    const hz = PHASE_ORDER.map(beamSweepHzForPhase);
    expect(hz[0]).toBeCloseTo(0.05, 9);
    expect(hz[3]).toBeCloseTo(0.25, 9);
    for (let i = 1; i < hz.length; i++) expect(hz[i]!).toBeGreaterThan(hz[i - 1]!);
  });

  it('sky palette lerps dusk teal → deep-night near-black → false-dawn pale', () => {
    const dusk = skyPaletteForPhase('dusk');
    const deep = skyPaletteForPhase('deepNight');
    const dawn = skyPaletteForPhase('falseDawn');
    // deep night is darkest (lowest luminance on the horizon channel)
    const lum = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;
    expect(lum(deep.horizon)).toBeLessThan(lum(dusk.horizon));
    // false dawn is paler than deep night
    expect(lum(dawn.horizon)).toBeGreaterThan(lum(deep.horizon));
    // dusk fog is bone-teal (blue > red)
    expect(dusk.fog[2]).toBeGreaterThan(dusk.fog[0]!);
  });
});

describe('false-dawn buoy submergence (plan §5.3)', () => {
  it('secondary submerges at false-dawn start; primary 90s later', () => {
    // both above water before false dawn
    expect(buoySinkProgress(false, -1)).toBe(0);
    expect(buoySinkProgress(true, -1)).toBe(0);
    // secondary starts sinking at false-dawn start and is fully down after 45s
    expect(buoySinkProgress(false, 1)).toBeGreaterThan(0);
    expect(buoySinkProgress(false, 45)).toBe(1);
    // primary waits 90s, then sinks over 45s
    expect(buoySinkProgress(true, 89)).toBe(0);
    expect(buoySinkProgress(true, 91)).toBeGreaterThan(0);
    expect(buoySinkProgress(true, 135)).toBe(1);
  });

  it('sink progress is monotonic and clamped to [0,1]', () => {
    const secondary = [0, 10, 30, 45, 200].map((t) => buoySinkProgress(false, t));
    for (let i = 1; i < secondary.length; i++) {
      expect(secondary[i]!).toBeGreaterThanOrEqual(secondary[i - 1]!);
    }
    expect(buoySinkProgress(false, 500)).toBe(1);
  });
});