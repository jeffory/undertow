// THE SNATCHER (M7, plan 05 §2.2) — the Township's second mouth on the line,
// driven through the real systems. Pins the five things the round is made of:
//
//   • THE GATE — zone 3, night+, an active fight with a hooked catch. Zone-1
//     and zone-2 fights, and dusk zone-3 fights, never see one;
//   • THE LATCH MATH — the rider COMPOSES with the fight's own pull lever
//     (Congregation × Snatcher) and adds a steady tension bias, both through
//     the constraint the whole game already runs;
//   • THE STEAL CLOCK — nine seconds, then a 'stolen' outcome: catch gone, lure
//     KEPT, no haul, a small Dread gain, the reducer folding it as an abandon
//     variant with its own count;
//   • THE GAFF KILL — the ordinary swing, three lights or a heavy and a light,
//     while it is surfaced; the rider comes off and the fight is exactly what
//     it was, plus one guaranteed sundry;
//   • DETERMINISM — the same seed sends the same animal on the same schedule
//     from the same bearing, and zones 1-2 are untouched.
//
// Pure Node — no three, no DOM. Fixed-DT steps over real worlds.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun } from '../../src/run/run';
import { descend } from '../../src/run/descent';
import { PHASE_LENGTH_S } from '../../src/game/clock';
import { startTetherFight, effectivePullMult, riderTensionBias, toRunKinds } from '../../src/game/tether';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateSnatcher, haulPoint } from '../../src/systems/snatcher';
import { updateCombat, FISH_TARGET_ID, HEAVY_STAGGER, snatcherGaffArc } from '../../src/game/combat';
import { processRunEvents } from '../../src/run/reducer';
import { drainTownEvents } from '../../src/meta/townEvents';
import { applySpeciesParams } from '../../src/systems/castFlow';
import { generateFishParams } from '../../src/gen/fishParams';
import { createRng, LOOT } from '../../src/core/rngStreams';
import {
  speciesById,
  SNATCHER_SPECIES_ID,
  TOWNSHIP_SPECIES,
  TIER_TABLES,
} from '../../src/data/species';
import { bestiaryById, TOWNSHIP_BESTIARY_TEXT } from '../../src/data/bestiaryText';
import {
  snatcherLines,
  snatcherTextFor,
  MOMENT_LINE_MAX_CHARS,
} from '../../src/content/snatcherLines';
import {
  APPROACH_RADIUS,
  GAFF_COST_HEAVY,
  GAFF_COST_LIGHT,
  SNATCHER_GAFF_HP,
  SNATCHER_PULL_MULT,
  SNATCHER_TARGET_ID,
  SNATCHER_TENSION_BIAS,
  SNATCHER_ZONE,
  SPAWN_DELAY_MAX,
  SPAWN_DELAY_MIN,
  STEAL_DREAD_GAIN,
  STEAL_SECONDS,
  SURFACE_DOWN,
  SURFACE_PERIOD,
  approachPoint,
  createSnatcherState,
  latchedTarget,
  rollSpawnDelay,
  snatcherGaffCost,
  snatcherRider,
  snatcherRng,
  snatcherSpawnEligible,
  stealFraction,
  surfacedAt,
  swimToward,
} from '../../src/enemies/snatcher';

const DT = FIXED_DT;
const SEED = 616;

// A run that has descended twice — into the drowned Hollow — at night, with a
// live boat-anchored fight on an ordinary zone-3 catch.
function townshipWorld(seed = SEED, zone = SNATCHER_ZONE): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  for (let z = 1; z < zone; z++) descend(w);
  // night: the clock is a pure function of elapsed, so moving the epoch back is
  // exactly "time passed" (the seam ?debug's __setPhase uses).
  w.run.startedAt = w.time.elapsed - (PHASE_LENGTH_S + 1);
  w.clock.runStartMs = w.run.startedAt * 1000;
  return w;
}

