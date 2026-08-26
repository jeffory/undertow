// THE TOWNSHIP (M7 round 1, plan 05 §2.2) — the drowned Hollow's generator and
// the ROOF-AS-ISLET mapping it rests on.
//
// Three things are on trial here:
//   1. ZONE GATING — only zone 3 drowns a town, and zones 1/2 are untouched:
//      no roofs, no roof islets, and no `deckRise` key anywhere on their maps.
//   2. PLACEMENT — deterministic, 8-14 roofs on a street line, and the kelp
//      clearance contract (sinkhole mouths, buoys, wrecks, the run-start spawn,
//      the natural shores, and each other).
//   3. THE MAPPING — a roof IS an islet: dockable, hull-collidable, flat under
//      groundYAt, and walkable through the real collision system.
//
// Pure: no three, no DOM.

import { describe, it, expect } from 'vitest';
import { generateLake, MIN_ISLETS, MAX_ISLETS } from '../../src/gen/lakeMap';
import {
  ROOF_MIN,
  ROOF_MAX,
  TOWNSHIP_ZONE,
  TOWNSHIP_CLEARANCE,
  roofPolygon,
  roofForIslet,
  STEEPLE_BUILDING,
  MARQUEE_BUILDING,
} from '../../src/gen/township';
import { isletHeightAt } from '../../src/gen/isletHeight';
import { shoreAttenAt } from '../../src/core/shore';
import { isSelfIntersecting, pointInConvex, pointInPolygon, distanceToHull } from '../../src/core/poly';
import { createWorld } from '../../src/core/world';
import { collision } from '../../src/core/systems';
import {
  boatSpawnDist,
  dockPlayer,
  nearestDockableIslet,
  DOCK_RANGE,
} from '../../src/gen/lakeWorld';
import { zoneFogTint } from '../../src/core/zones';
import { updateSpawnDirectorSystem } from '../../src/systems/spawnDirector';

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2024, 555, 777, 9000, 31415, 616];

const reachOf = (r: { halfX: number; halfZ: number }): number => Math.hypot(r.halfX, r.halfZ);

// The natural (pre-township) islets of a map — everything that is not a roof.
const naturalIslets = (m: ReturnType<typeof generateLake>) => m.islets.filter((i) => i.kind !== 'roof');

const spawnPoint = (m: ReturnType<typeof generateLake>) => ({
  x: m.islets[m.startIslet]!.center.x + boatSpawnDist(m),
  z: m.islets[m.startIslet]!.center.z,
});

describe('township: zone gating (zones 1/2 are untouched)', () => {
  it('only the Township drowns a town — every other zone is dry', () => {
    for (const seed of SEEDS) {
      for (const zone of [1, 2, 3, 4, 5]) {
        const m = generateLake(seed, zone);
        if (zone === TOWNSHIP_ZONE) {
          expect(m.roofs.length, `seed ${seed}`).toBeGreaterThan(0);
          expect(m.street).not.toBeNull();
        } else {
          expect(m.roofs, `seed ${seed} zone ${zone}`).toEqual([]);
          expect(m.lamps).toEqual([]);
          expect(m.envPoints).toEqual([]);
          expect(m.street).toBeNull();
        }
      }
    }
  });

  it('no zone but the Township carries a roof islet, and none carries a deckRise', () => {
    for (const seed of SEEDS) {
      for (const zone of [1, 2, 4, 5]) {
        const m = generateLake(seed, zone);
        for (const iso of m.islets) {
          expect(iso.kind === 'walkable' || iso.kind === 'rock', `seed ${seed} zone ${zone}`).toBe(true);
          // the key must be ABSENT (not undefined-valued) so a zone-1/2 map is
          // byte-identical to its pre-M7 self under a deep compare
          expect(Object.prototype.hasOwnProperty.call(iso, 'deckRise')).toBe(false);
        }
      }
    }
  });

  it('zones 1/2 still hold MIN..MAX islets — the roofs never inflate them', () => {
    for (const seed of SEEDS) {
      for (const zone of [1, 2]) {
        const m = generateLake(seed, zone);
        expect(m.islets.length).toBeGreaterThanOrEqual(MIN_ISLETS);
        expect(m.islets.length).toBeLessThanOrEqual(MAX_ISLETS);
      }
    }
  });

  it('the natural half of a zone-3 map is still a MIN..MAX-islet archipelago', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      const natural = naturalIslets(m);
      expect(natural.length).toBeGreaterThanOrEqual(MIN_ISLETS);
      expect(natural.length).toBeLessThanOrEqual(MAX_ISLETS);
      // roofs are APPENDED — every natural islet keeps the index it had
      for (let i = 0; i < natural.length; i++) expect(natural[i]!.id).toBe(i);
      expect(m.startIslet).toBe(0);
      // …so the path graph, built before them, still only names natural islets
      for (const [a, b] of m.graph.edges) {
        expect(a).toBeLessThan(natural.length);
        expect(b).toBeLessThan(natural.length);
      }
    }
  });
});

