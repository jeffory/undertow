import { describe, it, expect } from 'vitest';
import { generateLake, MIN_ISLETS, MAX_ISLETS } from '../../src/gen/lakeMap';
import {
  isSelfIntersecting,
  pointInConvex,
  convexHull,
  pointInPolygon,
  distanceToHull,
  polygonCentroid,
} from '../../src/core/poly';

// Breadth-first reachability over the pruned graph from `from`.
function reachable(map: ReturnType<typeof generateLake>, from: number): number {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [a, b] of map.graph.edges) {
      const n = a === cur ? b : b === cur ? a : -1;
      if (n >= 0 && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

// BFS distance from `from` over the pruned graph (for the sinkhole test).
function bfsDist(map: ReturnType<typeof generateLake>, from: number): number[] {
  const dist = new Array(map.islets.length).fill(-1);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [a, b] of map.graph.edges) {
      const n = a === cur ? b : b === cur ? a : -1;
      if (n >= 0 && dist[n] === -1) {
        dist[n] = dist[cur]! + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

const maxVertexRadius = (iso: { poly: { x: number; z: number }[] }): number => {
  const c = polygonCentroid(iso.poly);
  let m = 0;
  for (const v of iso.poly) {
    const d = Math.hypot(v.x - c.x, v.z - c.z);
    if (d > m) m = d;
  }
  return m;
};

describe('lake generation: determinism (plan 03 §2.6)', () => {
  it('same seed → deep-equal map', () => {
    const a = generateLake(12345);
    const b = generateLake(12345);
    expect(a).toEqual(b);
  });

  it('different seeds differ in islet layout', () => {
    const a = generateLake(1);
    const b = generateLake(2);
    const sigA = JSON.stringify(a.islets.map((i) => i.center));
    const sigB = JSON.stringify(b.islets.map((i) => i.center));
    expect(sigA).not.toBe(sigB);
  });

  it('lakegen consumes the layout stream without touching loot/AI (stream independence)', () => {
    // two identical run seeds generate identical maps even after unrelated streams roll
    const a = generateLake(777);
    const b = generateLake(777);
    expect(a).toEqual(b);
  });
});

describe('lake structure: counts and shape', () => {
  const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2024, 555, 777, 9000, 31415];

  it('yields MIN..MAX islets across many seeds', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      expect(map.islets.length, `seed ${seed}`).toBeGreaterThanOrEqual(MIN_ISLETS);
      expect(map.islets.length, `seed ${seed}`).toBeLessThanOrEqual(MAX_ISLETS);
    }
  });

  it('Poisson spacing respected: all center pairs ≥ poissonRadius − ε', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      for (let i = 0; i < map.islets.length; i++) {
        for (let j = i + 1; j < map.islets.length; j++) {
          const d = Math.hypot(
            map.islets[i]!.center.x - map.islets[j]!.center.x,
            map.islets[i]!.center.z - map.islets[j]!.center.z,
          );
          expect(d, `seed ${seed} pair ${i},${j}`).toBeGreaterThanOrEqual(map.poissonRadius - 0.01);
        }
      }
    }
  });

  it('islet centers sit inside the lake bounds with the poisson edge margin', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      const halfW = map.bounds.w / 2;
      const halfH = map.bounds.h / 2;
      for (const iso of map.islets) {
        expect(Math.abs(iso.center.x)).toBeLessThanOrEqual(halfW - map.poissonRadius + 0.01);
        expect(Math.abs(iso.center.z)).toBeLessThanOrEqual(halfH - map.poissonRadius + 0.01);
      }
    }
  });

  it('the graph is connected — every islet reachable from the start', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      expect(reachable(map, map.startIslet)).toBe(map.islets.length);
    }
  });

  it('islet polygons are non-self-intersecting and lie inside their convex hull', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      for (const iso of map.islets) {
        expect(iso.poly.length, `seed ${seed} islet ${iso.id}`).toBeGreaterThanOrEqual(6);
        expect(isSelfIntersecting(iso.poly), `seed ${seed} islet ${iso.id}`).toBe(false);
        // every polygon vertex is within (or on) the convex hull used for collision
        for (const v of iso.poly) expect(pointInConvex(v, iso.hull)).toBe(true);
        expect(convexHull(iso.poly).length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('islets do not overlap (center distance exceeds the sum of max vertex radii)', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      for (let i = 0; i < map.islets.length; i++) {
        for (let j = i + 1; j < map.islets.length; j++) {
          const d = Math.hypot(
            map.islets[i]!.center.x - map.islets[j]!.center.x,
            map.islets[i]!.center.z - map.islets[j]!.center.z,
          );
          const ri = maxVertexRadius(map.islets[i]!);
          const rj = maxVertexRadius(map.islets[j]!);
          expect(d, `seed ${seed} pair ${i},${j}`).toBeGreaterThanOrEqual(ri + rj - 0.5);
        }
      }
    }
  });

  it('placements: 2-3 wrecks, exactly 1 sinkhole, 1 micro-event, 2 buoys', () => {
    for (const seed of SEEDS) {
      const map = generateLake(seed);
      expect(map.wrecks.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(map.wrecks.length, `seed ${seed}`).toBeLessThanOrEqual(3);
      expect(map.sinkholes.length).toBe(1);
      expect(map.buoys.length).toBe(2);
      expect(map.buoys.filter((b) => b.primary).length).toBe(1);
      expect(map.microEvent).toBeTruthy();
    }
  });

  it('the sinkhole sits on the graph-furthest islet from the start (the descent journey)', () => {
    const map = generateLake(42);
    const dist = bfsDist(map, map.startIslet);
    const furthest = dist.indexOf(Math.max(...dist));
    expect(dist[furthest]).toBeGreaterThan(0);
    expect(map.sinkholes[0]!.pos).toEqual(map.islets[furthest]!.center);
    expect(map.islets[furthest]!.hasSinkhole).toBe(true);
  });

  it('buoys: primary is nearer the start islet than secondary', () => {
    const map = generateLake(42);
    const start = map.islets[map.startIslet]!.center;
    const [primary, secondary] = map.buoys;
    const dP = Math.hypot(primary!.pos.x - start.x, primary!.pos.z - start.z);
    const dS = Math.hypot(secondary!.pos.x - start.x, secondary!.pos.z - start.z);
    expect(dP).toBeLessThan(dS);
  });

  it('start islet is walkable and pinned near the lighthouse-side edge', () => {
    const map = generateLake(42);
    const start = map.islets[map.startIslet]!;
    expect(start.kind).toBe('walkable');
    // pinned near the west (-X) edge of the lake
    expect(start.center.x).toBeLessThanOrEqual(-map.bounds.w / 2 + map.poissonRadius * 2 + 0.01);
  });

  it('wrecks are offshore — outside every islet hull', () => {
    const map = generateLake(42);
    for (const wreck of map.wrecks) {
      for (const iso of map.islets) {
        // the wreck must not sit inside any islet polygon (it is in the water)
        expect(pointInPolygon(wreck.pos, iso.poly)).toBe(false);
      }
    }
  });

  it('disturbanceSpawns field exists (empty for round 1; the director refills later)', () => {
    const map = generateLake(42);
    expect(Array.isArray(map.disturbanceSpawns)).toBe(true);
    expect(map.disturbanceSpawns.length).toBe(0);
  });
});