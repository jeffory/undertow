// KELP GRAVES field (M6, plan 05 §2.1) — placement determinism, the clearance
// invariants the zone's navigability depends on (sinkhole mouths, bell buoys,
// islets, the run-start spawn), and the two pure geometry primitives the sim
// hangs off the field: the drag-snag arrest and the partial-LOS test.
//
// Pure: no three, no DOM.

import { describe, it, expect } from 'vitest';
import { generateLake, boatSpawnDistFor } from '../../src/gen/lakeMap';
import type { LakeMap } from '../../src/gen/lakeMap';
import {
  KELP_CLEARANCE,
  KELP_RADIUS,
  KELP_ZONE,
  MAX_KELP_COLUMNS,
  computeKelpColumns,
  resolveKelpSnag,
  segmentCrossesKelp,
} from '../../src/gen/kelp';
import { shoreAttenAt } from '../../src/core/shore';
import { pointInPolygon } from '../../src/core/poly';

const SEEDS = [1, 7, 42, 616, 1234, 20250826, 99999];

const spawnPoint = (lake: LakeMap) => ({
  x: lake.islets[lake.startIslet]!.center.x + boatSpawnDistFor(lake.poissonRadius),
  z: lake.islets[lake.startIslet]!.center.z,
});

describe('kelp field: zone gating', () => {
  it('only the Kelp Graves grows kelp — every other zone is bare', () => {
    for (const seed of SEEDS) {
      for (const zone of [1, 2, 3, 4, 5]) {
        const lake = generateLake(seed, zone);
        if (zone === KELP_ZONE) expect(lake.kelp.length).toBeGreaterThan(0);
        else expect(lake.kelp).toEqual([]);
      }
    }
  });

  it('zone 1 is untouched: the Shallows carries no kelp instances at all', () => {
    for (const seed of SEEDS) {
      expect(generateLake(seed, 1).kelp).toHaveLength(0);
    }
  });
});

describe('kelp field: determinism (spec 8.3)', () => {
  it('same (runSeed, zone) → deep-equal field', () => {
    for (const seed of SEEDS) {
      expect(generateLake(seed, 2).kelp).toEqual(generateLake(seed, 2).kelp);
    }
  });

  it('different run seeds grow different fields', () => {
    const a = generateLake(616, 2).kelp;
    const b = generateLake(617, 2).kelp;
    expect(a.map((k) => [k.x, k.z])).not.toEqual(b.map((k) => [k.x, k.z]));
  });

  it('computeKelpColumns is pure — a repeat call on the same input matches', () => {
    const lake = generateLake(42, 2);
    const again = computeKelpColumns(lake, spawnPoint(lake));
    expect(again).toEqual(lake.kelp);
  });

  it('ids are dense and in placement order; every column carries the collider radius', () => {
    const lake = generateLake(616, 2);
    lake.kelp.forEach((col, i) => {
      expect(col.id).toBe(i);
      expect(col.radius).toBe(KELP_RADIUS);
      expect(col.height).toBeGreaterThan(0);
    });
  });
});

describe('kelp field: counts (perf budget — ONE instanced mesh)', () => {
  it('grows a field on every seed, never past the cap', () => {
    for (const seed of SEEDS) {
      const kelp = generateLake(seed, 2).kelp;
      expect(kelp.length).toBeGreaterThanOrEqual(40);
      expect(kelp.length).toBeLessThanOrEqual(MAX_KELP_COLUMNS);
    }
  });

  it('the field is clustered, not scattered — several columns per cluster', () => {
    const kelp = generateLake(616, 2).kelp;
    const clusters = new Set(kelp.map((k) => k.cluster));
    expect(clusters.size).toBeGreaterThanOrEqual(8);
    expect(kelp.length / clusters.size).toBeGreaterThan(3);
  });
});

describe('kelp field: clearance invariants', () => {
  it('never inside an islet polygon, and never in a shore band (open water only)', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed, 2);
      for (const col of lake.kelp) {
        for (const iso of lake.islets) {
          expect(pointInPolygon({ x: col.x, z: col.z }, iso.poly)).toBe(false);
        }
        expect(shoreAttenAt(lake.islets, col.x, col.z)).toBe(1);
      }
    }
  });

  it('never blocks a sinkhole mouth (or the gap itself)', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed, 2);
      expect(lake.sinkholes.length).toBeGreaterThan(0);
      for (const col of lake.kelp) {
        for (const s of lake.sinkholes) {
          expect(Math.hypot(col.x - s.mouth.x, col.z - s.mouth.z)).toBeGreaterThanOrEqual(
            KELP_CLEARANCE,
          );
          expect(Math.hypot(col.x - s.pos.x, col.z - s.pos.z)).toBeGreaterThanOrEqual(
            KELP_CLEARANCE,
          );
        }
      }
    }
  });

  it('never blocks a bell buoy — extraction stays reachable at depth', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed, 2);
      for (const col of lake.kelp) {
        for (const b of lake.buoys) {
          expect(Math.hypot(col.x - b.pos.x, col.z - b.pos.z)).toBeGreaterThanOrEqual(
            KELP_CLEARANCE,
          );
        }
      }
    }
  });

  it('never grows on the boat’s run-start spawn point', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed, 2);
      const spawn = spawnPoint(lake);
      for (const col of lake.kelp) {
        expect(Math.hypot(col.x - spawn.x, col.z - spawn.z)).toBeGreaterThanOrEqual(
          KELP_CLEARANCE,
        );
      }
    }
  });

  it('stays inside the lake box with a margin', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed, 2);
      for (const col of lake.kelp) {
        expect(Math.abs(col.x)).toBeLessThan(lake.bounds.w / 2);
        expect(Math.abs(col.z)).toBeLessThan(lake.bounds.h / 2);
      }
    }
  });
});

