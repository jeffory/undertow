// BOAT COMBAT (M3 round 3) — plan 03 §6 acceptance, tests-first shape:
//   - "No Dragger spawns, hooks, or boat damage before `night` phase" (§6.3)
//   - Deep night raises the Dragger rate ×1.5 (§5.3 phase table)
//   - The fight is the M2 tether at anchor 'boat' — it drags the BOAT (§0)
//   - "Cleat cut removes a hull segment and frees the boat; never touches the lure"
//   - "Hull 0 transitions to the extended water phase with sinkingHaul populated"
//   - "Landing a Dragger yields Rare+, repair materials, and Teeth (once per kill)"
// Pure Node — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun } from '../../src/run/run';
import { PHASE_LENGTH_S, phaseAt, runElapsedMs } from '../../src/game/clock';
import {
  draggerEligible,
  draggerIntervalFor,
  draggerRateMult,
  ambushEligible,
  DRAGGER_BASE_INTERVAL_S,
} from '../../src/spawn/budgets';
import { hookDragger, swampBoat, updateBoatCombat } from '../../src/systems/boatCombat';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateTetherFishAI } from '../../src/game/fishAI';
import { updateWaterPhase } from '../../src/game/waterPhase';
import { processRunEvents } from '../../src/run/reducer';
import {
  HULL_MAX_HP,
  HULL_SEGMENTS,
  SWAMP_BREATH_SEC,
  cleatCut,
  damageHull,
} from '../../src/boat/boatCombat';
import { LAND_DISTANCE } from '../../src/game/tether';

const DT = FIXED_DT;

type Phase = 'dusk' | 'night' | 'deepNight' | 'falseDawn';
const PHASES: Phase[] = ['dusk', 'night', 'deepNight', 'falseDawn'];

// A booted run world, parked in open water, at the requested clock phase.
function runWorld(phase: Phase = 'night', seed = 4242): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  setPhase(w, phase);
  return w;
}

function setPhase(w: WorldState, phase: Phase): void {
  const idx = PHASES.indexOf(phase);
  w.run.startedAt = w.time.elapsed - (idx * PHASE_LENGTH_S + 1);
  w.clock.runStartMs = w.run.startedAt * 1000;
  expect(phaseAt(runElapsedMs(w.run.startedAt, w.time.elapsed))).toBe(phase);
}

// One fixed sim step of everything the boat fight touches, in UPDATE_ORDER.
function step(w: WorldState, dt = DT): void {
  updateTetherFishAI(w, dt);
  updateTetherConstraint(w, dt);
  updateWaterPhase(w, dt);
  updateBoatCombat(w, dt);
  processRunEvents(w);
  w.time.elapsed += dt;
}

describe('night gating table (plan §5.3 line 341 / §6.3)', () => {
  it('Draggers are eligible at night and deep night only — never at dusk', () => {
    expect(draggerEligible('dusk')).toBe(false);
    expect(draggerEligible('night')).toBe(true);
    expect(draggerEligible('deepNight')).toBe(true);
    expect(draggerEligible('falseDawn')).toBe(false);
  });

  it('dusk is Dragger-free at EVERY Dread value (§6.3 "before night", plan.md §3.3)', () => {
    for (const dread of [0, 20, 39, 40, 60, 80, 100]) {
      const w = runWorld('dusk');
      w.dread = dread;
      for (let i = 0; i < 60 * 200; i++) step(w); // 200s of dusk at full Dread
      expect(w.boatCombat.active, `dread ${dread}`).toBe(false);
      expect(w.tether.fights.length, `dread ${dread}`).toBe(0);
      expect(w.boatCombat.hull.hp, `dread ${dread}`).toBe(HULL_MAX_HP);
    }
  });

  it('land ambushes are the OTHER dusk rule: none below Dread 40, free after', () => {
    expect(ambushEligible('dusk', 39)).toBe(false);
    expect(ambushEligible('dusk', 40)).toBe(true);
    expect(ambushEligible('night', 0)).toBe(true);
  });

  it('deep night runs the Dragger rate at ×1.5 (the interval divides by 1.5)', () => {
    expect(draggerRateMult('night')).toBe(1);
    expect(draggerRateMult('deepNight')).toBe(1.5);
    expect(draggerIntervalFor('night')).toBeCloseTo(DRAGGER_BASE_INTERVAL_S, 9);
    expect(draggerIntervalFor('deepNight')).toBeCloseTo(DRAGGER_BASE_INTERVAL_S / 1.5, 9);
    expect(draggerIntervalFor('deepNight')).toBeLessThan(draggerIntervalFor('night'));
    expect(draggerIntervalFor('dusk')).toBe(Infinity);
    expect(draggerIntervalFor('falseDawn')).toBe(Infinity);
  });

  it('a night run spawns a Dragger on the cadence, unprompted', () => {
    const w = runWorld('night');
    let hooked = false;
    for (let i = 0; i < 60 * (DRAGGER_BASE_INTERVAL_S + 5) && !hooked; i++) {
      step(w);
      hooked = w.boatCombat.active;
    }
    expect(hooked).toBe(true);
    expect(w.tether.fights[0]!.anchor).toBe('boat');
    expect(w.tether.fights[0]!.species).toBe('dragger');
  });

  it('deep night hooks sooner than night from the same start', () => {
    const ticks = (phase: Phase): number => {
      const w = runWorld(phase);
      for (let i = 0; i < 60 * 200; i++) {
        step(w);
        if (w.boatCombat.active) return i;
      }
      return Infinity;
    };
    expect(ticks('deepNight')).toBeLessThan(ticks('night'));
  });
});

