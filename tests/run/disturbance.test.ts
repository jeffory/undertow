// DISTURBANCE / CAST / BITE — tests-first (plan 03 §3, task t12 #1). Pins the
// ripple = tier-only rule (never species), the cast target resolution, the
// seeded bite delay (1-4s), and the SET/RELEASE window timing (1.2s).

import { describe, it, expect } from 'vitest';
import {
  createDisturbance,
  rippleRadiusForTier,
  biteDelaySeconds,
  pickCastTarget,
  withinRange,
  startBite,
  release,
  BITE_DELAY_MIN,
  BITE_DELAY_MAX,
  PROMPT_WINDOW,
  CAST_RANGE,
  AIM_RANGE,
  type Disturbance,
} from '../../src/run/disturbance';

const d = (id: number, x: number, z: number, tier: 1 | 2 | 3 = 1): Disturbance =>
  createDisturbance(id, { x, z }, tier, id * 1000);

describe('ripple telegraph — tier only, never species', () => {
  it('ripple radius is a pure function of tier (1 < 2 < 3)', () => {
    expect(rippleRadiusForTier(1)).toBeLessThan(rippleRadiusForTier(2));
    expect(rippleRadiusForTier(2)).toBeLessThan(rippleRadiusForTier(3));
  });

  it('a disturbance carries no species information pre-SET', () => {
    const d0 = d(1, 0, 0);
    expect('species' in d0).toBe(false);
    expect(Object.keys(d0).sort()).toEqual(
      ['id', 'pos', 'tier', 'state', 'biteTimer', 'promptTimer', 'seed'].sort(),
    );
  });
});

describe('cast target resolution (aim with the mouse, within ~10m)', () => {
  it('picks the disturbance nearest the aim point within range', () => {
    const caster = { x: 0, z: 0 };
    const dists = [d(1, 4, 4), d(2, 9, 9), d(3, -8, 8)];
    const pick = pickCastTarget(dists, caster, { x: 4.2, z: 4.2 });
    expect(pick?.id).toBe(1);
  });

  it('refuses a disturbance out of CAST_RANGE of the caster', () => {
    const caster = { x: 0, z: 0 };
    const dists = [d(1, 12, 0)]; // 12m > 10m
    expect(pickCastTarget(dists, caster, { x: 12, z: 0 })).toBeNull();
    expect(pickCastTarget(dists, caster, null)).toBeNull();
  });

  it('requires a decent aim — a point far from every in-range disturbance returns null', () => {
    const caster = { x: 0, z: 0 };
    const dists = [d(1, 5, 0), d(2, -5, 0)];
    // aim at a gap between them, > AIM_RANGE from both
    expect(pickCastTarget(dists, caster, { x: 0, z: 4 })).toBeNull();
    // but with no aim point (debug/seam), the nearest in-range disturbance casts
    expect(pickCastTarget(dists, caster, null)?.id).toBe(1);
  });

  it('ignores disturbances that are already gone or biting', () => {
    const caster = { x: 0, z: 0 };
    const gone = d(1, 3, 0);
    gone.state = 'gone';
    const biting = d(2, -3, 0);
    startBite(biting);
    const dists = [gone, biting, d(3, 7, 0)];
    expect(pickCastTarget(dists, caster, null)?.id).toBe(3);
  });

  it('constants: cast range ~10m, aim snap 4m, prompt window 1.2s', () => {
    expect(CAST_RANGE).toBe(10);
    expect(AIM_RANGE).toBe(4);
    expect(PROMPT_WINDOW).toBeCloseTo(1.2, 9);
    expect(withinRange({ x: 0, z: 0 }, { x: 10, z: 0 }, CAST_RANGE)).toBe(true);
    expect(withinRange({ x: 0, z: 0 }, { x: 10.01, z: 0 }, CAST_RANGE)).toBe(false);
  });
});

describe('bite delay (seeded 1-4s)', () => {
  it('is deterministic for the same (seed, runSeed) pair', () => {
    expect(biteDelaySeconds(5, 100)).toBe(biteDelaySeconds(5, 100));
    expect(biteDelaySeconds(5, 100)).not.toBe(biteDelaySeconds(6, 100));
  });

  it('always lands inside [1, 4)s across many seeds', () => {
    for (let s = 0; s < 200; s++) {
      const delay = biteDelaySeconds(s, 7);
      expect(delay).toBeGreaterThanOrEqual(BITE_DELAY_MIN);
      expect(delay).toBeLessThan(BITE_DELAY_MAX);
    }
  });
});

describe('SET/RELEASE window', () => {
  it('release consumes the disturbance (state → gone) — the free valve', () => {
    const dist = d(1, 0, 0);
    dist.state = 'prompt';
    release(dist);
    expect(dist.state).toBe('gone');
  });

  it('startBite enters the biting state and clears the prompt timer', () => {
    const dist = d(1, 0, 0);
    startBite(dist);
    expect(dist.state).toBe('biting');
    expect(dist.promptTimer).toBe(0);
  });
});