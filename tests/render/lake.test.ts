// DRIFTWOOD PROPS — T14 determinism (render/lake.ts computeTimberSpawns). The
// placement is pure + seeded from a salted LAYOUT stream off the lake seed, so
// the same run seed must produce byte-identical driftwood every call — and the
// pieces must sit in OPEN water (shoreAttenAt === 1), not on or against islets.
// Pure Node + three (no DOM).

import { describe, it, expect } from 'vitest';
import { generateLake } from '../../src/gen/lakeMap';
import { shoreAttenAt } from '../../src/core/shore';
import { computeTimberSpawns } from '../../src/render/lake';

describe('floating timber (T14)', () => {
  const seeds = [1, 7, 42, 977];

  it('is deterministic: the same seed yields identical spawns every call', () => {
    for (const s of seeds) {
      const lake = generateLake(s);
      const a = computeTimberSpawns(lake);
      const b = computeTimberSpawns(lake);
      expect(a).toEqual(b);
      expect(a).toHaveLength(b.length);
    }
  });

  it('lands 10-14 pieces inside the lake bounds', () => {
    for (const s of seeds) {
      const lake = generateLake(s);
      const spawns = computeTimberSpawns(lake);
      expect(spawns.length, `seed ${s}`).toBeGreaterThanOrEqual(10);
      expect(spawns.length, `seed ${s}`).toBeLessThanOrEqual(14);
      for (const sp of spawns) {
        expect(Math.abs(sp.x), `seed ${s} x`).toBeLessThanOrEqual(lake.bounds.w / 2);
        expect(Math.abs(sp.z), `seed ${s} z`).toBeLessThanOrEqual(lake.bounds.h / 2);
      }
    }
  });

  it('scatters pieces in open water, clear of every islet shore band', () => {
    for (const s of seeds) {
      const lake = generateLake(s);
      const spawns = computeTimberSpawns(lake);
      expect(spawns.length).toBeGreaterThan(0);
      for (const sp of spawns) {
        expect(shoreAttenAt(lake.islets, sp.x, sp.z), `seed ${s} at (${sp.x.toFixed(1)}, ${sp.z.toFixed(1)})`).toBe(1);
      }
    }
  });
});