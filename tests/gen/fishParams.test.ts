// FISHPARAMS GENERATOR — M4 tests-first (plan 06, 04 §3). Pins the pure,
// seeded generator contract: same seed + same species → identical params;
// every generated field stays inside its spec range at every rarity; higher
// rarity widens the jitter window; the wrongness curve w(zone) biases
// fin-parity / limbs / humanRatio / jawSplit monotonically with zone depth
// (zone 1 = mild = identity). Pure Node — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import {
  generateFishParams,
  makeParams,
  wrongnessForZone,
  RARITY_JITTER_MULT,
  type FishParams,
} from '../../src/gen/fishParams';
import { SHALLOWS_SPECIES, speciesById } from '../../src/data/species';

function roll(seed: number, speciesId: string, zone = 1, rarity?: FishParams['rarity']): FishParams {
  const sp = speciesById(speciesId);
  return generateFishParams(sp, new Rng(seed), { zone, rarity });
}

describe('makeParams — the fish-normal baseline', () => {
  it('defaults to a capsule-adjacent 8-segment fish', () => {
    const p = makeParams();
    expect(p.spineSegments).toBe(8);
    expect(p.spineLengths).toHaveLength(8);
    expect(p.girthCurve).toHaveLength(8);
    expect(p.finCount).toBe(3);
    expect(p.eyeCount).toBe(2);
    expect(p.limbBudget).toBe(0);
    expect(p.humanRatio).toBe(0);
    expect(p.jawSplit).toBeGreaterThanOrEqual(0);
    expect(p.jawSplit).toBeLessThan(0.2);
    expect(p.totalLength).toBeCloseTo(4, 6);
    expect(p.weightKg).toBeGreaterThan(0);
  });
});

describe('determinism (spec 8.3)', () => {
  it('same seed + same species + same zone → identical params', () => {
    const a = roll(42, 'silt-pikelet', 1);
    const b = roll(42, 'silt-pikelet', 1);
    expect(a).toEqual(b);
    expect(a.spineLengths).toEqual(b.spineLengths);
    expect(a.finPlacement).toEqual(b.finPlacement);
  });

  it('a different seed perturbs the params', () => {
    const a = roll(1, 'silt-pikelet', 1);
    const b = roll(2, 'silt-pikelet', 1);
    expect(a.mass).not.toBe(b.mass);
  });
});

