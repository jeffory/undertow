// DREAD — tests-first (plan 03 §4, task t12 #2). Pins the gain table, the
// 0-100 clamp, the exact tier boundaries, the night multiplier, the free-valve
// release, and the starting-bonus formula.

import { describe, it, expect } from 'vitest';
import {
  tierFor,
  landGainByTier,
  applyDreadGain,
  startingBonus,
  RELEASE_GAIN,
  DREAD_MAX,
} from '../../src/game/dread';
import { dreadMultForPhase } from '../../src/game/clock';

describe('dread tiers (boundaries fire exactly at 20/40/60/80)', () => {
  it('maps values to the five tiers', () => {
    expect(tierFor(0)).toBe(0);
    expect(tierFor(19.9)).toBe(0);
    expect(tierFor(20)).toBe(1); // exact boundary
    expect(tierFor(39)).toBe(1);
    expect(tierFor(40)).toBe(2);
    expect(tierFor(59)).toBe(2);
    expect(tierFor(60)).toBe(3);
    expect(tierFor(79)).toBe(3);
    expect(tierFor(80)).toBe(4); // exact boundary
    expect(tierFor(100)).toBe(4);
  });

  it('clamps out-of-range inputs defensively', () => {
    expect(tierFor(-5)).toBe(0);
    expect(tierFor(999)).toBe(4);
  });
});

describe('dread gains (plan §4.1)', () => {
  it('landing a catch gains +4/+6/+9/+12 by tier', () => {
    expect(landGainByTier(1)).toBe(4);
    expect(landGainByTier(2)).toBe(6);
    expect(landGainByTier(3)).toBe(9);
    expect(landGainByTier(4)).toBe(12);
  });

  it('applyDreadGain is a plain clamp — never below 0 or above 100', () => {
    expect(applyDreadGain(50, 4, 1)).toBe(54);
    expect(applyDreadGain(0, -10, 1)).toBe(0);
    expect(applyDreadGain(98, 10, 1)).toBe(DREAD_MAX);
    expect(applyDreadGain(99.5, 1, 1)).toBe(DREAD_MAX);
  });

  it('night multiplier (1.25) scales a gain exactly', () => {
    const mult = dreadMultForPhase('night');
    expect(mult).toBe(1.25);
    expect(applyDreadGain(50, 4, mult)).toBe(55); // 4 × 1.25 = 5
    expect(applyDreadGain(30, 6, mult)).toBeCloseTo(37.5, 9); // 6 × 1.25 = 7.5
  });

  it('dusk multiplier is 1.0 — the gain lands unmodified', () => {
    expect(applyDreadGain(10, 4, dreadMultForPhase('dusk'))).toBe(14);
  });

  it('RELEASE is the free valve — the gain is exactly 0', () => {
    expect(RELEASE_GAIN).toBe(0);
    expect(applyDreadGain(41, RELEASE_GAIN, 1.25)).toBe(41); // releasing never changes Dread
  });
});

describe('starting Dread from restored buildings (plan §4.4)', () => {
  it('startingBonus = min(2 × buildings, 30)', () => {
    expect(startingBonus(0)).toBe(0);
    expect(startingBonus(3)).toBe(6);
    expect(startingBonus(10)).toBe(20);
    expect(startingBonus(15)).toBe(30);
    expect(startingBonus(40)).toBe(30); // capped
  });
});