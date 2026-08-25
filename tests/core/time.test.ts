import { describe, it, expect } from 'vitest';
import { createTime, advanceClock, FIXED_DT, MAX_STEPS_PER_FRAME } from '../../src/core/time';

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