function setPhaseDusk(w: WorldState): void {
  w.run.startedAt = w.time.elapsed;
  w.clock.runStartMs = w.time.elapsed * 1000;
}

// Hook an ordinary catch onto the boat, near it, without the cast flow's
// prompt dance — the fight construction is the real one.
function hookCatch(w: WorldState, speciesId = 'silt-pikelet'): NonNullable<ReturnType<typeof startTetherFight>> {
  const preset = speciesById(speciesId);
  const params = generateFishParams(preset, createRng(w.seed, LOOT, 1), { zone: w.run.zone });
  const fish = w.fish ?? createFish();
  w.fish = fish;
  fish.x = w.boat.x + 6;
  fish.z = w.boat.z;
  const fight = startTetherFight(w, preset.id, 'boat', {
    a: {
      anchor: { kind: 'boat' },
      owner: 'player',
      mass: 6,
      radius: 3,
      reel: { kind: 'player-stance' },
      cut: { kind: 'lure' },
    },
  })!;
  applySpeciesParams(w, fish, params);
  w.run.activeCatch = {
    disturbanceId: 1,
    tier: 1,
    weight: params.weightKg,
    species: preset.id,
    name: preset.name,
  };
  return fight;
}

// Run the Snatcher system until it reaches `phase`, or give up.
function stepUntilPhase(w: WorldState, phase: string, maxSeconds = 40): number {
  let t = 0;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    updateSnatcher(w, DT);
    t += DT;
    if (w.snatcher.phase === phase) return t;
  }
  return -1;
}

// A latched Snatcher, the fastest legal way there: arm the director, let it
// launch, let it swim in and bite.
function latched(w: WorldState): void {
  const fight = w.tether.fights[0]!;
  w.snatcher.armedFor = fight.id;
  w.snatcher.spawnTimer = 0;
  expect(stepUntilPhase(w, 'latched')).toBeGreaterThan(0);
}

describe('snatcher: the spawn gate (zone / phase / active fight)', () => {
  it('is the Township only — zone 1 and zone 2 fights never see one', () => {
    for (const zone of [1, 2, 4, 5]) {
      expect(
        snatcherSpawnEligible({ zone, phase: 'night', fightLive: true, hasCatch: true, active: false }),
      ).toBe(false);
    }
    expect(
      snatcherSpawnEligible({
        zone: SNATCHER_ZONE,
        phase: 'night',
        fightLive: true,
        hasCatch: true,
        active: false,
      }),
    ).toBe(true);
  });

  it('is night or deeper — the Hollow audits nothing at dusk or false dawn', () => {
    const base = { zone: SNATCHER_ZONE, fightLive: true, hasCatch: true, active: false };
    expect(snatcherSpawnEligible({ ...base, phase: 'dusk' })).toBe(false);
    expect(snatcherSpawnEligible({ ...base, phase: 'falseDawn' })).toBe(false);
    expect(snatcherSpawnEligible({ ...base, phase: 'night' })).toBe(true);
    expect(snatcherSpawnEligible({ ...base, phase: 'deepNight' })).toBe(true);
  });

  it('needs a live fight WITH a hooked catch — there is no second mouth without a first', () => {
    const base = { zone: SNATCHER_ZONE, phase: 'night', active: false };
    expect(snatcherSpawnEligible({ ...base, fightLive: false, hasCatch: true })).toBe(false);
    expect(snatcherSpawnEligible({ ...base, fightLive: true, hasCatch: false })).toBe(false);
  });

  it('never sends a second one while one is on the water', () => {
    expect(
      snatcherSpawnEligible({
        zone: SNATCHER_ZONE,
        phase: 'night',
        fightLive: true,
        hasCatch: true,
        active: true,
      }),
    ).toBe(false);
  });

  it('a zone-3 night fight arms the director and launches inside the seeded window', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    updateSnatcher(w, DT);
    expect(w.snatcher.armedFor).toBe(fight.id);
    expect(w.snatcher.spawnTimer).toBeGreaterThan(SPAWN_DELAY_MIN - 1);
    expect(w.snatcher.spawnTimer).toBeLessThan(SPAWN_DELAY_MAX);
    const t = stepUntilPhase(w, 'approach', SPAWN_DELAY_MAX + 2);
    expect(t).toBeGreaterThanOrEqual(SPAWN_DELAY_MIN - DT * 2);
    expect(t).toBeLessThanOrEqual(SPAWN_DELAY_MAX + DT * 2);
  });

  it('a zone-1 fight never arms it at all (the M2 tether-gate scenarios are untouched)', () => {
    const w = townshipWorld(SEED, 1);
    hookCatch(w);
    for (let i = 0; i < Math.ceil(60 / DT); i++) updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('idle');
    expect(w.snatcher.armedFor).toBe(-1);
    expect(w.snatcher.launches).toBe(0);
    expect(w.tether.fights[0]!.rider ?? null).toBeNull();
  });

  it('a zone-3 fight at DUSK never arms it either', () => {
    const w = townshipWorld();
    setPhaseDusk(w);
    hookCatch(w);
    for (let i = 0; i < Math.ceil(60 / DT); i++) updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('idle');
    expect(w.snatcher.armedFor).toBe(-1);
  });

  it('a zone-3 night world with NO fight is inert — the system is a no-op', () => {
    const w = townshipWorld();
    for (let i = 0; i < 600; i++) updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('idle');
    expect(w.snatcher.spawnTimer).toBe(0);
  });
});

