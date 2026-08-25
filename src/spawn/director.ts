// SPAWN DIRECTOR (spawn) — plan 03 §9, task t12 #6. Produces disturbances on
// open water near islets from the AI stream, sized by the (dreadTier, phase)
// budget. `spawnInitialDisturbances` seeds the run; `refillDisturbances` tops
// the pool back up on the per-phase timer; `stepSpawnDirector` drives the refill
// cadence and purges consumed ('gone') ripples.
//
// M4 guarantee seams (documented TODO — require the bestiary caught-set + M5 meta):
//   • un-caught-species guarantee (plan §9.1): force one disturbance to a species
//     not yet clean-caught, tier-appropriate to the zone — ripple still tier-only;
//   • Bagman floor (plan §9.1): if meta.runsCompleted < 3 and !bagmanSeen, force a
//     Bagman spawn on run 1 (Purse Minnow) or run 2/3 (Bagman). Hooks are marked
//     below; neither producer exists in M3.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { createRng, AI } from '../core/rngStreams';
import { createDisturbance } from '../run/disturbance';
import { budgetFor, refillTimerForPhase, refillActive, rollTierFrom } from './budgets';
import { currentPhase } from '../run/reducer';
import { phaseProgress, runElapsedMs } from '../game/clock';
import { tierFor } from '../game/dread';
import { pointInPolygon } from '../core/poly';
import type { Vec2 } from '../core/poly';

export const INITIAL_DISTURBANCES = 3;
export const MAX_DISTURBANCES = 6;
export const REFILL_AMOUNT = 2;
// Fixed salt for the AI disturbance stream — the whole spawn set is reproducible
// from the run seed (plan §1.2: AI stream, player-independent).
const DISTURBANCE_STREAM_SALT = 0x51b3;

// A point in open water within cast reach of a walkable islet shore: islet max
// vertex radius ≤ poissonRadius × 0.36, so 0.36r + 4..9 from the centre clears
// the shore and stays inside CAST_RANGE (10m) of it.
function nearIsletPoint(world: WorldState, rng: { int(a: number, b: number): number; nextFloat(): number; range(a: number, b: number): number }): Vec2 | null {
  const lake = world.lake;
  if (!lake) return null;
  const walkable = lake.islets.filter((i) => i.kind === 'walkable');
  const pool = walkable.length > 0 ? walkable : lake.islets;
  for (let attempt = 0; attempt < 16; attempt++) {
    const iso = pool[rng.int(0, pool.length - 1)]!;
    const ang = rng.nextFloat() * Math.PI * 2;
    const off = lake.poissonRadius * 0.36 + 4 + rng.range(0, 5);
    const pos = {
      x: iso.center.x + Math.cos(ang) * off,
      z: iso.center.z + Math.sin(ang) * off,
    };
    let clear = true;
    for (const other of lake.islets) {
      if (pointInPolygon(pos, other.poly)) {
        clear = false;
        break;
      }
    }
    if (clear) return pos;
  }
  return null;
}

function disturbanceStream(world: WorldState) {
  return createRng(world.seed, AI, DISTURBANCE_STREAM_SALT);
}

function currentBudget(world: WorldState) {
  return budgetFor(tierFor(world.dread), currentPhase(world));
}

// Seeds the run's initial ripple field (once). Deterministic per run seed.
export function spawnInitialDisturbances(world: WorldState): void {
  const spawn = world.run.spawn;
  if (spawn.initialSpawned) return;
  spawn.initialSpawned = true;
  const ai = disturbanceStream(world);
  const budget = currentBudget(world);
  for (let i = 0; i < INITIAL_DISTURBANCES; i++) {
    const pos = nearIsletPoint(world, ai);
    if (!pos) continue;
    const tier = rollTierFrom(budget, ai);
    world.disturbances.push(
      createDisturbance(world.run.nextDisturbanceId++, pos, tier, ai.int(0, 0x7fffffff)),
    );
  }
}

// Top the pool back up toward MAX_DISTURBANCES.
export function refillDisturbances(world: WorldState): void {
  const lake = world.lake;
  if (!lake) return;
  const ai = disturbanceStream(world);
  const budget = currentBudget(world);
  let added = 0;
  while (world.disturbances.length < MAX_DISTURBANCES && added < REFILL_AMOUNT) {
    const pos = nearIsletPoint(world, ai);
    if (!pos) break;
    const tier = rollTierFrom(budget, ai);
    world.disturbances.push(
      createDisturbance(world.run.nextDisturbanceId++, pos, tier, ai.int(0, 0x7fffffff)),
    );
    added++;
  }
}

// Drive the refill timer; purge consumed ripples; obey the false-dawn halt.
export function stepSpawnDirector(world: WorldState, dt: number): void {
  const spawn = world.run.spawn;
  const phase = currentPhase(world);
  if (phase !== spawn.lastPhase) {
    spawn.lastPhase = phase;
    spawn.refillTimer = refillTimerForPhase(phase);
  }
  // consumed ripples leave the pool so the budget refills (release-farming works)
  if (world.disturbances.some((d) => d.state === 'gone')) {
    world.disturbances = world.disturbances.filter((d) => d.state !== 'gone');
  }
  const elapsed = runElapsedMs(world.run.startedAt, world.time.elapsed);
  if (!refillActive(phase, phaseProgress(elapsed))) return;
  spawn.refillTimer -= dt;
  if (spawn.refillTimer <= 0) {
    refillDisturbances(world);
    spawn.refillTimer = refillTimerForPhase(phase);
  }
}

// M4 guarantee hooks — document the seams; nothing produces them in M3.
export const GUARANTEE_SEAMS = {
  unCaughtSpecies: 'TODO M4: force one disturbance to an un-caught species (needs bestiary caught-set + meta)',
  bagmanFloor: 'TODO M4: first-3-runs Bagman floor (needs meta.runsCompleted + bagmanSeen from M5)',
};