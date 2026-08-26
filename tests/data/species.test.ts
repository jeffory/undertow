// SPECIES DATA — M4 tests-first (04 §5, bestiary-shallows.md). Pins the 12
// Shallows presets against the plan's rarity ladder (4C/3U/4R/1E), the bestiary
// ids (old-pike boss, purse-minnow bagman), per-preset param validity, and the
// disturbance-tier roll tables (tier 1 never rolls past Uncommon, tier 3 rolls
// the rare/epic top of the ladder). Pure Node — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import {
  SHALLOWS_SPECIES,
  ALL_SPECIES,
  speciesById,
  speciesDisplayName,
  TIER_TABLES,
  MARENS_ECHO_SPECIES_ID,
  type SpeciesPreset,
} from '../../src/data/species';
import { rollSpeciesAtSet } from '../../src/run/species';
import type { Rarity } from '../../src/gen/fishParams';

const BESTIARY_IDS = [
  'silt-pikelet',
  'glass-minnow',
  'toady-office',
  'damp-roller',
  'bottle-post',
  'rungfish',
  'grave-shad',
  'hollow-shiner',
  'spoonworm',
  'whetstone-bream',
  'bell-carp',
  'marens-fox',
  'old-pike',
  'purse-minnow',
];

describe('the 12 Shallows roster', () => {
  it('holds exactly 12 catch roster species across the 4C/3U/4R/1E ladder', () => {
    expect(SHALLOWS_SPECIES).toHaveLength(12);
    const byRarity: Record<Rarity, number> = { C: 0, U: 0, R: 0, E: 0, Boss: 0 };
    for (const sp of SHALLOWS_SPECIES) byRarity[sp.rarity]++;
    expect(byRarity).toMatchObject({ C: 4, U: 3, R: 4, E: 1, Boss: 0 });
  });

  it('ids + names match the bestiary-shallows records', () => {
    const ids = new Set(SHALLOWS_SPECIES.map((s) => s.id));
    for (const id of BESTIARY_IDS.slice(0, 12)) expect(ids.has(id), id).toBe(true);
    // the boss + bagman records exist alongside the roster
    expect(speciesById('old-pike').category).toBe('boss');
    expect(speciesById('purse-minnow').category).toBe('bagman');
  });

  it('every preset is valid: segments/fins in range, curves sized, patterns sum to 1', () => {
    for (const sp of ALL_SPECIES) {
      expect(sp.spineSegments, sp.id).toBeGreaterThanOrEqual(6);
      expect(sp.spineSegments, sp.id).toBeLessThanOrEqual(14);
      expect(sp.girthCurve, sp.id).toHaveLength(sp.spineSegments);
      expect(sp.finCount, sp.id).toBeGreaterThanOrEqual(2);
      expect(sp.finCount, sp.id).toBeLessThanOrEqual(9);
      expect(sp.eyeCount, sp.id).toBeGreaterThanOrEqual(0);
      expect(sp.eyeCount, sp.id).toBeLessThanOrEqual(3);
      expect(sp.jawSplit, sp.id).toBeGreaterThanOrEqual(0);
      expect(sp.jawSplit, sp.id).toBeLessThanOrEqual(1);
      expect(sp.snout, sp.id).toBeGreaterThanOrEqual(0);
      expect(sp.snout, sp.id).toBeLessThanOrEqual(1);
      expect(sp.limbBudget, sp.id).toBeGreaterThanOrEqual(0);
      expect(sp.limbBudget, sp.id).toBeLessThanOrEqual(4);
      expect(sp.humanRatio, sp.id).toBeGreaterThanOrEqual(0);
      expect(sp.humanRatio, sp.id).toBeLessThanOrEqual(1);
      expect(sp.swimFreq, sp.id).toBeGreaterThan(0);
      expect(sp.swimAmp, sp.id).toBeGreaterThan(0);
      expect(sp.wrongnessInfluence, sp.id).toBeGreaterThanOrEqual(0.4);
      expect(sp.wrongnessInfluence, sp.id).toBeLessThanOrEqual(0.9);
      expect(sp.eligibility, sp.id).toBeGreaterThanOrEqual(1);
      expect(sp.eligibility, sp.id).toBeLessThanOrEqual(3);
      const w = sp.patterns.orbit + sp.patterns.lunge + sp.patterns.dive + sp.patterns.drag;
      expect(Math.abs(w - 1), `${sp.id} patterns`).toBeLessThan(1e-9);
      expect(sp.stats.mass, sp.id).toBeGreaterThan(0);
      expect(sp.stats.stamina, sp.id).toBeGreaterThan(0);
      // 05 §2.3 — ONE species in the game has no pull force, and it is the one
      // whose whole design is that it never pulls. Everything else must have
      // one, which is what this invariant is for.
      if (sp.id === MARENS_ECHO_SPECIES_ID) expect(sp.stats.pullForce, sp.id).toBe(0);
      else expect(sp.stats.pullForce, sp.id).toBeGreaterThan(0);
      expect(sp.stats.hp, sp.id).toBeGreaterThan(0);
    }
  });

  it('preset tier matches the rarity ladder (C1 U2 R3 E4)', () => {
    const expectTier: Record<Rarity, number> = { C: 1, U: 2, R: 3, E: 4, Boss: 5 };
    for (const sp of ALL_SPECIES) {
      expect(sp.tier, sp.id).toBe(expectTier[sp.rarity]);
    }
  });

  it('speciesDisplayName returns the human name (receipt: "one (1) purse minnow, damp")', () => {
    expect(speciesDisplayName('purse-minnow')).toBe('Purse Minnow');
    expect(speciesDisplayName('silt-pikelet')).toBe('Silt Pikelet');
    expect(speciesDisplayName('capsule')).toBe('capsule'); // unknown → the id itself
  });
});

