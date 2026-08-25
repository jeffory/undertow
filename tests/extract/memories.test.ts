// MEMORIES — tests-first (plan 03 §7, task t12 #4). Pins the exact conversion
// math: memories = weight × rarity-mult × (clean ? 1.5 : 1), floored per record,
// and the 30% Office condolence rate applied per record then summed.

import { describe, it, expect } from 'vitest';
import {
  rarityMultForTier,
  catchMemories,
  condolenceMemories,
  haulMemories,
  CLEAN_MULT,
  CONDOLENCE_RATE,
} from '../../src/extract/memories';
import type { CatchRecord } from '../../src/extract/memories';

const rec = (partial: Partial<CatchRecord>): CatchRecord => ({
  species: 'capsule',
  tier: 1,
  weight: 10,
  clean: true,
  memories: 15,
  xp: 15,
  ...partial,
});

describe('catch → Memories conversion (exact)', () => {
  it('rarity mults follow the plan table: 1 / 2 / 3.5 / 6 (epic)', () => {
    expect(rarityMultForTier(1)).toBe(1);
    expect(rarityMultForTier(2)).toBe(2);
    expect(rarityMultForTier(3)).toBe(3.5);
    expect(rarityMultForTier(4)).toBe(6);
  });

  it('a tier-1 clean catch is weight × 1 × 1.5', () => {
    expect(catchMemories(10, 1, true)).toBe(15);
    expect(catchMemories(4.5, 1, true)).toBe(6); // floor(6.75)
  });

  it('a non-clean catch gets no 1.5', () => {
    expect(catchMemories(10, 1, false)).toBe(10);
    expect(catchMemories(10, 2, false)).toBe(20);
  });

  it('a tier-3 clean catch is weight × 3.5 × 1.5, floored at the record', () => {
    expect(catchMemories(10, 3, true)).toBe(52); // floor(52.5)
    expect(catchMemories(10, 3, false)).toBe(35);
  });

  it('CLEAN_MULT is exactly 1.5 and CONDOLENCE_RATE exactly 0.3', () => {
    expect(CLEAN_MULT).toBe(1.5);
    expect(CONDOLENCE_RATE).toBe(0.3);
  });
});

describe('condolence (30% floored per item, then summed)', () => {
  it('floor(rec.memories × 0.3) summed — NOT floor of the sum', () => {
    const haul = [rec({ memories: 15 }), rec({ memories: 52 }), rec({ memories: 35 })];
    // 4 + 15 + 10 = 29; floor(102 × 0.3) = 30 — the per-record floor must win
    expect(condolenceMemories(haul)).toBe(29);
  });

  it('a tester who dies every run still banks something (never floors to 0 when there is a haul)', () => {
    const haul = [rec({ memories: 4 })];
    expect(condolenceMemories(haul)).toBe(1); // floor(1.2)
    expect(haulMemories(haul, false)).toBe(1);
  });

  it('extraction keeps 100% of the haul', () => {
    const haul = [rec({ memories: 15 }), rec({ memories: 52 })];
    expect(haulMemories(haul, true)).toBe(67);
  });

  it('an empty haul is 0 either way', () => {
    expect(haulMemories([], true)).toBe(0);
    expect(haulMemories([], false)).toBe(0);
  });
});