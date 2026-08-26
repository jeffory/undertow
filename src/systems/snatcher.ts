// THE SNATCHER (systems) — the driver half of the Township's pressure, plan 05
// §2.2. Runs in its own sim slot AFTER `combat` (so the tick's gaff hits are
// fresh) and BEFORE `updateDreadSystem` (so a completed steal reaches the run
// reducer in the same tick that produced it, as an abandon variant).
//
// What it does, in the plan's order:
//   1. THE GATE — zone 3, night or deeper, a live fight with a hooked catch,
//      and none already on the water (enemies/snatcher.ts owns the predicate);
//   2. THE APPROACH — it appears on a ring around the HOOKED CATCH, not the
//      player, and closes on it as a wake. ~3.3 s of telegraph;
//   3. THE LATCH — it installs a `TetherRider` on the one fight: pull stacks,
//      tension gains its steady bias, the steal clock starts;
//   4. THE STEAL CLOCK — nine seconds. At zero the catch is GONE: a
//      `catchStolen` tether event, the lure kept, no haul, a small Dread gain;
//   5. THE KILL — the ordinary gaff, while it is surfaced at the hauling end.
//      Three light swings or a heavy and a light. The rider comes off, the
//      fight returns to exactly what it was, and it pays out its backlog.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import type { TetherFight } from '../game/tether';
import { createRng, LOOT } from '../core/rngStreams';
import { currentPhase, currentDreadMult } from '../run/reducer';
import { applyDreadGain, tierFor } from '../game/dread';
import { generateFishParams } from '../gen/fishParams';
import { speciesById, SNATCHER_SPECIES_ID } from '../data/species';
import { rollGuaranteedDrop, type RollCtx } from '../loot/roller';
import { recordBestiary } from '../bestiary/bestiary';
import { emitTownEvent } from '../meta/townEvents';
import { snatcherTextFor, SNATCHER_TITLE, type SnatcherMoment } from '../content/snatcherLines';
import {
  APPROACH_SPEED,
  DEATH_DRIFT_SECONDS,
  DEATH_DRIFT_SPEED,
  LATCHED_SWIM,
  LATCH_DISTANCE,
  SNATCHER_GAFF_HP,
  SNATCHER_TARGET_ID,
  SPLIT_LINE_AT,
  STEAL_DREAD_GAIN,
  STEAL_SECONDS,
  SURFACE_PERIOD,
  approachPoint,
  latchedTarget,
  rollRespawnDelay,
  rollSpawnDelay,
  snatcherGaffCost,
  snatcherRider,
  snatcherRng,
  snatcherSpawnEligible,
  surfacedAt,
  swimToward,
} from '../enemies/snatcher';

// Salt for the Snatcher's own LOOT draws (its rig and its backlog drop). Its
// behaviour rides the AI-shaped stream in enemies/snatcher.ts; its ITEMS ride
// the loot stream, like every other item in the game.
const SNATCHER_LOOT_SALT = 0x534e4c54; // 'SNLT'

// The hauling end of a fight — the boat on a boat-anchored line, the keeper on
// foot. This is where a surfaced Snatcher comes up, and it is the origin the
// ordinary gaff arc is measured from (see game/combat.ts).
export function haulPoint(world: WorldState, fight: TetherFight): { x: number; z: number } {
  return fight.anchor === 'boat'
    ? { x: world.boat.x, z: world.boat.z }
    : { x: world.player.x, z: world.player.z };
}

// The one fight a Snatcher may ride: the primary line, with a hooked catch on
// it. Bosses included — the Congregation's own pull lever composes with the
// rider's through effectivePullMult, so nothing here has to special-case it.
function liveFight(world: WorldState): TetherFight | null {
  const f = world.tether.fights[0];
  if (!f) return null;
  return world.fish ? f : null;
}

// One moment line into the bark toast (ui/barkOverlay.ts) — the presentation
// half — plus nothing else: the town-queue events below are the audio half.
function moment(world: WorldState, trigger: SnatcherMoment): void {
  const text = snatcherTextFor(trigger);
  if (!text) return;
  world.township.pendingMoment = { trigger, title: SNATCHER_TITLE, text };
}

// --- the launch ---------------------------------------------------------------------

