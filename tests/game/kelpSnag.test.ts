// KELP DRAG-SNAG (M6, plan 05 §2.1) — the pressure mechanic wired through the
// real constraint: a drag that would haul the player/boat through a kelp column
// arrests at the column edge, fires `kelpSnag`, and drops the drag's remaining
// energy; a clear drag is byte-for-byte the pull it always was; and zone 1 (no
// kelp) is untouched.
//
// Pure: no three, no DOM. Fixed-DT steps over minimal createWorld() worlds.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { collision } from '../../src/core/systems';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateTetherFishAI } from '../../src/game/fishAI';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import type { TetherEvent } from '../../src/game/tether';
import { generateLake } from '../../src/gen/lakeMap';
import { BOAT_HULL_RADIUS, resolveBoatObstacles } from '../../src/game/boatObstacle';
import { KELP_RADIUS } from '../../src/gen/kelp';
import type { KelpColumn } from '../../src/gen/kelp';
import type { WorldState } from '../../src/core/world';
import { zoneFogMultiplier } from '../../src/core/zones';

const DT = FIXED_DT;

const column = (x: number, z: number, id = 0): KelpColumn => ({
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

// A player-vs-fish fight with the catch far enough past L that the constraint
// hauls the keeper hard along +X, on a lake whose kelp field is exactly `kelp`.
// The player has mass 1 and the catch a big mass, so almost all of the
// correction lands on the keeper (which is what a "drag" is).
function draggedWorld(kelp: KelpColumn[], opts: { mass?: number } = {}): WorldState {
  const w = createWorld(616);
  w.lake = generateLake(616, 1); // zone-1 lake → no kelp of its own…
  w.lake.kelp = kelp; //           …then exactly the columns under test
  w.fish = createFish();
  w.fish.tether.mass = opts.mass ?? 400;
  w.fish.x = 40;
  w.fish.z = 0;
  startTetherFight(w, M2_SPECIES, 'player', { L: 8 });
  return w;
}

const snags = (w: WorldState): Extract<TetherEvent, { type: 'kelpSnag' }>[] =>
  w.tetherEvents.filter((e): e is Extract<TetherEvent, { type: 'kelpSnag' }> => e.type === 'kelpSnag');

describe('kelp drag-snag: the arrest', () => {
  it('a drag through a column arrests the keeper at the column edge', () => {
    const col = column(4, 0);
    const w = draggedWorld([col]);
    for (let i = 0; i < 240; i++) updateTetherConstraint(w, DT);
    const gap = Math.hypot(w.player.x - col.x, w.player.z - col.z);
    // pulled up to the stalk and stopped there — never through it
    expect(gap).toBeGreaterThanOrEqual(KELP_RADIUS + w.player.radius - 1e-6);
    expect(gap).toBeCloseTo(KELP_RADIUS + w.player.radius, 2);
    expect(w.player.x).toBeLessThan(col.x);
  });

  it('the same drag with NO kelp hauls the keeper straight past that point', () => {
    const clear = draggedWorld([]);
    for (let i = 0; i < 240; i++) updateTetherConstraint(clear, DT);
    expect(clear.player.x).toBeGreaterThan(4);
  });

  it('fires a kelpSnag event carrying the column, the anchor and the arrested metres', () => {
    const w = draggedWorld([column(4, 0, 3)]);
    let ev: Extract<TetherEvent, { type: 'kelpSnag' }> | undefined;
    for (let i = 0; i < 240 && !ev; i++) {
      w.tetherEvents.length = 0;
      updateTetherConstraint(w, DT);
      ev = snags(w)[0];
    }
    expect(ev).toBeDefined();
    expect(ev!.anchor).toBe('player');
    expect(ev!.column).toBe(3);
    expect(ev!.fightId).toBe(w.tether.fights[0]!.id);
    expect(ev!.arrested).toBeGreaterThan(0);
    expect(Math.hypot(ev!.at.x - 4, ev!.at.z)).toBeCloseTo(KELP_RADIUS + w.player.radius, 2);
  });

  it('drops the drag’s remaining energy — no drag event fires from an arrested pull', () => {
    const w = draggedWorld([column(4, 0)]);
    let sawSnag = false;
    let dragsAfterSnag = 0;
    for (let i = 0; i < 300 && w.tether.fights.length > 0; i++) {
      w.tetherEvents.length = 0;
      updateTetherConstraint(w, DT);
      for (const e of w.tetherEvents) {
        if (e.type === 'kelpSnag') sawSnag = true;
        if (e.type === 'drag' && sawSnag) dragsAfterSnag++;
      }
      // an arrested pull leaves nothing in the drag window to fire from
      const live = w.tether.fights[0];
      if (sawSnag && live) expect(live.drag.accumulated).toBe(0);
    }
    expect(sawSnag).toBe(true);
    expect(dragsAfterSnag).toBe(0);
  });

  it('the arrest is rate-limited — a pinned keeper does not spam the stream', () => {
    const w = draggedWorld([column(4, 0)]);
    let events = 0;
    for (let i = 0; i < 120; i++) {
      w.tetherEvents.length = 0;
      updateTetherConstraint(w, DT);
      events += snags(w).length;
    }
    // 2 s of sim at a 0.3 s cooldown can never produce more than ~7
    expect(events).toBeGreaterThan(0);
    expect(events).toBeLessThanOrEqual(8);
  });
});

describe('kelp drag-snag: what it does NOT touch', () => {
  it('a clear drag is untouched — identical positions with and without a distant column', () => {
    const clear = draggedWorld([]);
    const offPath = draggedWorld([column(4, 30)]); // 30 m off the pull line
    for (let i = 0; i < 120; i++) {
      updateTetherConstraint(clear, DT);
      updateTetherConstraint(offPath, DT);
    }
    expect(offPath.player.x).toBe(clear.player.x);
    expect(offPath.player.z).toBe(clear.player.z);
    expect(snags(offPath)).toHaveLength(0);
  });

  it('zone 1 carries no kelp, so a Shallows fight is byte-identical', () => {
    const shallows = createWorld(616);
    shallows.lake = generateLake(616, 1);
    expect(shallows.lake.kelp).toHaveLength(0);
    shallows.fish = createFish();
    shallows.fish.tether.mass = 400;
    shallows.fish.x = 40;
    shallows.fish.z = 0;
    startTetherFight(shallows, M2_SPECIES, 'player', { L: 8 });

    const noLake = createWorld(616);
    noLake.fish = createFish();
    noLake.fish.tether.mass = 400;
    noLake.fish.x = 40;
    noLake.fish.z = 0;
    startTetherFight(noLake, M2_SPECIES, 'player', { L: 8 });

    for (let i = 0; i < 120; i++) {
      updateTetherConstraint(shallows, DT);
      updateTetherConstraint(noLake, DT);
    }
    expect(shallows.player.x).toBe(noLake.player.x);
    expect(shallows.player.z).toBe(noLake.player.z);
  });

  it('the CATCH is never arrested — a fish swims through weed', () => {
    // heavy player end, light catch: the correction lands on the fish instead
    const col = column(20, 0);
    const w = draggedWorld([col], { mass: 0.01 });
    const before = w.fish!.x;
    for (let i = 0; i < 120; i++) updateTetherConstraint(w, DT);
    expect(w.fish!.x).toBeLessThan(before); // hauled in toward the keeper…
    expect(snags(w)).toHaveLength(0); //      …straight through the column
  });
});

describe('kelp as a world collider (foot)', () => {
  it('the collision system pushes a swimming keeper out of a column', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 1);
    w.lake.kelp = [column(0, 0)];
    w.mode = 'foot';
    w.water.active = true; // in the water phase: no islet clamp
    w.player.x = 0.1;
    w.player.z = 0;
    collision(w, DT);
    expect(Math.hypot(w.player.x, w.player.z)).toBeCloseTo(KELP_RADIUS + w.player.radius, 6);
  });

  it('a keeper clear of the field is not moved', () => {
    const w = createWorld(616);
    w.lake = generateLake(616, 1);
    w.lake.kelp = [column(30, 30)];
    w.mode = 'foot';
    w.water.active = true;
    w.player.x = 0;
    w.player.z = 0;
    collision(w, DT);
    expect(w.player.x).toBe(0);
    expect(w.player.z).toBe(0);
  });
});