describe('snatcher: the approach is telegraphed, and it comes for the CATCH', () => {
  it('appears on the approach ring around the hooked catch, not the player', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    w.snatcher.armedFor = fight.id;
    w.snatcher.spawnTimer = 0;
    updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('approach');
    const fish = w.fish!;
    const dFish = Math.hypot(w.snatcher.x - fish.x, w.snatcher.z - fish.z);
    expect(dFish).toBeGreaterThan(APPROACH_RADIUS - 1);
    expect(dFish).toBeLessThan(APPROACH_RADIUS + 1);
  });

  it('gives the player a few seconds of wake before it bites', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    // the approach ring / approach speed put the telegraph at ~3.3 s
    expect(w.snatcher.elapsed).toBeGreaterThan(2.5);
    expect(w.snatcher.elapsed).toBeLessThan(5);
  });

  it('an approaching Snatcher does NOTHING to the fight — no rider until the bite', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    w.snatcher.armedFor = fight.id;
    w.snatcher.spawnTimer = 0;
    for (let i = 0; i < 10; i++) updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('approach');
    expect(fight.rider ?? null).toBeNull();
    expect(effectivePullMult(fight)).toBe(1);
    expect(riderTensionBias(fight)).toBe(0);
  });
});

describe('snatcher: the latch is a fight MODIFIER, not a constraint rewrite', () => {
  it('installs a third-entity rider on the ONE fight — still two endpoints', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    latched(w);
    expect(w.tether.fights.length).toBe(1);
    expect(fight.rider).not.toBeNull();
    expect(fight.rider!.kind).toBe('snatcher');
    expect(fight.rider!.owner).toBe('third');
    expect(fight.rider!.on).toBe('b'); // it bit the catch, not the keeper
    // the endpoints themselves are exactly what they were
    expect(fight.a.owner).toBe('player');
    expect(fight.b.owner).toBe('enemy');
  });

  it('(a) the pull multiplier COMPOSES with the fight\'s own — it does not replace it', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    fight.pullForceMult = 1.6; // stand in for the Congregation's full mass pool
    latched(w);
    expect(effectivePullMult(fight)).toBeCloseTo(1.6 * SNATCHER_PULL_MULT, 10);
    // and the fight's own lever is untouched — the two owners never collide
    expect(fight.pullForceMult).toBe(1.6);
  });

  it('a fight with no rider reads exactly ×1 (and its own lever when it has one)', () => {
    const w = townshipWorld(SEED, 1);
    const fight = hookCatch(w);
    expect(effectivePullMult(fight)).toBe(1);
    fight.pullForceMult = 0.45;
    expect(effectivePullMult(fight)).toBe(0.45);
  });

  it('(b) tension gains a steady upward bias while it holds — through the constraint', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    latched(w);
    // park the line slack so the ONLY tension source is the rider's bias
    fight.L = 100;
    fight.tension = 0;
    w.tuning.slackDecay = 0;
    const steps = 60;
    for (let i = 0; i < steps; i++) updateTetherConstraint(w, DT);
    expect(fight.tension).toBeCloseTo(SNATCHER_TENSION_BIAS * steps * DT, 6);
  });

  it('and a slack line with NO rider still decays to nothing (nothing else moved)', () => {
    const w = townshipWorld(SEED, 1);
    const fight = hookCatch(w);
    fight.L = 100;
    fight.tension = 30;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT);
    expect(fight.tension).toBeLessThan(30);
  });

  it('(c) the steal clock starts full and runs down', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    expect(w.snatcher.steal).toBeCloseTo(STEAL_SECONDS, 6);
    expect(stealFraction(w.snatcher)).toBeCloseTo(1, 6);
    for (let i = 0; i < 120; i++) updateSnatcher(w, DT);
    expect(w.snatcher.steal).toBeLessThan(STEAL_SECONDS);
    expect(w.snatcher.steal).toBeGreaterThan(0);
  });

  it('emits snatcher.latched onto the town queue and pushes a snatcherAttached tether event', () => {
    const w = townshipWorld();
    drainTownEvents();
    hookCatch(w);
    w.tetherEvents.length = 0;
    latched(w);
    const town = drainTownEvents();
    const ev = town.find((e) => e.type === 'snatcher.latched');
    expect(ev).toBeTruthy();
    expect((ev as { zone: number }).zone).toBe(SNATCHER_ZONE);
    expect((ev as { stealSeconds: number }).stealSeconds).toBe(STEAL_SECONDS);
    expect(w.tetherEvents.some((e) => e.type === 'snatcherAttached')).toBe(true);
  });

  it('parks the bible\'s intercept line for the bark toast', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    expect(w.township.pendingMoment).not.toBeNull();
    expect(w.township.pendingMoment!.text).toBe(
      'A second mouth has taken the line. Split tension detected.',
    );
  });
});