function launch(world: WorldState, fight: TetherFight): void {
  const s = world.snatcher;
  const fish = world.fish;
  if (!fish) return;
  const rng = snatcherRng(world.seed, fight.id, s.launches);
  const at = approachPoint(rng, fish.x, fish.z);

  // The BODY comes off the ordinary fish pipeline: a species preset through the
  // same generator every catch is built with (plan 05 §2.2 "t4 rigs" — no new
  // asset, no new mesh path). It is NOT world.fish: the catch slot still holds
  // the thing on the hook. This animal is the third entity.
  const loot = createRng(world.seed, LOOT, (SNATCHER_LOOT_SALT ^ fight.id ^ s.launches) >>> 0);
  const preset = speciesById(SNATCHER_SPECIES_ID);
  s.params = generateFishParams(preset, loot, { zone: world.run.zone });

  s.phase = 'approach';
  s.fightId = fight.id;
  s.x = at.x;
  s.z = at.z;
  s.originX = at.x;
  s.originZ = at.z;
  s.speed = APPROACH_SPEED;
  s.facing = Math.atan2(fish.x - at.x, fish.z - at.z);
  s.elapsed = 0;
  s.steal = 0;
  s.gaffHp = SNATCHER_GAFF_HP;
  s.gaffHits = 0;
  s.surfaceTimer = 0;
  s.surfaced = false;
  s.dying = 0;
  s.launches++;
}

function latch(world: WorldState, fight: TetherFight): void {
  const s = world.snatcher;
  s.phase = 'latched';
  s.steal = STEAL_SECONDS;
  s.speed = 0;
  s.surfaceTimer = 0;
  s.surfaced = false;
  // THE THIRD ENTITY GOES ON THE LINE — as a rider, not an endpoint.
  fight.rider = snatcherRider();

  // The bestiary meets it the moment it bites, exactly the way a catch is
  // recorded at the hook-set (plan 04 §6.1: hooked = seen + fought).
  recordBestiary(world, SNATCHER_SPECIES_ID, 'hooked');

  moment(world, 'intercept');
  world.tetherEvents.push({ type: 'snatcherAttached', target: SNATCHER_TARGET_ID });
  emitTownEvent({
    type: 'snatcher.latched',
    zone: world.run.zone,
    fightId: fight.id,
    species: fight.species,
    stealSeconds: STEAL_SECONDS,
  });
}

// The rider comes off and the fight is EXACTLY what it was before — the pull
// multiplier and the tension bias were only ever the rider's.
function release(fight: TetherFight | null): void {
  if (fight) fight.rider = null;
}

function kill(world: WorldState, fight: TetherFight): void {
  const s = world.snatcher;
  const stealLeft = s.steal;
  release(fight);
  s.phase = 'dying';
  s.dying = DEATH_DRIFT_SECONDS;
  s.speed = DEATH_DRIFT_SPEED;
  s.steal = 0;
  s.surfaced = false;
  s.killed++;

  // ITS STOLEN BACKLOG — one guaranteed sundry, at whatever the ladder gives it
  // (a Common floor: this is a small, certain payout, not a Dragger's Rare+).
  const rng = createRng(world.seed, LOOT, (SNATCHER_LOOT_SALT ^ (fight.id << 8) ^ s.killed) >>> 0);
  const ctx: RollCtx = {
    zoneDepth: world.run.zone,
    catchTier: speciesById(SNATCHER_SPECIES_ID).tier,
    dreadTier: tierFor(world.dread),
    licenseGrade: world.run.licenseGrade,
    qualityBonus: 0,
  };
  world.run.inventory.push(rollGuaranteedDrop(rng, ctx, 'C'));

  // Killing it is fighting it: the bestiary's butchered credit, the same one a
  // gaffed-to-death catch earns.
  recordBestiary(world, SNATCHER_SPECIES_ID, 'butchered');

  moment(world, 'killed');
  emitTownEvent({
    type: 'snatcher.killed',
    zone: world.run.zone,
    fightId: fight.id,
    gaffHits: s.gaffHits,
    stealLeft,
  });

  // Re-arm the director: the street may send another one at this fight, later.
  const rearm = snatcherRng(world.seed, fight.id, s.launches);
  s.spawnDelay = rollRespawnDelay(rearm);
  s.spawnTimer = s.spawnDelay;
  s.armedFor = fight.id;
}

// THE STEAL — "if it completes, the catch is GONE (fight ends as a new 'stolen'
// outcome — lure kept, no haul, Dread gain small)". The fight is ended here the
// way the constraint ends one: push the event, drop the fight, despawn the
// catch. The run reducer runs after this system and folds `catchStolen` as its
// abandon variant, so nothing is recorded and no land gain is paid.
function steal(world: WorldState, fight: TetherFight): void {
  const s = world.snatcher;
  const species = fight.species;

  world.tetherEvents.push({ type: 'catchStolen', species });
  const idx = world.tether.fights.indexOf(fight);
  if (idx >= 0) world.tether.fights.splice(idx, 1);
  world.fish = null; // it went with the catch
  // The LURE IS KEPT: a steal is not a snap and not a cut. Nothing is paid.

  world.dread = applyDreadGain(world.dread, STEAL_DREAD_GAIN, currentDreadMult(world));
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  s.stolen++;
  moment(world, 'stolenCatch');
  emitTownEvent({ type: 'snatcher.stole', zone: world.run.zone, fightId: fight.id, species });

  // It leaves the way it came.
  s.phase = 'dying';
  s.dying = DEATH_DRIFT_SECONDS;
  s.speed = APPROACH_SPEED;
  s.fightId = -1;
  s.steal = 0;
  s.surfaced = false;
  s.armedFor = -1;
  s.spawnTimer = 0;
}

