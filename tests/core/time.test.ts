import { describe, it, expect } from 'vitest';
import {
  createTime,
  advanceClock,
  frameSimSteps,
  parseTimescale,
  FIXED_DT,
  MAX_STEPS_PER_FRAME,
  MAX_TIMESCALE,
} from '../../src/core/time';

describe('Time (fixed-timestep clock)', () => {
  it('three 16.7ms frames yield three steps at 1/60', () => {
    const t = createTime();
    advanceClock(t, 1000); // first call only primes lastReal
    const steps = [16.7, 33.4, 50.1].map((ms) => advanceClock(t, 1000 + ms));
    expect(steps).toEqual([1, 1, 1]);
    // 3 steps * 1/60 = 0.05s simulated
    expect(t.elapsed).toBeCloseTo(3 * FIXED_DT, 10);
  });

  it('accumulates leftover time across frames', () => {
    const t = createTime();
    advanceClock(t, 1000);
    // 10ms per frame: under one step each, accumulates to one step by frame 2
    expect(advanceClock(t, 1010)).toBe(0);
    expect(advanceClock(t, 1020)).toBe(1); // 20ms total ≥ 16.67ms
    expect(advanceClock(t, 1030)).toBe(0);
  });

  it('a 200ms spike does not explode — clamped to MAX_STEPS_PER_FRAME', () => {
    const t = createTime();
    advanceClock(t, 1000);
    const steps = advanceClock(t, 1200);
    expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(steps).toBe(MAX_STEPS_PER_FRAME); // 200ms ≫ 5 steps worth, hits the cap
    // simulated time is capped, not a catch-up avalanche
    expect(t.elapsed).toBeCloseTo(MAX_STEPS_PER_FRAME * FIXED_DT, 10);
  });

  it('a huge multi-second stall also caps at MAX_STEPS_PER_FRAME', () => {
    const t = createTime();
    advanceClock(t, 1000);
    const steps = advanceClock(t, 6000);
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
    // the accumulator is not carrying a backlog into the next frame
    expect(t.accumulator).toBeLessThan(FIXED_DT);
  });

  it('step property reflects the current frame step count', () => {
    const t = createTime();
    advanceClock(t, 1000);
    advanceClock(t, 1100);
    expect(t.step).toBe(MAX_STEPS_PER_FRAME);
    advanceClock(t, 1116.7);
    expect(t.step).toBe(1);
  });
});

describe('timescale hook (plan 06 "Gate-driver speed")', () => {
  it('defaults to 1 and is ignored without ?debug', () => {
    expect(parseTimescale('')).toBe(1);
    expect(parseTimescale('?mode=foot')).toBe(1);
    expect(parseTimescale('?timescale=10')).toBe(1); // no ?debug alongside → ignored
  });

  it('honors ?timescale=N only alongside ?debug', () => {
    expect(parseTimescale('?debug&timescale=10')).toBe(10);
    expect(parseTimescale('?debug&timescale=3')).toBe(3);
  });

  it('clamps N to 1..MAX_TIMESCALE', () => {
    expect(parseTimescale('?debug&timescale=0')).toBe(1); // below floor
    expect(parseTimescale('?debug&timescale=-4')).toBe(1);
    expect(parseTimescale('?debug&timescale=50')).toBe(MAX_TIMESCALE); // above cap
    expect(parseTimescale('?debug&timescale=999')).toBe(MAX_TIMESCALE);
  });

  it('non-numeric timescale falls back to the default 1', () => {
    expect(parseTimescale('?debug&timescale=abc')).toBe(1);
    expect(parseTimescale('?debug&timescale=')).toBe(1);
  });

  it('runs N fixed steps per frame at the same FIXED_DT', () => {
    const t = createTime();
    t.timescale = 10;
    advanceClock(t, 1000); // prime lastReal
    // one ~16.7ms display frame → 1 base clock step → 10 sim steps at timescale 10
    expect(frameSimSteps(t, 1016.7)).toBe(10);
    // FIXED_DT untouched — all spec-numbered timings preserved
    expect(t.dt).toBe(FIXED_DT);
    // simulated time advanced 10 × 1/60
    expect(t.elapsed).toBeCloseTo(10 * FIXED_DT, 10);
  });

  it('default timescale 1 behaves exactly like advanceClock (production path)', () => {
    const t = createTime();
    advanceClock(t, 1000); // prime
    const s1 = advanceClock(t, 1016.7); // one 16.7ms frame → base steps

    const t2 = createTime();
    advanceClock(t2, 1000); // prime
    const s2 = frameSimSteps(t2, 1016.7); // timescale defaults to 1
    expect(s2).toBe(s1);
  });
});
describe('runSimSteps (per-step elapsed — QA round)', () => {
  it('systems observe the same elapsed sequence regardless of frame batching', async () => {
    const { runSimSteps } = await import('../../src/core/time');
    // clock A: 6 steps delivered as 6 × one-step frames
    const a = createTime();
    runSimSteps(a, 1000, () => {});
    const seenA: number[] = [];
    for (let f = 1; f <= 6; f++) {
      runSimSteps(a, 1000 + f * (1000 / 60), () => seenA.push(a.elapsed));
    }
    // clock B: the same 6 steps delivered as 2 × three-step frames
    const b = createTime();
    runSimSteps(b, 1000, () => {});
    const seenB: number[] = [];
    for (let f = 1; f <= 2; f++) {
      runSimSteps(b, 1000 + f * 3 * (1000 / 60), () => seenB.push(b.elapsed));
    }
    expect(seenA).toHaveLength(6);
    expect(seenB).toHaveLength(6);
    expect(seenB).toEqual(seenA);
  });

  it('advances elapsed exactly one FIXED_DT per executed step, timescale included', async () => {
    const { runSimSteps } = await import('../../src/core/time');
    const t = createTime();
    t.timescale = 10;
    runSimSteps(t, 1000, () => {});
    const seen: number[] = [];
    const steps = runSimSteps(t, 1016.7, () => seen.push(t.elapsed));
    expect(steps).toBe(10);
    seen.forEach((e, i) => expect(e).toBeCloseTo((i + 1) * FIXED_DT, 12));
    expect(t.elapsed).toBeCloseTo(10 * FIXED_DT, 12);
  });

  it('elapsed is an exact product of step count (no float accumulation drift)', async () => {
    const { runSimSteps } = await import('../../src/core/time');
    const t = createTime();
    runSimSteps(t, 0, () => {});
    // one hour of one-step frames
    const frameMs = 1000 / 60;
    for (let f = 1; f <= 60 * 60 * 60; f++) {
      runSimSteps(t, f * frameMs, () => {});
    }
    expect(t.elapsed).toBe(t.simSteps * FIXED_DT); // exact, not accumulated
  });
});