describe('snatcher: the steal clock completes → the "stolen" outcome', () => {
  function stolenWorld(): WorldState {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.snatcher.steal = DT / 2; // one tick from the theft
    w.tetherEvents.length = 0;
    drainTownEvents();
    updateSnatcher(w, DT);
    return w;
  }

  it('ends the fight and takes the catch with it', () => {
    const w = stolenWorld();
    expect(w.tether.fights.length).toBe(0);
    expect(w.fish).toBeNull();
    expect(w.tetherEvents.some((e) => e.type === 'catchStolen')).toBe(true);
  });

  it('KEEPS the lure — a steal is not a snap and not a cut', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    const before = w.lure.count;
    w.snatcher.steal = DT / 2;
    updateSnatcher(w, DT);
    expect(w.lure.count).toBe(before);
  });

  it('records no haul and no land gain — the reducer folds it as an abandon variant', () => {
    const w = stolenWorld();
    const haulBefore = w.run.haul.length;
    processRunEvents(w);
    expect(w.run.haul.length).toBe(haulBefore);
    expect(w.run.activeCatch).toBeNull();
    expect(w.run.stolen).toBe(1);
  });

  it('pays a small Dread gain — smaller than landing anything', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.dread = 0;
    w.snatcher.steal = DT / 2;
    updateSnatcher(w, DT);
    expect(w.dread).toBeGreaterThan(0);
    expect(w.dread).toBeLessThanOrEqual(STEAL_DREAD_GAIN * 1.5 + 1e-9);
  });

  it('maps to its own RunKind so the receipt can tell a theft from an abandon', () => {
    expect(toRunKinds({ type: 'catchStolen', species: 'silt-pikelet' })).toBe('tether/stolen');
    expect(toRunKinds({ type: 'cut', fightId: 1, lineId: 'x', cost: 'lure' })).toBe('tether/cut');
  });

  it('emits snatcher.stole and shows the bible\'s stolenCatch line', () => {
    const w = stolenWorld();
    const town = drainTownEvents();
    expect(town.some((e) => e.type === 'snatcher.stole')).toBe(true);
    expect(w.township.pendingMoment!.text).toBe(
      'Two mouths on one hook. Neither intends to let go.',
    );
  });

  it('the run continues — nothing about the world is ended by a theft', () => {
    const w = stolenWorld();
    processRunEvents(w);
    expect(w.run.ended).toBe(false);
    expect(w.snatcher.phase).not.toBe('latched');
    // and the director disarms: no fight, no second mouth
    for (let i = 0; i < 600; i++) updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('idle');
  });

  it('fires the split-tension line as the clock crosses halfway', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.township.pendingMoment = null;
    w.snatcher.steal = STEAL_SECONDS / 2 + DT / 2;
    updateSnatcher(w, DT);
    expect(w.township.pendingMoment!.text).toBe(
      'The catch is contested. The Snatcher requests its share.',
    );
  });
});

