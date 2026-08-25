// LOOT ROLLER — tests-first (plan 04 §7.1/§7.3, task t19 §3). Pins the rarity
// ladder distribution bounds (deep Dread pulls weights up, clean +1 shifts),
// the Drowned gate (weight 0 until license grade 6), the slot weights, the drop
// chance bounds, and full determinism over the seeded stream.

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import {
  rollRarity,
  rollSlot,
  rollCatchDrop,
  rollAffixedTrinket,
  rarityWeights,
  dropChance,
  type RollCtx,
} from '../../src/loot/roller';
import { SundryItemSchema } from '../../src/save/schemas';

const ctx = (over: Partial<RollCtx> = {}): RollCtx => ({
  zoneDepth: 1,
  catchTier: 2,
  dreadTier: 0,
  licenseGrade: 1,
  qualityBonus: 0,
  ...over,
});

describe('rarity ladder', () => {
  it('base weights in the Shallows favour Commons; Drowned is gated to grade 6', () => {
    const w = rarityWeights(ctx());
    expect(w.C).toBeGreaterThan(w.U);
    expect(w.U).toBeGreaterThan(w.R);
    expect(w.R).toBeGreaterThan(w.E);
    expect(w.Drowned).toBe(0);
    const gated = rarityWeights(ctx({ licenseGrade: 6 }));
    expect(gated.Drowned).toBeGreaterThan(0);
  });

  it('deep Dread tier 3+ pulls the ladder up (C down, R/E up)', () => {
    const calm = rarityWeights(ctx());
    const hot = rarityWeights(ctx({ dreadTier: 3 }));
    expect(hot.C).toBeLessThan(calm.C);
    expect(hot.R).toBeGreaterThan(calm.R);
    expect(hot.E).toBeGreaterThan(calm.E);
  });

  it('a clean catch (+1 quality) shifts the ladder up; a butcher (−1) down', () => {
    const base = rarityWeights(ctx());
    const clean = rarityWeights(ctx({ qualityBonus: 1 }));
    const butcher = rarityWeights(ctx({ qualityBonus: -1 }));
    expect(clean.C).toBeLessThan(base.C);
    expect(butcher.C).toBeGreaterThan(base.C);
    expect(clean.E).toBeGreaterThan(base.E);
    expect(butcher.E).toBeLessThan(base.E);
  });

  it('rolls only the four real rarities (Drowned never surfaces this round)', () => {
    const rng = new Rng(1234);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(rollRarity(rng, ctx()));
    expect(['C', 'U', 'R', 'E'].every((r) => seen.has(r))).toBe(true);
  });
});

describe('distribution bounds (over a seeded sample)', () => {
  it('Shallows commons dominate and epics are rare — within the plan pace', () => {
    const counts = { C: 0, U: 0, R: 0, E: 0 };
    const rng = new Rng(20260701);
    const n = 2000;
    for (let i = 0; i < n; i++) counts[rollRarity(rng, ctx())]++;
    const fC = counts.C / n;
    const fU = counts.U / n;
    const fR = counts.R / n;
    const fE = counts.E / n;
    expect(fC).toBeGreaterThan(0.5);
    expect(fC).toBeLessThan(0.75);
    expect(fU).toBeGreaterThan(0.15);
    expect(fR).toBeGreaterThan(0.05);
    expect(fE).toBeLessThan(0.08);
  });

  it('a hot-Dread sample shifts the epic share up', () => {
    const calm = { C: 0, U: 0, R: 0, E: 0 };
    const hot = { C: 0, U: 0, R: 0, E: 0 };
    const rngC = new Rng(99);
    const rngH = new Rng(99);
    const n = 2000;
    for (let i = 0; i < n; i++) {
      calm[rollRarity(rngC, ctx())]++;
      hot[rollRarity(rngH, ctx({ dreadTier: 4 }))]++;
    }
    expect(hot.E / n).toBeGreaterThan(calm.E / n);
    expect(hot.C / n).toBeLessThan(calm.C / n);
  });

  it('the slot roll favours bait/line over trinkets in the Shallows', () => {
    const counts: Record<string, number> = {};
    const rng = new Rng(777);
    for (let i = 0; i < 2000; i++) {
      const s = rollSlot(rng, ctx());
      counts[s] = (counts[s] ?? 0) + 1;
    }
    expect(counts['trinket']! / 2000).toBeGreaterThan(0.1);
    expect(counts['bait']! / 2000).toBeGreaterThan(counts['trinket']! / 2000);
  });

  it('the drop chance grows with catch tier and Dread, and a clean catch bumps it', () => {
    expect(dropChance(ctx({ catchTier: 1, dreadTier: 0 }))).toBeLessThan(
      dropChance(ctx({ catchTier: 4, dreadTier: 0 })),
    );
    expect(dropChance(ctx({ dreadTier: 0 }))).toBeLessThan(dropChance(ctx({ dreadTier: 4 })));
    expect(dropChance(ctx({ qualityBonus: 1 }))).toBeGreaterThan(dropChance(ctx({ qualityBonus: 0 })));
  });
});

describe('determinism', () => {
  it('same seed + same ctx → byte-identical drop sequence', () => {
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 20; i++) {
      a.push(JSON.stringify(rollCatchDrop(new Rng(424242), ctx({ qualityBonus: 1 }))));
      b.push(JSON.stringify(rollCatchDrop(new Rng(424242), ctx({ qualityBonus: 1 }))));
    }
    expect(a).toEqual(b);
  });

  it('a different seed diverges the sequence', () => {
    const ra = new Rng(1);
    const rb = new Rng(2);
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 20; i++) {
      a.push(rollRarity(ra, ctx()));
      b.push(rollRarity(rb, ctx()));
    }
    expect(a.join()).not.toBe(b.join());
  });
});

describe('rolled items round-trip the save schema', () => {
  it('an affixed trinket parses as a SundryItem (the box schema)', () => {
    const item = rollAffixedTrinket(new Rng(5), 'R');
    expect(item.slot).toBe('trinket');
    expect(item.effects.length).toBeGreaterThanOrEqual(2);
    expect(SundryItemSchema.parse(item)).toEqual(item);
  });

  it('a full drop round-trips the save schema', () => {
    const item = rollCatchDrop(new Rng(6), ctx());
    if (item) expect(SundryItemSchema.parse(item)).toEqual(item);
  });
});