describe('township: determinism', () => {
  it('same (seed, zone) → an identical drowned street', () => {
    for (const seed of SEEDS) {
      const a = generateLake(seed, 3);
      const b = generateLake(seed, 3);
      expect(a.roofs).toEqual(b.roofs);
      expect(a.lamps).toEqual(b.lamps);
      expect(a.envPoints).toEqual(b.envPoints);
      expect(a.street).toEqual(b.street);
      expect(a.islets).toEqual(b.islets);
    }
  });

  it('a different run seed lays a different street', () => {
    const a = generateLake(616, 3).roofs;
    const b = generateLake(617, 3).roofs;
    expect(a).not.toEqual(b);
  });
});

describe('township: the street', () => {
  it('grows ROOF_MIN..ROOF_MAX roofs on every seed', () => {
    for (const seed of SEEDS) {
      const n = generateLake(seed, 3).roofs.length;
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(ROOF_MIN);
      expect(n, `seed ${seed}`).toBeLessThanOrEqual(ROOF_MAX);
    }
  });

  it('exactly one steeple and exactly one marquee, on their own buildings', () => {
    for (const seed of SEEDS) {
      const roofs = generateLake(seed, 3).roofs;
      const steeples = roofs.filter((r) => r.slot === 'steeple');
      const marquees = roofs.filter((r) => r.slot === 'marquee');
      expect(steeples).toHaveLength(1);
      expect(marquees).toHaveLength(1);
      expect(steeples[0]!.building).toBe(STEEPLE_BUILDING);
      expect(marquees[0]!.building).toBe(MARQUEE_BUILDING);
      // the steeple stands proudest of the flood — least sunk of all of them
      for (const r of roofs) {
        expect(steeples[0]!.waterlineFrac).toBeLessThanOrEqual(r.waterlineFrac);
      }
    }
  });

  it('lights the street with sodium lamps (1..7, none inside a roof)', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      expect(m.lamps.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(m.lamps.length).toBeLessThanOrEqual(7);
      for (const lamp of m.lamps) {
        for (const iso of m.islets) {
          expect(pointInPolygon(lamp.pos, iso.poly), `seed ${seed} lamp ${lamp.id}`).toBe(false);
        }
      }
    }
  });

  it('the roofs run along ONE street line, split across its two banks', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      const st = m.street!;
      const sides = new Set(m.roofs.map((r) => r.side));
      expect(sides.size).toBe(2);
      for (const roof of m.roofs) {
        // decompose the roof's offset from the street origin into (along, across)
        const dx = roof.pos.x - st.origin.x;
        const dz = roof.pos.z - st.origin.z;
        const along = dx * st.dir.x + dz * st.dir.z;
        const across = dx * st.perp.x + dz * st.perp.z;
        expect(along).toBeGreaterThan(0);
        expect(along).toBeLessThanOrEqual(st.length + 2);
        // never in the channel itself: the road stays rowable
        expect(Math.abs(across)).toBeGreaterThan(6.9);
        expect(Math.abs(across)).toBeLessThan(22);
      }
    }
  });
});