// --- the drag-snag resolver (the M6 pressure mechanic's geometry) --------------

const column = (x: number, z: number, id = 0) => ({
  id,
  cluster: 0,
  x,
  z,
  radius: KELP_RADIUS,
  height: 4,
  taper: 0.3,
  yaw: 0,
  swayAmp: 0,
  swayFreq: 0,
  swayPhase: 0,
});

describe('drag-snag: segment vs column', () => {
  it('an empty field never arrests anything', () => {
    const out = resolveKelpSnag([], { x: 0, z: 0 }, { x: 10, z: 0 }, 0.5);
    expect(out.snagged).toBe(false);
    expect(out.x).toBe(10);
    expect(out.arrested).toBe(0);
  });

  it('a clear drag is untouched — the destination is written verbatim', () => {
    const kelp = [column(5, 9)]; // well off the +X path
    const out = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 10, z: 0 }, 0.5);
    expect(out.snagged).toBe(false);
    expect(out.x).toBe(10);
    expect(out.z).toBe(0);
    expect(out.column).toBe(-1);
  });

  it('a drag through a column arrests AT the column edge (radius + body radius)', () => {
    const body = 0.5;
    const kelp = [column(6, 0)];
    const out = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 12, z: 0 }, body);
    expect(out.snagged).toBe(true);
    expect(out.column).toBe(0);
    const gap = Math.hypot(out.x - 6, out.z - 0);
    expect(gap).toBeGreaterThanOrEqual(KELP_RADIUS + body);
    expect(gap).toBeCloseTo(KELP_RADIUS + body, 3);
    // …and it stopped SHORT of where it was headed
    expect(out.x).toBeLessThan(12);
    expect(out.arrested).toBeCloseTo(12 - out.x, 6);
  });

  it('arrests at the NEAREST column when a drag would cross several', () => {
    const kelp = [column(9, 0, 0), column(4, 0, 1), column(6, 0, 2)];
    const out = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 12, z: 0 }, 0.5);
    expect(out.column).toBe(1);
    expect(out.x).toBeCloseTo(4 - (KELP_RADIUS + 0.5), 3);
  });

  it('a drag that stops short of a column is not arrested', () => {
    const kelp = [column(6, 0)];
    const out = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 4, z: 0 }, 0.5);
    expect(out.snagged).toBe(false);
    expect(out.x).toBe(4);
  });

  it('a body already inside a column is never arrested by it (it can always leave)', () => {
    const kelp = [column(0, 0)];
    const out = resolveKelpSnag(kelp, { x: 0.2, z: 0 }, { x: 6, z: 0 }, 0.5);
    expect(out.snagged).toBe(false);
    expect(out.x).toBe(6);
  });

  it('a zero-length pull is a no-op', () => {
    const kelp = [column(0.3, 0)];
    const out = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 0, z: 0 }, 0.5);
    expect(out.snagged).toBe(false);
    expect(out.arrested).toBe(0);
  });

  it('the arrest point rests OUTSIDE the collider, so the next step can arrest again', () => {
    const body = 0.5;
    const kelp = [column(6, 0)];
    const first = resolveKelpSnag(kelp, { x: 0, z: 0 }, { x: 12, z: 0 }, body);
    const second = resolveKelpSnag(kelp, { x: first.x, z: first.z }, { x: 12, z: 0 }, body);
    expect(second.snagged).toBe(true);
    expect(second.x).toBeLessThanOrEqual(first.x + 1e-6);
  });
});

describe('partial LOS: segmentCrossesKelp', () => {
  it('an empty field never occludes', () => {
    expect(segmentCrossesKelp([], { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
  });

  it('a column on the sight-line occludes', () => {
    expect(segmentCrossesKelp([column(10, 0)], { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(true);
  });

  it('a column beside the sight-line does not', () => {
    expect(segmentCrossesKelp([column(10, 4)], { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
  });

  it('a column BEHIND the viewer does not occlude (the segment is bounded)', () => {
    expect(segmentCrossesKelp([column(-10, 0)], { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
  });

  it('a column past the catch does not occlude either', () => {
    expect(segmentCrossesKelp([column(30, 0)], { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
  });

  it('pad widens the columns — a graze counts as weed', () => {
    const grazing = [column(10, 0.7)];
    expect(segmentCrossesKelp(grazing, { x: 0, z: 0 }, { x: 20, z: 0 })).toBe(false);
    expect(segmentCrossesKelp(grazing, { x: 0, z: 0 }, { x: 20, z: 0 }, 0.35)).toBe(true);
  });
});
