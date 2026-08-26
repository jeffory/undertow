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
import { createRng, AI, LAYOUT } from '../core/rngStreams';
import { createDisturbance } from '../run/disturbance';
import { KELP_ZONE, KELP_RADIUS } from '../gen/kelp';
import { zoneSalt } from '../core/zones';
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
  // Salt with the next disturbance id: a fixed salt alone re-created the SAME
  // stream (identical islet picks / angles / tiers / bite seeds) on every
  // refill call, so refills replayed the initial spawn forever. The id counter
  // is deterministic per run, so the whole spawn set is still reproducible from
  // the run seed — each batch just draws from its own point in seed space.
  return createRng(world.seed, AI, DISTURBANCE_STREAM_SALT ^ (world.run.nextDisturbanceId >>> 0));
}

function currentBudget(world: WorldState) {
  return budgetFor(tierFor(world.dread), currentPhase(world));
}

// Seeds the run's initial ripple field (once). Deterministic per run seed.
export function spawnInitialDisturbances(world: WorldState): void {
  const spawn = world.run.spawn;
  if (spawn.initialSpawned) return;
  spawn.initialSpawned = true;
  // M6 (plan 05 §2.1): the Kelp Graves' boss ripple rides the same field, seeded
  // once, the first time a run's water is zone 2.
  seedCongregation(world);
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

// --- M6: THE CONGREGATION's ripple (plan 05 §2.1) --------------------------------
//
// SPAWN-TRIGGER CALL. Neither plan.md §7 nor plan 05 §2.1 specifies how the
// Congregation is met — the plan gives the fight, not the encounter. So this
// takes the task's documented fallback: **a single oversized ripple cluster at a
// fixed salted location in the zone-2 lake, seeded once per run, and phase-gated
// to night or deeper.** In full:
//
//   • WHERE — the heart of the graves. The field's biggest kelp cluster is the
//     anchor (deterministic: most columns, ties to the lowest cluster id), and
//     the ripple sits on the first point of a seeded ring around that centroid
//     with BOSS_WATER_CLEARANCE of open water around it, so the swarm has room
//     to orbit and the fight is not resolved by the snag resolver alone.
//   • WHEN — seeded at the moment the run's initial field is laid for zone 2
//     (the descent), once per run (`run.bossSeeded`).
//   • WHO — it is not in the disturbance budget and is never refilled or
//     replaced. Release it and the congregation is adjourned for this run.
//   • THE GATE — the SET is refused before `night` (systems/castFlow.ts): the
//     ripple is there at dusk, and it declines the tackle. Same decline the
//     license gate uses (plan 04 §8.4), so nothing new had to be invented for it.
//
// Determinism: the LAYOUT stream, salted with the boss salt XOR the zone salt —
// the same convention the kelp field itself is grown with. Same (runSeed, zone)
// → same ripple, in the same water, every run.

const CONGREGATION_SALT = 0x434f4e47; // 'CONG'
const BOSS_WATER_CLEARANCE = 7; // m of open water the swarm needs around it
const BOSS_RING_MIN = 9; // m — the ring searched around the cluster centroid
const BOSS_RING_MAX = 16;
const BOSS_RING_ATTEMPTS = 24;

// The kelp cluster with the most columns (ties → lowest cluster id), as a point.
export function biggestKelpCluster(world: WorldState): Vec2 | null {
  const lake = world.lake;
  if (!lake || lake.kelp.length === 0) return null;
  const acc = new Map<number, { x: number; z: number; n: number }>();
  for (const col of lake.kelp) {
    const a = acc.get(col.cluster) ?? { x: 0, z: 0, n: 0 };
    a.x += col.x;
    a.z += col.z;
    a.n++;
    acc.set(col.cluster, a);
  }
  let bestId = -1;
  let best: { x: number; z: number; n: number } | null = null;
  for (const [id, a] of acc) {
    if (!best || a.n > best.n || (a.n === best.n && id < bestId)) {
      best = a;
      bestId = id;
    }
  }
  return best ? { x: best.x / best.n, z: best.z / best.n } : null;
}

function clearOfKelp(world: WorldState, p: Vec2, clearance: number): boolean {
  const lake = world.lake;
  if (!lake) return false;
  for (const col of lake.kelp) {
    if (Math.hypot(col.x - p.x, col.z - p.z) < clearance + KELP_RADIUS) return false;
  }
  for (const iso of lake.islets) {
    if (pointInPolygon(p, iso.poly)) return false;
  }
  const halfW = lake.bounds.w / 2 - 10;
  const halfH = lake.bounds.h / 2 - 10;
  return p.x >= -halfW && p.x <= halfW && p.z >= -halfH && p.z <= halfH;
}

// Where the congregation gathers, for this run seed. Pure given the lake.
export function congregationSpawnPoint(world: WorldState): Vec2 | null {
  const lake = world.lake;
  if (!lake) return null;
  const rng = createRng(world.seed, LAYOUT, (CONGREGATION_SALT ^ zoneSalt(lake.zone)) >>> 0);
  const centre = biggestKelpCluster(world) ?? { x: 0, z: 0 };
  for (let attempt = 0; attempt < BOSS_RING_ATTEMPTS; attempt++) {
    const ang = rng.nextFloat() * Math.PI * 2;
    const off = rng.range(BOSS_RING_MIN, BOSS_RING_MAX);
    const p = { x: centre.x + Math.cos(ang) * off, z: centre.z + Math.sin(ang) * off };
    if (clearOfKelp(world, p, BOSS_WATER_CLEARANCE)) return p;
  }
  return clearOfKelp(world, centre, 1) ? centre : null;
}

// Seed the boss ripple, once per run, in the Kelp Graves only.
export function seedCongregation(world: WorldState): boolean {
  const run = world.run;
  if (run.bossSeeded) return false;
  if (run.zone !== KELP_ZONE) return false;
  const lake = world.lake;
  if (!lake || lake.zone !== KELP_ZONE) return false;
  const pos = congregationSpawnPoint(world);
  if (!pos) return false;
  run.bossSeeded = true;
  // Tier 3 is the loot-roll context the ripple carries (the top ordinary band);
  // the ripple DRAWS oversized off its `boss` marker, not off the tier.
  world.disturbances.push(
    createDisturbance(run.nextDisturbanceId++, pos, 3, CONGREGATION_SALT, 'congregation'),
  );
  return true;
}