describe('disturbance-tier roll tables', () => {
  it('tier tables cover every catch-roster species exactly once', () => {
    const seen = new Set<string>();
    for (const t of [1, 2, 3] as const) {
      for (const row of TIER_TABLES[t]) {
        expect(row.w, `${row.id} weight`).toBeGreaterThan(0);
        seen.add(row.id);
      }
    }
    expect(seen.size).toBe(12);
    for (const sp of SHALLOWS_SPECIES) expect(seen.has(sp.id), sp.id).toBe(true);
  });

  it('tier-1 disturbances never roll past Uncommon', () => {
    for (let s = 1; s <= 200; s++) {
      const sp = rollSpeciesAtSet(new Rng(s), 1);
      expect(['C', 'U']).toContain(sp.rarity);
    }
  });

  it('tier-3 disturbances roll the Rare/Epic top of the ladder', () => {
    for (let s = 1; s <= 200; s++) {
      const sp = rollSpeciesAtSet(new Rng(s), 3);
      expect(['R', 'E']).toContain(sp.rarity);
    }
  });

  it('tier-2 mixes the middle: Uncommon heavy with a Rare chance', () => {
    const rarities = new Set<string>();
    for (let s = 1; s <= 400; s++) rarities.add(rollSpeciesAtSet(new Rng(s), 2).rarity);
    expect(rarities.has('U')).toBe(true);
    expect(rarities.has('R')).toBe(true);
    expect(rarities.has('C')).toBe(false);
    expect(rarities.has('E')).toBe(false);
  });

  it('rolls are deterministic for the same (seed, tier)', () => {
    expect(rollSpeciesAtSet(new Rng(99), 2).id).toBe(rollSpeciesAtSet(new Rng(99), 2).id);
    expect(rollSpeciesAtSet(new Rng(99), 1).id).not.toBe(rollSpeciesAtSet(new Rng(99), 2).id);
  });
});

// keep the type import meaningful for the docs/tooling story
export type _PresetCheck = SpeciesPreset;