describe('snatcher: the gaff kill releases the line', () => {
  it('takes three lights, or a heavy and a light', () => {
    expect(snatcherGaffCost(0)).toBe(GAFF_COST_LIGHT);
    expect(snatcherGaffCost(HEAVY_STAGGER)).toBe(GAFF_COST_HEAVY);
    expect(GAFF_COST_LIGHT * 3).toBe(SNATCHER_GAFF_HP);
    expect(GAFF_COST_HEAVY + GAFF_COST_LIGHT).toBe(SNATCHER_GAFF_HP);
  });

  it('three light hits kill it and the rider comes OFF — the fight is what it was', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    fight.pullForceMult = 1.2;
    latched(w);
    expect(effectivePullMult(fight)).toBeCloseTo(1.2 * SNATCHER_PULL_MULT, 10);
    for (let i = 0; i < 3; i++) {
      w.combat.hits = [
        { targetId: SNATCHER_TARGET_ID, damage: 6, knockbackX: 0, knockbackZ: 0, stagger: 0 },
      ];
      updateSnatcher(w, DT);
    }
    expect(w.snatcher.phase).toBe('dying');
    expect(fight.rider ?? null).toBeNull();
    expect(effectivePullMult(fight)).toBeCloseTo(1.2, 10);
    expect(riderTensionBias(fight)).toBe(0);
    expect(w.tether.fights.length).toBe(1); // the fight is still live
    expect(w.fish).not.toBeNull();
  });

  it('a heavy and a light also do it (two swings)', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.combat.hits = [
      { targetId: SNATCHER_TARGET_ID, damage: 18, knockbackX: 0, knockbackZ: 0, stagger: HEAVY_STAGGER },
    ];
    updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('latched');
    w.combat.hits = [
      { targetId: SNATCHER_TARGET_ID, damage: 6, knockbackX: 0, knockbackZ: 0, stagger: 0 },
    ];
    updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('dying');
    expect(w.snatcher.gaffHits).toBe(2);
  });

  it('hits aimed at the CATCH never touch it (the two targets do not bleed)', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    for (let i = 0; i < 6; i++) {
      w.combat.hits = [
        { targetId: FISH_TARGET_ID, damage: 10, knockbackX: 0, knockbackZ: 0, stagger: 0 },
      ];
      updateSnatcher(w, DT);
    }
    expect(w.snatcher.phase).toBe('latched');
    expect(w.snatcher.gaffHp).toBe(SNATCHER_GAFF_HP);
  });

  it('pays its stolen backlog: one guaranteed sundry, and a bestiary credit', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    const before = w.run.inventory.length;
    w.combat.hits = [
      { targetId: SNATCHER_TARGET_ID, damage: 18, knockbackX: 0, knockbackZ: 0, stagger: HEAVY_STAGGER },
      { targetId: SNATCHER_TARGET_ID, damage: 6, knockbackX: 0, knockbackZ: 0, stagger: 0 },
    ];
    updateSnatcher(w, DT);
    expect(w.run.inventory.length).toBe(before + 1);
    expect(w.run.bestiaryEvents.some((e) => e.speciesId === SNATCHER_SPECIES_ID)).toBe(true);
  });

  it('emits snatcher.killed and re-arms the street for a later one', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    latched(w);
    drainTownEvents();
    w.combat.hits = [
      { targetId: SNATCHER_TARGET_ID, damage: 18, knockbackX: 0, knockbackZ: 0, stagger: HEAVY_STAGGER },
      { targetId: SNATCHER_TARGET_ID, damage: 6, knockbackX: 0, knockbackZ: 0, stagger: 0 },
    ];
    updateSnatcher(w, DT);
    const town = drainTownEvents();
    const ev = town.find((e) => e.type === 'snatcher.killed');
    expect(ev).toBeTruthy();
    expect((ev as { gaffHits: number }).gaffHits).toBe(2);
    expect(w.snatcher.killed).toBe(1);
    expect(w.snatcher.armedFor).toBe(fight.id);
    expect(w.snatcher.spawnTimer).toBeGreaterThan(0);
  });

  it('the body drifts off and clears itself', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.combat.hits = [
      { targetId: SNATCHER_TARGET_ID, damage: 18, knockbackX: 0, knockbackZ: 0, stagger: HEAVY_STAGGER },
      { targetId: SNATCHER_TARGET_ID, damage: 6, knockbackX: 0, knockbackZ: 0, stagger: 0 },
    ];
    updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('dying');
    for (let i = 0; i < Math.ceil(2 / DT); i++) {
      w.combat.hits = [];
      updateSnatcher(w, DT);
    }
    expect(w.snatcher.params).toBeNull();
  });
});

