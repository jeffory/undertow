// RUN LIFECYCLE (run) — plan 03 §7/§10, task t12. `initRun` stamps the Night
// Clock epoch and seeds the initial disturbance field; `startNewRun` resets the
// world in place (new seed, fresh lake, fresh clock) — the dismissal path for
// both the receipt and the condolence overlays; `buildRunResult` converts the
// haul to Memories (100% extracted / 30% Office condolence on death);
// `endRun` freezes the terminal state. The only non-deterministic step is the
// new run seed (plan §1.3). Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { resetWorld } from '../core/world';
import { ensureLake, spawnAtLakeStart } from '../gen/lakeWorld';
import { spawnInitialDisturbances } from '../spawn/director';
import { haulMemories, CONDOLENCE_RATE } from '../extract/memories';
import { phaseAt, createClock, runElapsedMs } from '../game/clock';
import type { RunResult } from '../save/schemas';
import { applyRunStartPassives } from '../loot/runStart';
import { MIN_ZONE } from '../core/zones';
import { createCongregationState } from '../bosses/congregation';
import { createPostmasterState } from '../bosses/postmaster';

// The one non-deterministic step of a run (plan §1.3: the only Math.random).
export function newRunSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

// Stamp the run: clock epoch = now, haul empty, initial ripple field seeded.
export function initRun(world: WorldState): void {
  world.run.startedAt = world.time.elapsed;
  world.run.haul = [];
  world.run.activeCatch = null;
  world.run.ended = false;
  world.run.result = null;
  world.run.dreadPeak = world.dread;
  world.run.startedAtDread = world.dread;
  world.run.promptId = null;
  world.run.extract = { held: 0, buoyId: null };
  world.run.descend = { held: 0, buoyId: null };
  world.run.zone = MIN_ZONE;
  world.run.zoneFloor = 0;
  world.run.sinkholesDescended = 0;
  world.run.sinking = [];
  world.run.bossSeeded = false;
  world.run.forwardingAddress = false;
  world.run.deliveredBy = null;
  world.congregation = createCongregationState();
  world.postmaster = createPostmasterState();
  world.run.spawn = { refillTimer: 0, lastPhase: 'dusk', initialSpawned: false };
  world.clock = createClock(world.time.elapsed * 1000);
  world.disturbances = [];
  spawnInitialDisturbances(world);
}

// Fresh run (new seed) on receipt/condolence dismiss. Mutates the passed world
// in place so main.ts's reference stays valid across the reset. Then applies the
// run-start passives (license grade + equipped trinkets) — a no-op in Node tests
// where no save is loaded.
export function startNewRun(world: WorldState, seed?: number): WorldState {
  const fresh = resetWorld(world, seed ?? newRunSeed());
  Object.assign(world, fresh);
  ensureLake(world);
  spawnAtLakeStart(world);
  initRun(world);
  applyRunStartPassives(world);
  return world;
}

// Haul → Memories. Extraction keeps 100%; death keeps floor(30%) per record
// (plan §7.2). XP mirrors Memories (the tribute pool the Keeper's License banks).
// The run's memoriesMult (license G5 / municipal trinket) scales both, floored
// at the total. The run's bestiary events + sundries ride onto the result so the
// save folds them in at persist.
export function buildRunResult(world: WorldState, extracted: boolean): RunResult {
  const run = world.run;
  const mult = run.memoriesMult;
  const memoriesTotal = Math.floor(haulMemories(run.haul, extracted) * mult);
  const xpTotal = Math.floor(
    (extracted
      ? run.haul.reduce((s, r) => s + r.xp, 0)
      : run.haul.reduce((s, r) => s + Math.floor(r.xp * CONDOLENCE_RATE), 0)) * mult,
  );
  return {
    seed: world.seed,
    source: 'random',
    clockPhaseEnd: phaseAt(runElapsedMs(run.startedAt, world.time.elapsed)),
    haul: run.haul.map((r) => ({ ...r })),
    extracted,
    memoriesTotal,
    xpTotal,
    dreadPeak: run.dreadPeak,
    startedAtDread: run.startedAtDread,
    draggersLand: world.boatCombat.landed,
    bagmanCaught: false,
    sinkholesDescended: run.sinkholesDescended,
    bestiary: run.bestiaryEvents.map((e) => ({ ...e })),
    sundries: run.inventory.map((i) => ({ ...i })),
    forwardingAddress: run.forwardingAddress,
    ...(run.deliveredBy ? { deliveredBy: run.deliveredBy } : {}),
  };
}

// Freeze the terminal state. A finished run is never overwritten.
export function endRun(world: WorldState, extracted: boolean): RunResult {
  if (world.run.ended && world.run.result) return world.run.result;
  const result = buildRunResult(world, extracted);
  world.run.ended = true;
  world.run.result = result;
  return result;
}