describe('township: clearance (the kelp contract)', () => {
  it('no roof blocks a sinkhole mouth, a bell buoy, a wreck or the run-start spawn', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      const keepOut = [
        ...m.sinkholes.flatMap((s) => [s.mouth, s.pos]),
        ...m.buoys.map((b) => b.pos),
        ...m.wrecks.map((w) => w.pos),
        spawnPoint(m),
      ];
      for (const roof of m.roofs) {
        for (const k of keepOut) {
          const gap = Math.hypot(roof.pos.x - k.x, roof.pos.z - k.z) - reachOf(roof);
          expect(gap, `seed ${seed} roof ${roof.id}`).toBeGreaterThanOrEqual(TOWNSHIP_CLEARANCE - 1e-6);
        }
      }
    }
  });

  it('every roof stands in FULL open water — clear of every natural shore band', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      const natural = naturalIslets(m);
      for (const roof of m.roofs) {
        expect(shoreAttenAt(natural, roof.pos.x, roof.pos.z), `seed ${seed} roof ${roof.id}`).toBe(1);
        for (const v of roofPolygon(roof.pos, roof.yaw, roof.halfX, roof.halfZ)) {
          expect(shoreAttenAt(natural, v.x, v.z)).toBe(1);
        }
      }
    }
  });

  it('roofs do not fuse: every pair keeps a channel between its rims', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      for (let i = 0; i < m.roofs.length; i++) {
        for (let j = i + 1; j < m.roofs.length; j++) {
          const a = m.roofs[i]!;
          const b = m.roofs[j]!;
          const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
          expect(d, `seed ${seed} pair ${i},${j}`).toBeGreaterThan(reachOf(a) + reachOf(b));
        }
      }
    }
  });

  it('stays inside the lake box with a margin', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      for (const roof of m.roofs) {
        expect(Math.abs(roof.pos.x)).toBeLessThan(m.bounds.w / 2 - 10);
        expect(Math.abs(roof.pos.z)).toBeLessThan(m.bounds.h / 2 - 10);
      }
    }
  });
});

describe('township: a roof IS an islet (the mapping)', () => {
  it('each roof owns a `kind: roof` islet whose polygon is the roof outline', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      const natural = naturalIslets(m).length;
      m.roofs.forEach((roof, i) => {
        expect(roof.isletId).toBe(natural + i);
        const iso = m.islets[roof.isletId]!;
        expect(iso.kind).toBe('roof');
        expect(iso.zone).toBe(3);
        expect(iso.deckRise).toBe(roof.deckRise);
        expect(iso.poly).toEqual(roofPolygon(roof.pos, roof.yaw, roof.halfX, roof.halfZ));
        expect(roofForIslet(m.roofs, roof.isletId)).toBe(roof);
      });
    }
  });

  it('roof polygons satisfy the same shape contract every islet does', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      for (const iso of m.islets.filter((i) => i.kind === 'roof')) {
        expect(iso.poly.length).toBeGreaterThanOrEqual(6);
        expect(isSelfIntersecting(iso.poly)).toBe(false);
        for (const v of iso.poly) expect(pointInConvex(v, iso.hull)).toBe(true);
        expect(iso.hull.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the deck is FLAT: isletHeightAt returns deckRise everywhere on it', () => {
    const m = generateLake(616, 3);
    for (const roof of m.roofs) {
      const iso = m.islets[roof.isletId]!;
      for (const at of [
        { x: roof.pos.x, z: roof.pos.z },
        { x: roof.pos.x + roof.halfX * 0.8, z: roof.pos.z },
        { x: roof.pos.x, z: roof.pos.z - roof.halfZ * 0.8 },
        ...iso.poly,
      ]) {
        expect(isletHeightAt(iso, at.x, at.z)).toBe(roof.deckRise);
      }
    }
    // and a natural islet still domes, so nothing else changed
    const rock = m.islets[0]!;
    expect(isletHeightAt(rock, rock.center.x, rock.center.z)).toBeGreaterThan(
      isletHeightAt(rock, rock.poly[0]!.x, rock.poly[0]!.z),
    );
  });

  it('a roof is DOCKABLE from the water with the ordinary B verb', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 3);
    const roof = w.lake.roofs[0]!;
    const iso = w.lake.islets[roof.isletId]!;
    // a hull sitting just off the roof's edge, the way the boat parks to dock
    const edge = iso.poly[0]!;
    const out = Math.hypot(edge.x - roof.pos.x, edge.z - roof.pos.z);
    const at = {
      x: roof.pos.x + ((edge.x - roof.pos.x) / out) * (out + 1),
      z: roof.pos.z + ((edge.z - roof.pos.z) / out) * (out + 1),
    };
    expect(distanceToHull(at, iso.hull)).toBeLessThanOrEqual(DOCK_RANGE);
    const found = nearestDockableIslet(w, at.x, at.z, DOCK_RANGE);
    expect(found).not.toBeNull();
    expect(found!.kind).toBe('roof');
    expect(found!.id).toBe(roof.isletId);
  });

  it('docking onto a roof puts the keeper ON it, in foot mode, inside the hull', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 3);
    const roof = w.lake.roofs[2]!;
    dockPlayer(w, roof.isletId, { x: roof.pos.x, z: roof.pos.z });
    expect(w.mode).toBe('foot');
    expect(w.dockedIslet).toBe(roof.isletId);
    expect(pointInConvex({ x: w.player.x, z: w.player.z }, w.lake.islets[roof.isletId]!.hull)).toBe(true);
  });

  it('the roof is WALKABLE: the real collision system holds the keeper on the slates', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 3);
    const roof = w.lake.roofs[2]!;
    const iso = w.lake.islets[roof.isletId]!;
    dockPlayer(w, roof.isletId, { x: roof.pos.x, z: roof.pos.z });

    // walk hard off every edge in turn; collision must clamp back onto the deck
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7]]) {
      w.player.x = roof.pos.x + dx * 40;
      w.player.z = roof.pos.z + dz * 40;
      collision(w, 1 / 60);
      expect(pointInConvex({ x: w.player.x, z: w.player.z }, iso.hull)).toBe(true);
      const d = Math.hypot(w.player.x - roof.pos.x, w.player.z - roof.pos.z);
      expect(d).toBeLessThanOrEqual(reachOf(roof) + 0.01);
    }
  });

  it('no land fish flops on the slates — so the foot cast flow can actually cast', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 3);
    w.run.zone = 3;
    const roof = w.lake.roofs[0]!;
    dockPlayer(w, roof.isletId, { x: roof.pos.x, z: roof.pos.z });
    for (let i = 0; i < 5; i++) updateSpawnDirectorSystem(w, 1 / 60);
    expect(w.fish).toBeNull(); // castFlow's foot caster requires exactly this

    // …and a NATURAL shore still gets its M1 scaffold fish, untouched
    const natural = w.lake.islets.find((i) => i.kind === 'walkable')!;
    dockPlayer(w, natural.id, { x: natural.center.x, z: natural.center.z });
    updateSpawnDirectorSystem(w, 1 / 60);
    expect(w.fish).not.toBeNull();
  });

  it('a roof is not a rock: it stays out of the spawn director’s walkable pool', () => {
    const m = generateLake(616, 3);
    const walkable = m.islets.filter((i) => i.kind === 'walkable');
    expect(walkable.every((i) => i.deckRise === undefined)).toBe(true);
    expect(m.islets.some((i) => i.kind === 'roof')).toBe(true);
  });
});