describe('kelp as a world collider (boat)', () => {
  it('the boat cannot row through a column — it slides off at the gunwale gap', () => {
    const lake = generateLake(616, 1);
    lake.islets = []; // open water: this test is about the column, nothing else
    lake.wrecks = [];
    lake.buoys = [];
    lake.kelp = [column(4, 0)];
    const out = resolveBoatObstacles(lake, { x: 0, z: 0 }, { x: 4, z: 0 });
    expect(out.hit).toBe(true);
    expect(Math.hypot(out.x - 4, out.z)).toBeGreaterThanOrEqual(
      KELP_RADIUS + BOAT_HULL_RADIUS - 1e-6,
    );
  });

  it('open water beside the field is unaffected', () => {
    const lake = generateLake(616, 1);
    lake.islets = [];
    lake.wrecks = [];
    lake.buoys = [];
    lake.kelp = [column(4, 20)];
    const out = resolveBoatObstacles(lake, { x: 0, z: 0 }, { x: 4, z: 0 });
    expect(out.hit).toBe(false);
    expect(out.x).toBe(4);
    expect(out.z).toBe(0);
  });

  it('a Shallows lake has no columns to hit', () => {
    expect(generateLake(616, 1).kelp).toHaveLength(0);
  });
});

describe('zone fog (plan 05 §2.1: "denser than Shallows")', () => {
  it('zone 1 is exactly 1 — the Shallows is untouched', () => {
    expect(zoneFogMultiplier(1)).toBe(1);
  });

  it('the Kelp Graves is denser', () => {
    expect(zoneFogMultiplier(2)).toBeGreaterThan(zoneFogMultiplier(1));
  });

  it('composes multiplicatively with the options murk scale (they stack)', () => {
    const base = 0.016;
    const low = 0.7;
    const heavy = 1.4;
    // a Low-murk player in the Kelp Graves still gets a thinner lake than a
    // Heavy-murk player in the Shallows — the option is not overridden
    expect(base * low * zoneFogMultiplier(2)).toBeLessThan(base * heavy * zoneFogMultiplier(1));
    // …and the zone still thickens their own lake
    expect(base * low * zoneFogMultiplier(2)).toBeGreaterThan(base * low * zoneFogMultiplier(1));
  });

  it('out-of-range zones clamp rather than returning undefined', () => {
    expect(zoneFogMultiplier(0)).toBe(1);
    expect(zoneFogMultiplier(99)).toBe(zoneFogMultiplier(5));
    expect(zoneFogMultiplier(NaN)).toBe(1);
  });
});

