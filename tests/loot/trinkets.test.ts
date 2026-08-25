// TRINKETS — tests-first (plan 04 §7.3, task t19 §3). Pins the affix roller:
// every trinket carries exactly one prefix + one suffix from the plan's pools,
// its name composes both, its rarity is preserved, and its effects come from
// the two affixes (including the deliberate no-op gimmicks that wait for their
// systems).

import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { rollAffixedTrinket } from '../../src/loot/roller';
import { PREFIXES, SUFFIXES } from '../../src/loot/items';

const PREFIX_KEYS = PREFIXES.map((p) => p.key);
const SUFFIX_KEYS = SUFFIXES.map((s) => s.key);
const EFFECT_KEYS = PREFIXES.map((p) => p.effect).concat(SUFFIXES.map((s) => s.effect));

describe('rollAffixedTrinket', () => {
  it('rolls one prefix + one suffix from the plan pools and composes the name', () => {
    const rng = new Rng(11);
    for (let i = 0; i < 40; i++) {
      const t = rollAffixedTrinket(rng, 'U');
      expect(PREFIX_KEYS).toContain(t.prefix);
      expect(SUFFIX_KEYS).toContain(t.suffix);
      const prefixName = PREFIXES.find((p) => p.key === t.prefix)!.name;
      const suffixName = SUFFIXES.find((s) => s.key === t.suffix)!.name;
      expect(t.name).toBe(`${prefixName} ${suffixName}`);
    }
  });

  it('preserves the rolled rarity', () => {
    for (const rarity of ['C', 'U', 'R', 'E'] as const) {
      const t = rollAffixedTrinket(new Rng(Number(rarity.charCodeAt(0))), rarity);
      expect(t.rarity).toBe(rarity);
    }
  });

  it('effects accumulate from both affixes and only reference known keys', () => {
    const rng = new Rng(123);
    for (let i = 0; i < 60; i++) {
      const t = rollAffixedTrinket(rng, 'R');
      expect(t.effects.length).toBe(2);
      for (const fx of t.effects) expect(EFFECT_KEYS).toContain(fx.key);
      // the affix values match their defs (e.g. held-water → +0.25 brace)
      const prefix = PREFIXES.find((p) => p.key === t.prefix)!;
      const suffix = SUFFIXES.find((s) => s.key === t.suffix)!;
      expect(t.effects.find((e) => e.key === prefix.effect)!.value).toBe(prefix.value);
      expect(t.effects.find((e) => e.key === suffix.effect)!.value).toBe(suffix.value);
    }
  });

  it('deterministic: same seed → identical trinket', () => {
    const a = rollAffixedTrinket(new Rng(7), 'R');
    const b = rollAffixedTrinket(new Rng(7), 'R');
    expect(a).toEqual(b);
  });

  it('higher rarity favours the stronger affixes (barnacled/damp/heftier weights)', () => {
    // Over a large sample, an Epic should land the +HP / +stamina entries more
    // often than a Common does (RARITY_AFFIX_MULT raises their weights).
    const countByRarity = (rarity: 'C' | 'E', key: string): number => {
      const rng = new Rng(rarity === 'E' ? 31 : 13);
      let n = 0;
      for (let i = 0; i < 400; i++) {
        if (rollAffixedTrinket(rng, rarity).prefix === key) n++;
      }
      return n;
    };
    expect(countByRarity('E', 'barnacled')).toBeGreaterThan(countByRarity('C', 'barnacled'));
  });
});