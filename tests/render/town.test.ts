// THE STREET, AT REAL SCALE — task t20. The restored buildings stopped being
// 1.5 m stub boxes and became generated meshes normalized to a 4.0–5.4 m
// footprint, which is WIDER than hubStreet's slot spacing on a small islet.
// render/town.ts therefore fits each building to its share of the street; these
// are the arithmetic guards on that fit, plus the loader-seam contract (a
// building that has no mesh yet must still stand as its stub).
//
// Pure Node + three (no DOM, no GL): only the module's pure helpers are called.

import { describe, it, expect } from 'vitest';
import { generateLake } from '../../src/gen/lakeMap';
import { isletMaxRadius } from '../../src/gen/isletHeight';
import { townSlots } from '../../src/meta/hubStreet';
import { BUILDINGS } from '../../src/content/buildings';
import { streetFitScale, tightestSlotGap, townAssetId, townModelUrl } from '../../src/render/town';

const SEEDS = [1, 7, 2026, 99999, 4242];

// The footprints tools/blender/prep.py normalized the eight buildings to.
const FOOTPRINTS = [4.6, 5.0, 5.0, 4.0, 5.4, 4.6, 5.0, 5.2];

function startIslet(seed: number) {
  const lake = generateLake(seed, 1);
  return lake.islets[lake.startIslet]!;
}

describe('street fit', () => {
  it('reads the tightest gap off the slots themselves, not a duplicated constant', () => {
    for (const seed of SEEDS) {
      const iso = startIslet(seed);
      const slots = townSlots(iso, BUILDINGS.length);
      const gap = tightestSlotGap(slots);
      // Every pair really is at least this far apart, and some pair is exactly
      // this far apart — i.e. the helper found the minimum, not an estimate.
      let seenMin = false;
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const d = Math.hypot(slots[i]!.x - slots[j]!.x, slots[i]!.z - slots[j]!.z);
          expect(d).toBeGreaterThanOrEqual(gap - 1e-9);
          if (Math.abs(d - gap) < 1e-9) seenMin = true;
        }
      }
      expect(seenMin).toBe(true);
      expect(gap).toBeGreaterThan(0);
    }
  });

  it('no restored building is wider than the gap to its nearest neighbour', () => {
    for (const seed of SEEDS) {
      const iso = startIslet(seed);
      const slots = townSlots(iso, BUILDINGS.length);
      const gap = tightestSlotGap(slots);
      for (let i = 0; i < BUILDINGS.length; i++) {
        const footprint = FOOTPRINTS[i]!;
        const fitted = footprint * streetFitScale(footprint, gap) * slots[i]!.scale;
        // ±9% slot jitter is applied on top of the fit, so allow for it: the
        // guarantee is that a building never spans the whole gap.
        expect(fitted).toBeLessThan(gap);
      }
    }
  });

  it('scales down to fit but never inflates a building that already fits', () => {
    expect(streetFitScale(2, 10)).toBe(1); // 2 m premises on a 10 m gap: untouched
    expect(streetFitScale(5, 4)).toBeCloseTo((4 * 0.85) / 5, 6);
    // Degenerate inputs fall back to 1 rather than NaN/Infinity scale.
    expect(streetFitScale(0, 4)).toBe(1);
    expect(streetFitScale(5, 0)).toBe(1);
  });

  it('the smallest islet the generator makes still holds all eight premises', () => {
    let worst = Infinity;
    for (let seed = 1; seed <= 60; seed++) {
      const iso = startIslet(seed);
      const gap = tightestSlotGap(townSlots(iso, BUILDINGS.length));
      worst = Math.min(worst, gap / isletMaxRadius(iso));
      expect(gap).toBeGreaterThan(1); // a metre of street per building, minimum
    }
    // The spacing is a fixed fraction of the islet radius — the same on every
    // seed — so the fit rule scales with the islet instead of a magic number.
    expect(worst).toBeGreaterThan(0.3);
  });
});

describe('the per-building loader seam', () => {
  it('each building has its own asset id and url, one per ledger row', () => {
    const ids = BUILDINGS.map((b) => townAssetId(b.id));
    const urls = BUILDINGS.map((b) => townModelUrl(b.id));
    expect(new Set(ids).size).toBe(BUILDINGS.length);
    expect(new Set(urls).size).toBe(BUILDINGS.length);
    // Namespaced so a building can never collide with a manifest asset id.
    expect(ids.every((id) => id.startsWith('town:'))).toBe(true);
    expect(townAssetId('smokehouse')).toBe('town:smokehouse');
    expect(townModelUrl('smokehouse')).toBe('/assets/town/smokehouse.glb');
  });

  it('the town meshes are NOT in the boot manifest (a fresh save fetches none)', async () => {
    const manifest = (await import('../../assets/manifest.json')).default as Record<string, unknown>;
    for (const b of BUILDINGS) {
      expect(manifest[b.id]).toBeUndefined();
      expect(manifest[townAssetId(b.id)]).toBeUndefined();
    }
  });
});