// --- partial LOS through the field (plan 05 §2.1) -------------------------------
// The telegraph EVENT must still fire (audio + the playtest log read it); only
// its visual cue is suppressed, and the suppression is carried on the event as
// `occluded` so render/lines.ts can skip the white flash.

function telegraphsFrom(kelp: KelpColumn[], pinFish = false) {
  const w = createWorld(1);
  w.mode = 'foot';
  w.lake = generateLake(616, 1);
  w.lake.kelp = kelp;
  w.fish = createFish();
  w.fish.tether.mass = 1.5;
  w.fish.x = 12;
  w.fish.z = 0;
  startTetherFight(w, M2_SPECIES, 'player', { L: 12 });
  const found: Extract<TetherEvent, { type: 'telegraph' }>[] = [];
  for (let i = 0; i < 900; i++) {
    w.tetherEvents.length = 0;
    // pinned: the catch holds station straight out on +X, so a column at (6,0)
    // is genuinely ON the sight-line rather than incidentally near it
    if (pinFish) {
      w.fish!.x = 12;
      w.fish!.z = 0;
    }
    updateTetherFishAI(w, DT);
    for (const e of w.tetherEvents) if (e.type === 'telegraph') found.push(e);
    if (found.length >= 3 || w.tether.fights.length === 0) break;
  }
  return found;
}

describe('kelp partial LOS: the telegraph is heard, not seen', () => {
  it('a clear sight-line leaves the telegraph event exactly as it always was', () => {
    const evs = telegraphsFrom([]);
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.occluded).toBeUndefined();
  });

  it('a column between the keeper and the catch marks the telegraph occluded', () => {
    // keeper at the origin, catch held at (12, 0), one stalk halfway down the line
    const evs = telegraphsFrom([column(6, 0, 2)], true);
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.occluded).toBe(true);
  });

  it('…and the same fight with the stalk moved aside is read normally', () => {
    const evs = telegraphsFrom([column(6, 9, 2)], true);
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.occluded).toBeUndefined();
  });

  it('a column well off the sight-line does not occlude', () => {
    const evs = telegraphsFrom([column(-40, -40)]);
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) expect(e.occluded).toBeUndefined();
  });
});
