// SPAWN DIRECTOR BUDGETS — tests-first (plan 03 §9.2, task t12 #6). Pins the
// (dreadTier, clockPhase) disturbance budget table: every 5×4 combo yields a
// valid weighted distribution, night shifts common→rare, and the tier roll maps
// a rarity onto the 1-3 ripple tiers. Also the refill cadence + false-dawn halt.

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import {
  budgetFor,
  rollTierFrom,
  refillTimerForPhase,
  refillActive,
  BUDGET_TABLE,
  type RarityDistribution,
} from '../../src/spawn/budgets';
import { PHASE_ORDER, phaseProgress } from '../../src/game/clock';

const sum = (d: RarityDistribution) => d.common + d.uncommon + d.rare + d.epic;

describe('budget table (5 tiers × 4 phases)', () => {
  it('every combo is a valid weighted distribution', () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      for (const phase of PHASE_ORDER) {
        const d = budgetFor(tier, phase);
        expect(d.common, `t${tier} ${phase}`).toBeGreaterThanOrEqual(0);
        expect(d.epic, `t${tier} ${phase}`).toBeGreaterThanOrEqual(0);
        expect(sum(d), `t${tier} ${phase}`).toBeCloseTo(1, 9);
      }
    }
  });

  it('higher dread tiers skew toward rarer disturbances', () => {
    const t0 = budgetFor(0, 'dusk');
    const t4 = budgetFor(4, 'dusk');
    expect(t4.common).toBeLessThan(t0.common);
    expect(t4.rare + t4.epic).toBeGreaterThan(t0.rare + t0.epic);
  });

  it('night shifts −10% common, +10% rare (the same distribution elsewhere)', () => {
    const dusk = budgetFor(2, 'dusk');
    const night = budgetFor(2, 'night');
    const deep = budgetFor(2, 'deepNight');
    expect(night.common).toBeCloseTo(Math.max(0, dusk.common - 0.1), 9);
    expect(night.rare).toBeCloseTo(dusk.rare + 0.1, 9);
    expect(deep.common).toBe(night.common); // deep night keeps the night table
  });

  it('the raw table is the documented 5-row distribution (dusk)', () => {
    expect(BUDGET_TABLE[0]).toEqual({ common: 0.8, uncommon: 0.15, rare: 0.05, epic: 0 });
    expect(BUDGET_TABLE[1]).toEqual({ common: 0.65, uncommon: 0.25, rare: 0.1, epic: 0 });
    expect(BUDGET_TABLE[2]).toEqual({ common: 0.45, uncommon: 0.35, rare: 0.15, epic: 0.05 });
    expect(BUDGET_TABLE[3]).toEqual({ common: 0.3, uncommon: 0.4, rare: 0.25, epic: 0.05 });
    expect(BUDGET_TABLE[4]).toEqual({ common: 0.2, uncommon: 0.35, rare: 0.35, epic: 0.1 });
  });
});

describe('tier roll (rarity → ripple tier 1-3)', () => {
  // a stub Rng that returns a fixed float in [0,1)
  const fixed = (f: number) =>
    ({ nextFloat: () => f }) as unknown as Rng;

  it('common → tier 1, uncommon → tier 2, rare/epic → tier 3', () => {
    const d: RarityDistribution = { common: 0.5, uncommon: 0.3, rare: 0.2, epic: 0 };
    expect(rollTierFrom(d, fixed(0.1))).toBe(1);
    expect(rollTierFrom(d, fixed(0.55))).toBe(2);
    expect(rollTierFrom(d, fixed(0.85))).toBe(3);
    expect(rollTierFrom(d, fixed(0.999))).toBe(3);
  });

  it('an epic bucket (even empty at tier 0) still maps to tier 3, never a species', () => {
    const d0: RarityDistribution = { common: 1, uncommon: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 50; i++) {
      const tier = rollTierFrom(d0, fixed(Math.random()));
      expect(tier === 1 || tier === 2 || tier === 3).toBe(true);
    }
  });
});

describe('refill cadence (plan §9.2)', () => {
  it('refill timers: dusk 90s, night 60s, deep night 45s, false dawn 120s', () => {
    expect(refillTimerForPhase('dusk')).toBe(90);
    expect(refillTimerForPhase('night')).toBe(60);
    expect(refillTimerForPhase('deepNight')).toBe(45);
    expect(refillTimerForPhase('falseDawn')).toBe(120);
  });

  it('false dawn halts new spawns past 60% through the phase', () => {
    expect(refillActive('falseDawn', 0)).toBe(true);
    expect(refillActive('falseDawn', 0.59)).toBe(true);
    expect(refillActive('falseDawn', 0.6)).toBe(false);
    expect(refillActive('falseDawn', 0.9)).toBe(false);
  });

  it('all other phases refill for the whole phase', () => {
    for (const phase of ['dusk', 'night', 'deepNight'] as const) {
      expect(refillActive(phase, 0)).toBe(true);
      expect(refillActive(phase, 0.99)).toBe(true);
    }
    expect(phaseProgress(0)).toBe(0);
  });
});