describe('jitter bounds — every rarity stays inside spec ranges', () => {
  const rarities: FishParams['rarity'][] = ['C', 'U', 'R', 'E'];
  const seeds = [7, 13, 29, 57, 101, 203, 409, 819];

  it(`spineSegments ∈ [6,14] for all ${SHALLOWS_SPECIES.length} species across all rarities`, () => {
    for (const sp of SHALLOWS_SPECIES) {
      for (const r of rarities) {
        for (const s of seeds) {
          const p = roll(s, sp.id, 1, r);
          expect(p.spineSegments, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(6);
          expect(p.spineSegments, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(14);
          expect(p.girthCurve, `${sp.id}@${r}/${s}`).toHaveLength(p.spineSegments);
          expect(p.spineLengths, `${sp.id}@${r}/${s}`).toHaveLength(p.spineSegments);
        }
      }
    }
  });

  it('finCount ∈ [2,9] and finPlacement.length === finCount', () => {
    for (const sp of SHALLOWS_SPECIES) {
      for (const r of rarities) {
        for (const s of seeds) {
          const p = roll(s, sp.id, 1, r);
          expect(p.finCount, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(2);
          expect(p.finCount, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(9);
          expect(p.finPlacement, `${sp.id}@${r}/${s}`).toHaveLength(p.finCount);
          for (const fin of p.finPlacement) {
            expect(fin.at).toBeGreaterThanOrEqual(0);
            expect(fin.at).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('eyeCount ∈ [0,3], limbBudget ∈ [0,4], jawSplit/humanRatio/eyeSize ∈ [0,1]', () => {
    for (const sp of SHALLOWS_SPECIES) {
      for (const r of rarities) {
        for (const s of seeds) {
          const p = roll(s, sp.id, 1, r);
          expect(p.eyeCount, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(0);
          expect(p.eyeCount, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(3);
          expect(p.eyeSize, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(0);
          expect(p.eyeSize, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(1);
          expect(p.limbBudget, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(0);
          expect(p.limbBudget, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(4);
          expect(p.jawSplit, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(0);
          expect(p.jawSplit, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(1);
          expect(p.humanRatio, `${sp.id}@${r}/${s}`).toBeGreaterThanOrEqual(0);
          expect(p.humanRatio, `${sp.id}@${r}/${s}`).toBeLessThanOrEqual(1);
          expect(Number.isFinite(p.swimFreq) && p.swimFreq > 0).toBe(true);
          expect(Number.isFinite(p.swimAmp) && p.swimAmp > 0).toBe(true);
        }
      }
    }
  });
});

describe('rarity widens the jitter window', () => {
  it('an Epic deviates from the species anchor at least as far as a Common', () => {
    const measure = (rarity: FishParams['rarity']) => {
      const base = speciesById('marens-fox').stats.mass;
      let worst = 0;
      for (let s = 1; s <= 48; s++) {
        const p = roll(s, 'marens-fox', 1, rarity);
        worst = Math.max(worst, Math.abs(p.mass - base));
      }
      return worst;
    };
    const common = measure('C');
    const epic = measure('E');
    expect(epic).toBeGreaterThan(common * 1.5);
  });

  it('the rarity multipliers follow the plan ladder (C 1 · U 1.6 · R 2.2 · E 3)', () => {
    expect(RARITY_JITTER_MULT).toMatchObject({ C: 1, U: 1.6, R: 2.2, E: 3 });
  });
});

describe('wrongness curve w(zone)', () => {
  it('is 0 in the Shallows (zone 1) and 1 at the Mouth (zone 5)', () => {
    expect(wrongnessForZone(1)).toBe(0);
    expect(wrongnessForZone(2)).toBe(0.25);
    expect(wrongnessForZone(3)).toBe(0.5);
    expect(wrongnessForZone(4)).toBe(0.75);
    expect(wrongnessForZone(5)).toBe(1);
    expect(wrongnessForZone(0)).toBe(0); // clamped
    expect(wrongnessForZone(9)).toBe(1); // clamped
  });

  it('zone 1 is the identity: params match a non-biased roll', () => {
    const sp = speciesById('damp-roller'); // high wrongnessInfluence
    const shallow = generateFishParams(sp, new Rng(5), { zone: 1 });
    const none = generateFishParams(sp, new Rng(5), { zone: 0 });
    expect(shallow.jawSplit).toBe(none.jawSplit);
    expect(shallow.limbBudget).toBe(none.limbBudget);
    expect(shallow.humanRatio).toBe(none.humanRatio);
    expect(shallow.finCount).toBe(none.finCount);
  });

  it('biases limbBudget / humanRatio / jawSplit upward as the zone deepens', () => {
    const sp = speciesById('damp-roller'); // wrongnessInfluence 0.9, limbBudget 2, hr 0.2
    const mean = (zone: number, pick: (p: FishParams) => number) => {
      let s = 0;
      const N = 120;
      for (let i = 1; i <= N; i++) s += pick(roll(i, sp.id, zone));
      return s / N;
    };
    expect(mean(4, (p) => p.limbBudget)).toBeGreaterThan(mean(1, (p) => p.limbBudget));
    expect(mean(4, (p) => p.humanRatio)).toBeGreaterThan(mean(1, (p) => p.humanRatio));
    expect(mean(4, (p) => p.jawSplit)).toBeGreaterThan(mean(1, (p) => p.jawSplit));
  });

  it('odd finCount becomes far more likely at the Mouth than in the Shallows', () => {
    const oddFreq = (id: string, zone: number) => {
      let odd = 0;
      const N = 80;
      for (let i = 1; i <= N; i++) if (roll(i, id, zone).finCount % 2 === 1) odd++;
      return odd / N;
    };
    // damp-roller (base finCount 2) is half-odd at the surface from jitter;
    // deep, the parity bias forces odd — the wrongness curve reads.
    expect(oddFreq('damp-roller', 5)).toBeGreaterThan(oddFreq('damp-roller', 1));
    // a species that resists the curve (low influence) stays odd-of-its-base
    // more often than a pushed one at the same depth (toady base 3 vs roller 2)
    expect(oddFreq('toady-office', 5)).toBe(1); // the push rounds its even rolls up
  });
});

describe('generated params stay coherent', () => {
  it('totalLength ≈ the species lengthM and weightKg derives from it', () => {
    for (const sp of SHALLOWS_SPECIES) {
      const p = roll(11, sp.id, 1);
      expect(Math.abs(p.totalLength - sp.lengthM)).toBeLessThan(sp.lengthM * 0.15);
      expect(p.weightKg).toBeGreaterThan(0);
      expect(p.tier).toBeGreaterThanOrEqual(1);
      expect(p.eligibility).toBeGreaterThanOrEqual(1);
      expect(p.eligibility).toBeLessThanOrEqual(3);
    }
  });
});