describe('the hook: the M2 tether at boat scale (plan §0 contract)', () => {
  it('hooks the BOAT — anchor "boat", winch reel source, hull-segment cut cost', () => {
    const w = runWorld('night');
    expect(hookDragger(w)).toBe(true);
    const fight = w.tether.fights[0]!;
    expect(fight.anchor).toBe('boat');
    expect(fight.a.anchor.kind).toBe('boat');
    expect(fight.a.reel.kind).toBe('winch-post');
    expect(fight.a.cut.kind).toBe('hull-segment');
    expect(fight.reelRate).toBe(w.boatCombat.winch.rate);
    expect(w.boatCombat.dragger?.tetherId).toBe(fight.id);
    expect(w.run.activeCatch?.species).toBe('dragger');
    expect(w.run.activeCatch?.tier).toBe(4); // Epic → the +12 Dread rate
  });

  it('the constraint moves the boat-anchored endpoint: the Dragger drags the boat', () => {
    const w = runWorld('night');
    hookDragger(w);
    const fight = w.tether.fights[0]!;
    const before = { x: w.boat.x, z: w.boat.z };
    // swim the Dragger far past the line length — the taut line must pull the hull
    w.fish!.x = w.boat.x + fight.L + 30;
    w.fish!.z = w.boat.z;
    updateTetherConstraint(w, DT);
    expect(Math.hypot(w.boat.x - before.x, w.boat.z - before.z)).toBeGreaterThan(1);
  });

  it('one line at a time: no second Dragger while one has the hull', () => {
    const w = runWorld('night');
    expect(hookDragger(w)).toBe(true);
    for (let i = 0; i < 60 * 200; i++) step(w);
    expect(w.tether.fights.filter((f) => f.anchor === 'boat').length).toBeLessThanOrEqual(1);
  });

  it('the winch only reels while the reel is held AND you stay at the post', () => {
    const w = runWorld('night');
    hookDragger(w);
    w.intent.secondary = true;
    updateBoatCombat(w, DT);
    expect(w.boat.atWinchPost).toBe(true);
    expect(w.boat.atCleat).toBe(false);
    // walking away from the post cancels the reel and puts you at the cleat
    w.intent.moveY = 1;
    updateBoatCombat(w, DT);
    expect(w.boat.atWinchPost).toBe(false);
    expect(w.boat.atCleat).toBe(true);
  });
});

