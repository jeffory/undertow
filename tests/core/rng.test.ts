import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('Rng (PCG32)', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.nextU32()).toBe(b.nextU32());
    }
  });

  it('different seeds diverge', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let diverged = false;
    for (let i = 0; i < 64; i++) {
      if (a.nextU32() !== b.nextU32()) {
        diverged = true;
        break;
      }
    }
    expect(diverged).toBe(true);
  });

  it('nextFloat returns values in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('regression anchor: first 8 u32s for seed 1', () => {
    const r = new Rng(1);
    const seq = Array.from({ length: 8 }, () => r.nextU32());
    expect(seq).toEqual([
      3380776849, 361947764, 3223725655, 2781001427,
      2944471638, 1813784697, 806554406, 2629966899,
    ]);
  });
});