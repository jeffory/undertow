// RUN START — tests-first (task t19 §3 "trinket effect application exactness").
// Pins applyTrinkets: each wired effect changes the fresh world by exactly the
// rolled value (hp, staminaRegen, memories, brace, breath), unwired gimmicks are
// silent, and applyRunStartPassives applies license passives + equipped trinkets
// in one seam (no save loaded = no-op).

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import { applyTrinkets, applyEffect, equippedItems } from '../../src/loot/runStart';
import type { SundryItem } from '../../src/save/schemas';

const trinket = (effects: SundryItem['effects']): SundryItem => ({
  id: 't-test',
  name: 'Test Trinket',
  rarity: 'R',
  slot: 'trinket',
  effects,
});

describe('applyEffect exactness', () => {
  it('hp raises max health (and a fresh run starts full)', () => {
    const w = createWorld(1);
    applyEffect(w, 'hp', 15);
    expect(w.player.maxHp).toBe(115);
    expect(w.player.hp).toBe(115);
  });

  it('staminaRegen adds flat regen/s', () => {
    const w = createWorld(1);
    applyEffect(w, 'staminaRegen', 8);
    expect(w.player.staminaRegenBonus).toBe(8);
  });

  it('memories multiplies the extraction multiplier', () => {
    const w = createWorld(1);
    applyEffect(w, 'memories', 0.05);
    expect(w.run.memoriesMult).toBeCloseTo(1.05, 9);
  });

  it('brace multiplies tuning.braceEfficacy (capped at 1)', () => {
    const w = createWorld(1);
    applyEffect(w, 'brace', 0.25);
    expect(w.tuning.braceEfficacy).toBeCloseTo(0.75, 9);
  });

  it('breath extends the water-phase timer', () => {
    const w = createWorld(1);
    expect(w.water.breathMax).toBe(15);
    applyEffect(w, 'breath', 6);
    expect(w.water.breathMax).toBe(21);
  });

  it('unwired gimmicks (reel / gaff / dodge / congregation) are silent no-ops', () => {
    for (const key of ['reel', 'gaff', 'dodge', 'congregation']) {
      const w = createWorld(1);
      applyEffect(w, key, 999);
      expect(w.player.maxHp).toBe(100);
      expect(w.player.staminaRegenBonus).toBe(0);
      expect(w.run.memoriesMult).toBe(1);
      expect(w.tuning.braceEfficacy).toBe(0.6);
      expect(w.water.breathMax).toBe(15);
    }
  });
});

describe('applyTrinkets', () => {
  it('a two-affix trinket applies both effects to the world', () => {
    const w = createWorld(1);
    applyTrinkets(w, [trinket([{ key: 'hp', value: 15 }, { key: 'brace', value: 0.25 }])]);
    expect(w.player.maxHp).toBe(115);
    expect(w.tuning.braceEfficacy).toBeCloseTo(0.75, 9);
  });

  it('multiple trinkets stack multiplicatively for multipliers, additively for stats', () => {
    const w = createWorld(1);
    applyTrinkets(w, [
      trinket([{ key: 'memories', value: 0.05 }]),
      trinket([{ key: 'memories', value: 0.05 }]),
    ]);
    expect(w.run.memoriesMult).toBeCloseTo(1.1025, 9);
    const w2 = createWorld(1);
    applyTrinkets(w2, [trinket([{ key: 'hp', value: 10 }]), trinket([{ key: 'hp', value: 10 }])]);
    expect(w2.player.maxHp).toBe(120);
  });
});

describe('equippedItems', () => {
  it('resolves equipped ids into box items, ignoring missing/duplicate ids', () => {
    const box: SundryItem[] = [trinket([{ key: 'hp', value: 10 }])];
    const items = equippedItems({ equipped: ['t-test', 'nope', 't-test'], box });
    expect(items.map((i) => i.id)).toEqual(['t-test']);
  });
});