describe('snatcher: the kill verb is the ORDINARY gaff, gated on surfacing', () => {
  it('the surfacing cycle is down first, then up, and it repeats', () => {
    expect(surfacedAt(0)).toBe(false);
    expect(surfacedAt(SURFACE_DOWN - 0.01)).toBe(false);
    expect(surfacedAt(SURFACE_DOWN + 0.01)).toBe(true);
    expect(surfacedAt(SURFACE_PERIOD - 0.01)).toBe(true);
    expect(surfacedAt(SURFACE_PERIOD + 0.01)).toBe(false);
  });

  it('there is no gaff arc at all while it is under', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.snatcher.surfaced = false;
    expect(snatcherGaffArc(w)).toBeNull();
  });

  it('a surfaced Snatcher on a BOAT fight is gaffed from the hull, on the line\'s bearing', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.snatcher.surfaced = true;
    const arc = snatcherGaffArc(w)!;
    expect(arc.x).toBeCloseTo(w.boat.x, 10);
    expect(arc.z).toBeCloseTo(w.boat.z, 10);
    expect(arc.facing).toBeCloseTo(
      Math.atan2(w.fish!.x - w.boat.x, w.fish!.z - w.boat.z),
      10,
    );
  });

  it('a real swing lands a SNATCHER_TARGET_ID hit through updateCombat', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    // hold the surfacing window open and park it at the gunwale, in the arc
    w.snatcher.surfaced = true;
    const bearing = Math.atan2(w.fish!.x - w.boat.x, w.fish!.z - w.boat.z);
    w.snatcher.x = w.boat.x + Math.sin(bearing) * 1.2;
    w.snatcher.z = w.boat.z + Math.cos(bearing) * 1.2;
    // a light tap: press, release inside the heavy threshold, then let the
    // active window open
    w.intent.primary = true;
    updateCombat(w, DT);
    w.intent.primary = false;
    updateCombat(w, DT);
    let landed = false;
    for (let i = 0; i < 20 && !landed; i++) {
      updateCombat(w, DT);
      landed = w.combat.hits.some((h) => h.targetId === SNATCHER_TARGET_ID);
    }
    expect(landed).toBe(true);
  });

  it('a surfaced Snatcher holds station within gaff reach of the hauling end', () => {
    const w = townshipWorld();
    const fight = hookCatch(w);
    latched(w);
    w.snatcher.surfaceTimer = SURFACE_DOWN + 0.01;
    for (let i = 0; i < 60; i++) updateSnatcher(w, DT);
    const haul = haulPoint(w, fight);
    const d = Math.hypot(w.snatcher.x - haul.x, w.snatcher.z - haul.z);
    expect(w.snatcher.surfaced).toBe(true);
    expect(d).toBeLessThan(1.6 + 0.6); // REACH + the body radius
  });

  it('latchedTarget puts it on the catch when down, and on the line when up', () => {
    const down = latchedTarget(false, { x: 10, z: 0 }, { x: 0, z: 0 });
    expect(down).toEqual({ x: 10, z: 0 });
    const up = latchedTarget(true, { x: 10, z: 0 }, { x: 0, z: 0 });
    expect(up.x).toBeGreaterThan(0);
    expect(up.x).toBeLessThan(2);
    expect(up.z).toBeCloseTo(0, 10);
  });
});