describe('township: environmental-text points', () => {
  it('one point per roof, plus the marquee and the letterbox', () => {
    for (const seed of SEEDS) {
      const m = generateLake(seed, 3);
      // M7 boss (05 §2.2): the drowned Post Office carries a SECOND point — the
      // letterbox marker the Postmaster is summoned at — appended after every
      // other point so no existing env point's id moved. It is GUARANTEED: the
      // arena has to exist on every street.
      expect(m.roofs.some((r) => r.slot === 'house' && r.building === 'post-office')).toBe(true);
      expect(m.envPoints.length).toBe(m.roofs.length + 2);
      const roofIds = m.envPoints
        .filter((p) => p.key !== 'marquee' && p.key !== 'post-office-door')
        .map((p) => p.roofId)
        .sort((a, b) => a - b);
      expect(roofIds).toEqual(m.roofs.map((r) => r.id));
      const marquee = m.envPoints.find((p) => p.key === 'marquee')!;
      expect(marquee.radius).toBeGreaterThan(10); // reads from the boat, down the street
      expect(m.roofs[marquee.roofId]!.slot).toBe('marquee');
    }
  });

  it('the landmarks get their own keys', () => {
    const m = generateLake(616, 3);
    const keys = m.envPoints.map((p) => p.key);
    expect(keys).toContain('steeple');
    expect(keys).toContain('cinema-roof');
    expect(keys).toContain('marquee');
  });
});

describe('township: the sodium-amber fog nudge', () => {
  it('zones 1 and 2 are untinted (strength exactly 0)', () => {
    expect(zoneFogTint(1).strength).toBe(0);
    expect(zoneFogTint(2).strength).toBe(0);
  });

  it('the Township warms the fog a little, and only a little', () => {
    const t = zoneFogTint(3);
    expect(t.strength).toBeGreaterThan(0);
    expect(t.strength).toBeLessThan(0.25); // a seasoning, not a repaint
    // sodium amber: red-dominant, blue-poor
    const r = (t.color >> 16) & 0xff;
    const b = t.color & 0xff;
    expect(r).toBeGreaterThan(b);
  });
});
