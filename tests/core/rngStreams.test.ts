import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import {
  deriveSeed,
  createRng,
  createStreams,
  LAYOUT,
  LOOT,
  AI,
} from '../../src/core/rngStreams';

describe('Rng convenience methods (plan 03 §1.1 surface)', () => {
  it('range returns values in [a, b)', () => {
    const r = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
  });

  it('int returns inclusive integers in [a, b]', () => {
    const r = new Rng(11);
    for (let i = 0; i < 300; i++) {
      const v = r.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('chance(p) is deterministic and boundary-correct', () => {
    expect(new Rng(1).chance(0)).toBe(false);
    expect(new Rng(1).chance(1)).toBe(true);
    const a = new Rng(3);
    const b = new Rng(3);
    for (let i = 0; i < 100; i++) expect(a.chance(0.5)).toBe(b.chance(0.5));
  });

  it('pick always returns a member of the array', () => {
    const arr = [1, 2, 3];
    const r = new Rng(2);
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });

  it('shuffle is deterministic and preserves the multiset', () => {
    const s1 = new Rng(2).shuffle([1, 2, 3, 4, 5]);
    const s2 = new Rng(2).shuffle([1, 2, 3, 4, 5]);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('fork derives a child stream without touching the parent', () => {
    const seq: number[] = [];
    const parent = new Rng(5);
    const child = parent.fork(1);
    void child;
    for (let i = 0; i < 8; i++) seq.push(parent.nextU32());
    // a fresh parent reproduces the identical sequence → fork consumed nothing
    const fresh = new Rng(5);
    for (let i = 0; i < 8; i++) expect(fresh.nextU32()).toBe(seq[i]);
    // and the child stream is itself deterministic
    const childA = new Rng(5).fork(1);
    const childB = new Rng(5).fork(1);
    for (let i = 0; i < 100; i++) expect(childA.nextU32()).toBe(childB.nextU32());
  });
});

describe('RNG streams (plan 03 §1.2 — split layout/loot/AI from one run seed)', () => {
  it('same run seed + same stream → identical sequence', () => {
    const a = createRng(12345, LOOT);
    const b = createRng(12345, LOOT);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('different stream ids diverge from the same run seed', () => {
    const l = createRng(12345, LAYOUT);
    const o = createRng(12345, LOOT);
    const a = createRng(12345, AI);
    const seqs = [l, o, a].map((r) => Array.from({ length: 64 }, () => r.nextU32()));
    const sig = seqs.map((s) => s.join(','));
    expect(new Set(sig).size).toBe(3);
  });

  it('salted loot stream does not disturb the layout stream', () => {
    // plan §1.4: "Changing one stream's salt does not disturb the others' first 1000 outputs"
    const layoutA = createRng(42, LAYOUT);
    const layoutB = createRng(42, LAYOUT);
    const lootSalted = createRng(42, LOOT, 7);
    void lootSalted.nextU32();
    for (let i = 0; i < 1000; i++) expect(layoutA.nextU32()).toBe(layoutB.nextU32());
  });

  it('drawing from loot does not shift layout (independent instances)', () => {
    // plan §2.6 / task: stream independence — consuming one stream never advances another
    const s1 = createStreams(99);
    const s2 = createStreams(99);
    for (let i = 0; i < 500; i++) s1.loot.nextU32();
    for (let i = 0; i < 500; i++) expect(s1.layout.nextU32()).toBe(s2.layout.nextU32());
  });

  it('deriveSeed is deterministic, salt-sensitive, and always 32-bit', () => {
    expect(deriveSeed(7, LOOT)).toBe(deriveSeed(7, LOOT));
    expect(deriveSeed(7, LOOT, 1)).not.toBe(deriveSeed(7, LOOT));
    for (const s of [0, 1, 42, 4294967295]) {
      for (const st of [LAYOUT, LOOT, AI]) {
        const v = deriveSeed(s, st);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });
});