describe('hull, cleat cut, swamping (plan §6.1 / §6.3)', () => {
  it('an IGNORED Dragger fight sinks the boat', () => {
    const w = runWorld('night');
    hookDragger(w);
    for (let i = 0; i < 60 * 240 && !w.boatCombat.swamped; i++) step(w);
    expect(w.boatCombat.swamped).toBe(true);
    expect(w.boatCombat.hull.hp).toBe(0);
  });

  it('cleat cut spends a hull segment (segments--, hp -= maxHp/segments), never the lure', () => {
    const w = runWorld('night');
    hookDragger(w);
    const lureBefore = w.lure.count;
    w.boat.atCleat = true;
    w.boat.atWinchPost = false;
    w.intent.cut = true;
    for (let i = 0; i < 60 && w.tether.fights.length > 0; i++) step(w);
    expect(w.tether.fights.length).toBe(0); // the boat is free
    expect(w.boatCombat.active).toBe(false);
    expect(w.lure.count).toBe(lureBefore); // the lure was NOT the price
    expect(w.boatCombat.hull.segments).toBe(HULL_SEGMENTS - 1);
    // hp -= maxHp / segments, evaluated AFTER the decrement (plan §6.1)
    expect(w.boatCombat.hull.hp).toBeCloseTo(HULL_MAX_HP - HULL_MAX_HP / (HULL_SEGMENTS - 1), 6);
  });

  it('cleatCut applies the plan formula exactly, in order', () => {
    const w = createWorld(1);
    const bc = w.boatCombat;
    bc.hull.segments = 4;
    bc.hull.hp = 100;
    bc.hull.maxHp = 100;
    cleatCut(bc);
    expect(bc.hull.segments).toBe(3);
    expect(bc.hull.hp).toBeCloseTo(100 - 100 / 3, 9);
  });

  it('hull 0 → the EXTENDED water phase with the haul sinking around you', () => {
    const w = runWorld('night');
    w.run.haul = [
      { species: 'a', tier: 1, weight: 2, clean: true, memories: 10, xp: 10 },
      { species: 'b', tier: 2, weight: 3, clean: true, memories: 20, xp: 20 },
    ];
    hookDragger(w);
    damageHull(w.boatCombat, HULL_MAX_HP);
    step(w);
    expect(w.boatCombat.swamped).toBe(true);
    expect(w.water.active).toBe(true);
    expect(w.water.sinkingHaul).toBe(true);
    expect(w.water.breathMax).toBe(SWAMP_BREATH_SEC);
    expect(w.run.haul).toHaveLength(0);
    expect(w.run.sinking).toHaveLength(2);
    expect(w.mode).toBe('foot');
  });

  it('a sinking record can be grabbed back — and the grab costs breath', () => {
    const w = runWorld('night');
    w.run.haul = [{ species: 'a', tier: 1, weight: 2, clean: true, memories: 10, xp: 10 }];
    swampBoat(w);
    const item = w.run.sinking[0]!;
    w.player.x = item.x;
    w.player.z = item.z;
    const breathBefore = w.water.breath;
    updateWaterPhase(w, DT);
    expect(w.run.sinking).toHaveLength(0);
    expect(w.run.haul).toHaveLength(1);
    expect(w.water.breath).toBeLessThan(breathBefore - 1); // the pickup, not just the tick
  });

  it('breath running out in a swamp is lethal (plan §7.2 "water-phase timer out")', () => {
    const w = runWorld('night');
    swampBoat(w);
    w.player.x = 10_000; // nowhere near a shore
    w.player.z = 10_000;
    for (let i = 0; i < 60 * (SWAMP_BREATH_SEC + 2); i++) updateWaterPhase(w, DT);
    expect(w.water.breath).toBe(0);
    expect(w.player.hp).toBe(0);
  });
});

describe('landing a Dragger (plan §6.1)', () => {
  it('yields Rare+, +2 repair segments, one Teeth, and the Epic Dread rate', () => {
    const w = runWorld('night');
    hookDragger(w);
    // wear the hull first so the repair is observable
    damageHull(w.boatCombat, 40);
    w.boatCombat.hull.segments = 2;
    const segsBefore = w.boatCombat.hull.segments;
    const dreadBefore = w.dread;

    // winch it to the gunwale, exhausted → the LAND prompt is eligible
    const fight = w.tether.fights[0]!;
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    w.fish!.x = w.boat.x + LAND_DISTANCE * 0.5;
    w.fish!.z = w.boat.z;
    fight.L = LAND_DISTANCE * 0.5;
    fight.land.eligible = true;
    w.intent.acceptLand = true;
    step(w);

    expect(w.boatCombat.landed).toBe(1);
    expect(w.boatCombat.teeth).toBe(1);
    expect(w.boatCombat.hull.segments).toBe(segsBefore + 2);
    expect(w.boatCombat.active).toBe(false);
    const drop = w.run.inventory[w.run.inventory.length - 1]!;
    expect(['R', 'E', 'Drowned']).toContain(drop.rarity); // guaranteed Rare+
    expect(w.run.haul).toHaveLength(1);
    // tier 4 gain (+12) × the night clock multiplier (1.25)
    expect(w.dread - dreadBefore).toBeCloseTo(12 * 1.25, 6);
  });
});