describe('snatcher: the fight ending under it takes it off the water', () => {
  it('a landed / snapped / cut fight clears the Snatcher and its steal clock', () => {
    const w = townshipWorld();
    hookCatch(w);
    latched(w);
    w.tether.fights.length = 0;
    w.fish = null;
    updateSnatcher(w, DT);
    expect(w.snatcher.phase).toBe('idle');
    expect(w.snatcher.steal).toBe(0);
    expect(w.snatcher.fightId).toBe(-1);
  });
});

describe('snatcher: determinism', () => {
  it('the same seed sends the same animal, on the same schedule, from the same bearing', () => {
    const sig = (seed: number) => {
      const w = townshipWorld(seed);
      hookCatch(w);
      const armed = (() => {
        updateSnatcher(w, DT);
        return w.snatcher.spawnTimer;
      })();
      const t = stepUntilPhase(w, 'latched', 40);
      return JSON.stringify({
        armed,
        t: t.toFixed(6),
        x: w.snatcher.x.toFixed(6),
        z: w.snatcher.z.toFixed(6),
        params: w.snatcher.params,
      });
    };
    expect(sig(SEED)).toBe(sig(SEED));
    expect(sig(SEED)).not.toBe(sig(SEED + 1));
  });

  it('the launch stream is pure over (seed, fight id, launch index)', () => {
    const a = snatcherRng(SEED, 3, 0);
    const b = snatcherRng(SEED, 3, 0);
    expect(rollSpawnDelay(a)).toBe(rollSpawnDelay(b));
    expect(rollSpawnDelay(snatcherRng(SEED, 3, 1))).not.toBe(rollSpawnDelay(snatcherRng(SEED, 3, 0)));
    expect(rollSpawnDelay(snatcherRng(SEED, 4, 0))).not.toBe(rollSpawnDelay(snatcherRng(SEED, 3, 0)));
  });

  it('the approach bearing is a ring point, always APPROACH_RADIUS out', () => {
    for (const seed of [1, 42, 616, 2024]) {
      const p = approachPoint(snatcherRng(seed, 1, 0), 5, -7);
      expect(Math.hypot(p.x - 5, p.z + 7)).toBeCloseTo(APPROACH_RADIUS, 9);
    }
  });

  it('swimToward is pure and arrives exactly, never overshooting', () => {
    const step = swimToward({ x: 0, z: 0 }, { x: 3, z: 4 }, 100, 1);
    expect(step.arrived).toBe(true);
    expect(step.x).toBe(3);
    expect(step.z).toBe(4);
    const partial = swimToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 2, 1);
    expect(partial.moved).toBeCloseTo(2, 10);
    expect(partial.arrived).toBe(false);
  });

  it('a fresh state is inert — every world outside zone 3 carries this and pays nothing', () => {
    const s = createSnatcherState();
    expect(s.phase).toBe('idle');
    expect(s.params).toBeNull();
    expect(s.fightId).toBe(-1);
  });
});