// --- the system ------------------------------------------------------------------------

export function updateSnatcher(world: WorldState, dt: number): void {
  const s = world.snatcher;
  const fight = liveFight(world);

  // A body still drifting off after a kill or a steal. It rides nothing.
  if (s.phase === 'dying') {
    s.dying -= dt;
    s.x += Math.sin(s.facing) * s.speed * dt;
    s.z += Math.cos(s.facing) * s.speed * dt;
    s.elapsed += dt;
    if (s.dying <= 0) {
      s.phase = 'idle';
      s.fightId = -1;
      s.params = null;
      s.speed = 0;
    }
    // fall through: the director may still be re-arming below
  }

  // THE FIGHT ENDED UNDER IT — landed, snapped, cut, butchered, pulled under.
  // The rider dies with the line: no steal clock survives a fight that is over.
  if (s.phase === 'approach' || s.phase === 'latched') {
    if (!fight || fight.id !== s.fightId) {
      s.phase = 'idle';
      s.fightId = -1;
      s.params = null;
      s.speed = 0;
      s.steal = 0;
      s.armedFor = -1;
      s.spawnTimer = 0;
      return;
    }
  }

  // --- 1. THE GATE / the director's clock ---------------------------------------
  if (!fight) {
    // No live fight: the timer disarms. A Snatcher is a fight event, always.
    s.armedFor = -1;
    s.spawnTimer = 0;
    s.launches = 0;
    return;
  }

  const eligible = snatcherSpawnEligible({
    zone: world.run.zone,
    phase: currentPhase(world),
    fightLive: true,
    hasCatch: world.fish !== null,
    active: s.phase !== 'idle',
  });

  if (s.phase === 'idle') {
    if (!eligible) {
      // Zone 1-2, or before dark: not armed, nothing spent, nothing to observe.
      if (s.armedFor !== fight.id) {
        s.armedFor = -1;
        s.spawnTimer = 0;
      }
      return;
    }
    if (s.armedFor !== fight.id) {
      // First eligible tick on this fight: roll the delay off this fight's own
      // point in seed space.
      s.armedFor = fight.id;
      s.launches = 0;
      s.spawnDelay = rollSpawnDelay(snatcherRng(world.seed, fight.id, 0));
      s.spawnTimer = s.spawnDelay;
    }
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0) launch(world, fight);
    return;
  }

  const fish = world.fish;
  if (!fish) return;
  s.elapsed += dt;

  // --- 2. THE APPROACH -----------------------------------------------------------
  if (s.phase === 'approach') {
    const step = swimToward({ x: s.x, z: s.z }, { x: fish.x, z: fish.z }, APPROACH_SPEED, dt);
    s.x = step.x;
    s.z = step.z;
    s.facing = step.facing;
    s.speed = APPROACH_SPEED;
    if (Math.hypot(fish.x - s.x, fish.z - s.z) <= LATCH_DISTANCE) latch(world, fight);
    return;
  }

  if (s.phase !== 'latched') return;

  // --- 3/4. LATCHED: the surfacing cycle, the gaff, the steal clock ---------------

  // Where it is: down on the catch, or up at the hauling end where a swing
  // reaches it. The cycle is a pure function of the clock.
  s.surfaceTimer = (s.surfaceTimer + dt) % SURFACE_PERIOD;
  s.surfaced = surfacedAt(s.surfaceTimer);
  const target = latchedTarget(s.surfaced, { x: fish.x, z: fish.z }, haulPoint(world, fight));
  const step = swimToward({ x: s.x, z: s.z }, target, LATCHED_SWIM, dt);
  s.x = step.x;
  s.z = step.z;
  if (step.moved > 1e-6) s.facing = step.facing;
  s.speed = step.moved / Math.max(dt, 1e-9);

  // THE GAFF — the tick's fresh hits, the same array the Congregation reads and
  // combat refills. Three lights, or a heavy and a light.
  for (const hit of world.combat.hits) {
    if (hit.targetId !== SNATCHER_TARGET_ID) continue;
    s.gaffHits++;
    s.gaffHp -= snatcherGaffCost(hit.stagger);
  }
  if (s.gaffHp <= 0) {
    kill(world, fight);
    return;
  }

  // THE STEAL CLOCK.
  const before = s.steal;
  s.steal = Math.max(0, s.steal - dt);
  if (before > SPLIT_LINE_AT && s.steal <= SPLIT_LINE_AT) moment(world, 'splitTension');
  if (s.steal <= 0) steal(world, fight);
}
