// BITE-ELIGIBILITY GATE — tests-first (plan 04 §8.4, task t15). Pins the
// canBite rule (species.eligibility ≤ grade), the gated species resolution the
// cast/SET flow drives: an ineligible species is NEVER selected when resolving
// which species takes the hook (the filter runs before the weighted draw), the
// same seed + tier + grade is deterministic, and a whole tier that out-ranks the
// license declines (null — the disturbance is present but doesn't respond).

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { canBite } from '../../src/loot/license';
import { rollEligibleSpeciesAtSet } from '../../src/run/species';
import { rollEligibleSpeciesFromTier, speciesById, TIER_TABLES } from '../../src/data/species';

describe('canBite (plan §8.4: species.eligibility ≤ grade)', () => {
  it('an eligible species bites; an over-grade one does not', () => {
    expect(canBite({ eligibility: 1 }, 1)).toBe(true);
    expect(canBite({ eligibility: 2 }, 2)).toBe(true);
    expect(canBite({ eligibility: 2 }, 1)).toBe(false);
    expect(canBite({ eligibility: 3 }, 2)).toBe(false);
  });

  it('a record without an eligibility field reads as grade 1 (always bites)', () => {
    expect(canBite({}, 1)).toBe(true);
    expect(canBite({}, 7)).toBe(true);
    expect(canBite({ eligibility: 0 }, 1)).toBe(true); // 0 ≤ 1
  });

  it('the tier tables only ever gate: grade 1 must not reach a grade-3 species', () => {
    // every table row obeys the canBite rule against a grade-1 keeper — the two
    // Grade-3 teases (bell-carp / marens-fox) are the only ones that decline
    for (const t of [1, 2, 3] as const) {
      for (const row of TIER_TABLES[t]) {
        const sp = speciesById(row.id);
        expect(canBite(sp, 1), sp.id).toBe(sp.eligibility <= 1);
      }
    }
  });
});

describe('rollEligibleSpeciesAtSet — the bite-resolution gate', () => {
  it('an ineligible species NEVER takes the hook at grade 1 (tier-2 keeps only bottle-post)', () => {
    for (let s = 1; s <= 300; s++) {
      const sp = rollEligibleSpeciesAtSet(new Rng(s), 2, 1);
      expect(sp, `seed ${s}`).not.toBeNull();
      expect(sp!.id, `seed ${s}`).toBe('bottle-post'); // the only eligibility-1 row in tier 2
      expect(canBite(sp!, 1)).toBe(true);
    }
  });

  it('but DOES at its required grade — rungfish (elig 2) resurfaces at grade 2', () => {
    const atGrade2 = new Set<string>();
    for (let s = 1; s <= 300; s++) atGrade2.add(rollEligibleSpeciesAtSet(new Rng(s), 2, 2)!.id);
    expect(atGrade2.has('rungfish')).toBe(true);
    for (const id of atGrade2) {
      expect(canBite(speciesById(id), 2), id).toBe(true); // nothing over grade 2
    }
  });

  it('a whole tier that out-ranks the license declines (null) — tier 3 at grade 1', () => {
    for (let s = 1; s <= 200; s++) {
      expect(rollEligibleSpeciesAtSet(new Rng(s), 3, 1)).toBeNull();
    }
    // grade 2 lifts the eligibility-2 rows; grade 3 admits the whole table
    for (let s = 1; s <= 200; s++) {
      const sp = rollEligibleSpeciesAtSet(new Rng(s), 3, 3);
      expect(sp, `seed ${s}`).not.toBeNull();
      expect(canBite(sp!, 3), `seed ${s}`).toBe(true);
    }
  });

  it('grade 3 can roll the Grade-3 teases (bell-carp / marens-fox) across seeds', () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 400; s++) seen.add(rollEligibleSpeciesAtSet(new Rng(s), 3, 3)!.id);
    expect(seen.has('bell-carp')).toBe(true);
    expect(seen.has('marens-fox')).toBe(true);
  });

  it('deterministic: same (seed, tier, grade) → identical species; grade flips the draw', () => {
    const a1 = rollEligibleSpeciesAtSet(new Rng(99), 2, 2);
    const a2 = rollEligibleSpeciesAtSet(new Rng(99), 2, 2);
    expect(a1!.id).toBe(a2!.id);
    // same seed but an ineligible species is never drawn at grade 1
    expect(rollEligibleSpeciesAtSet(new Rng(99), 2, 1)!.id).toBe('bottle-post');
  });

  it('the pure table-level gate agrees with the run seam', () => {
    const rng = new Rng(42);
    const viaSeam = rollEligibleSpeciesAtSet(rng, 2, 2);
    const viaData = rollEligibleSpeciesFromTier(new Rng(42), 2, 2);
    expect(viaSeam!.id).toBe(viaData!.id);
  });
});