describe('snatcher: the content it is made of', () => {
  it('the rig is a species preset through the ordinary generator — no new asset path', () => {
    const preset = speciesById(SNATCHER_SPECIES_ID);
    expect(TOWNSHIP_SPECIES.map((p) => p.id)).toContain(SNATCHER_SPECIES_ID);
    expect(preset.category).toBe('snatcher');
    expect(preset.name).toBe('Gallows Snatcher');
    const params = generateFishParams(preset, createRng(1, LOOT, 1), { zone: 3 });
    expect(params.speciesId).toBe(SNATCHER_SPECIES_ID);
    expect(params.spineSegments).toBeGreaterThanOrEqual(6);
  });

  it('is never in the disturbance tier tables — a ripple can never roll it', () => {
    const w = townshipWorld();
    // the tables are the Shallows bite pool; the Snatcher is spawned onto a
    // fight, never cast at
    for (const tier of [1, 2, 3] as const) {
      expect(TIER_TABLES[tier].map((r) => r.id)).not.toContain(SNATCHER_SPECIES_ID);
    }
    expect(w.run.zone).toBe(SNATCHER_ZONE);
  });

  it('carries the bible\'s bestiary record verbatim, with the willing variant', () => {
    const rec = bestiaryById(SNATCHER_SPECIES_ID)!;
    expect(TOWNSHIP_BESTIARY_TEXT).toContain(rec);
    expect(rec.zone).toBe(3);
    expect(rec.category).toBe('snatcher');
    expect(rec.silhouette).toBe(
      'A lean, many-jointed jaw darting between submerged chimney stacks.',
    );
    expect(rec.entryFought.startsWith('It waits for another mouth to take the hook')).toBe(true);
    expect(rec.entryWilling).toBeTruthy();
  });

  it('the three bible moment lines are verbatim and inside the 80-character audit', () => {
    expect(snatcherTextFor('intercept')).toBe(
      'A second mouth has taken the line. Split tension detected.',
    );
    expect(snatcherTextFor('splitTension')).toBe(
      'The catch is contested. The Snatcher requests its share.',
    );
    expect(snatcherTextFor('stolenCatch')).toBe(
      'Two mouths on one hook. Neither intends to let go.',
    );
    for (const line of snatcherLines()) {
      expect(line.text.length).toBeLessThan(MOMENT_LINE_MAX_CHARS);
    }
  });

  it('the three bible lines are NOT placeholders; the unwritten kill line is', () => {
    const byTrigger = new Map(snatcherLines().map((l) => [l.trigger, l]));
    expect(byTrigger.get('intercept')!.placeholder).toBe(false);
    expect(byTrigger.get('splitTension')!.placeholder).toBe(false);
    expect(byTrigger.get('stolenCatch')!.placeholder).toBe(false);
    expect(byTrigger.get('killed')!.placeholder).toBe(true);
  });

  it('the rider it installs is exactly the documented data', () => {
    const r = snatcherRider();
    expect(r).toEqual({
      kind: 'snatcher',
      owner: 'third',
      on: 'b',
      pullForceMult: SNATCHER_PULL_MULT,
      tensionBias: SNATCHER_TENSION_BIAS,
    });
  });
});
