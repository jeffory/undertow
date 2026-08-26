// CAST FLOW (systems) — plan 03 §3, task t12 #1. Runs in the `castFlow` slot
// (after intent, before the tether constraint). Drives the disturbance lifecycle
// on open water: bite timers → SET/RELEASE window → LMB = SET (spawn + scale the
// M1 fish by tier, startTetherFight, tag the active catch) / RMB = RELEASE
// (consumed, no Dread). Casting: LMB rising edge with the mouse aimed at an
// in-range disturbance (boat, or walkable shore with no gaff target).
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { createFish } from '../core/world';
import { createRng, LOOT } from '../core/rngStreams';
import { startTetherFight, BOAT_MASS_DEFAULT, BOAT_RADIUS_DEFAULT } from '../game/tether';
import type { Disturbance } from '../run/disturbance';
import {
  PROMPT_WINDOW,
  biteDelaySeconds,
  pickCastTarget,
  startBite,
  release,
} from '../run/disturbance';
import { rollEligibleSpeciesAtSet } from '../run/species';
import { generateFishParams, type FishParams } from '../gen/fishParams';
import { recordBestiary } from '../bestiary/bestiary';
import { phaseAt, runElapsedMs } from '../game/clock';
import { speciesById, CONGREGATION_SPECIES_ID } from '../data/species';
import { buildSwarm, pullForceMultFor } from '../bosses/congregation';
import { emitTownEvent } from '../meta/townEvents';

// M4 round 1: the species is rolled AT SET from the disturbance-tier table
// (loot stream) and the FishParams carry the stats that scale the tether fight
// — replacing the M3 FISH_TIER_SCALE capsule. The wrongness curve is zone 1
// (Shallows) for now = mild.
// The zone the fight is generated for. Round 3 wires the RUN's zone depth
// (world.run.zone) through, so a descended lake rolls wronger fish from the same
// presets (plan 04 §3 wrongness curve w(zone)).

export function updateCastFlow(world: WorldState, dt: number): void {
  stepDisturbances(world, dt);
  // Edge detection is centralized so a single held press never double-fires
  // (the cast, the SET, and the RELEASE all consume the same rising edges).
  const lmb = world.intent.primary && !world.run.castPrev;
  const rmb = world.intent.secondary && !world.run.secondaryPrev;
  world.run.castPrev = world.intent.primary;
  world.run.secondaryPrev = world.intent.secondary;
  // A press that resolves a prompt (SET or RELEASE) is consumed — it must not
  // also re-cast that same tick (after a declining SET the disturbance is still
  // idle and in range; without this the one press would SET-decline AND re-cast).
  const promptConsumed = handlePrompt(world, lmb, rmb);
  if (!promptConsumed) handleCast(world, lmb);
}

// bite → prompt → (window lapse → consumed)
function stepDisturbances(world: WorldState, dt: number): void {
  for (const d of world.disturbances) {
    if (d.state === 'biting') {
      d.biteTimer -= dt;
      if (d.biteTimer <= 0) {
        d.state = 'prompt';
        d.promptTimer = PROMPT_WINDOW;
        world.run.promptId = d.id;
      }
    } else if (d.state === 'prompt') {
      d.promptTimer -= dt;
      if (d.promptTimer <= 0) {
        d.state = 'gone';
        if (world.run.promptId === d.id) world.run.promptId = null;
      }
    }
  }
}

// The 1.2s SET/RELEASE window: a fresh LMB press = SET, a fresh RMB press =
// RELEASE (plan §3.1). The press you used to cast does not pre-empt the choice —
// the bite demands a deliberate decision inside the window. Returns true when a
// prompt was consumed (so updateCastFlow skips the cast for this tick).
function handlePrompt(world: WorldState, lmbEdge: boolean, rmbEdge: boolean): boolean {
  if (world.run.promptId == null) return false;
  const d = world.disturbances.find((x) => x.id === world.run.promptId);
  if (!d || d.state !== 'prompt') {
    world.run.promptId = null;
    return false;
  }
  if (lmbEdge) {
    setCatchAt(world, d);
    return true;
  } else if (rmbEdge) {
    release(d);
    world.run.promptId = null;
    return true;
  }
  return false;
}

// SET — roll species/params AT the commit, spawn + scale the fish, start the
// tether fight, tag the active catch for the run reducer.
// Exported (as `setCatchAt`) so the ?debug gate drivers hook a catch through
// THE SET PATH itself rather than through a parallel construction of their own
// — the same precedent `hookCongregation` set. The species is resolved
// through the bite-eligibility gate (plan 04 §8.4): an ineligible species is
// never selected — when nothing in the tier is license-eligible the disturbance
// DECLINES the tackle (it stays present, "disturbance present but doesn't
// respond to the cast"), no fight starts and nothing is recorded.
export function setCatchAt(world: WorldState, d: Disturbance): void {
  // M6 (plan 05 §2.1): a boss ripple hooks its boss instead of rolling the tier
  // table. The gate and the hook are the only two branches the cast flow needs
  // — everything after the hook is the ordinary fight.
  if (d.boss === 'congregation') {
    hookCongregation(world, d);
    return;
  }
  const loot = createRng(world.seed, LOOT, d.id);
  const preset = rollEligibleSpeciesAtSet(loot, d.tier, world.run.licenseGrade);
  if (!preset) {
    // §8.4 decline: the whole tier out-ranks the license — the ripple remains,
    // re-castable, declining again (same seed → same decline, deterministically).
    d.state = 'idle';
    d.biteTimer = 0;
    d.promptTimer = 0;
    world.run.promptId = null;
    return;
  }
  d.state = 'gone';
  world.run.promptId = null;
  const params = generateFishParams(preset, loot, { zone: world.run.zone });
  const weight = params.weightKg;

  const fish = world.fish ?? createFish();
  world.fish = fish;
  fish.x = d.pos.x;
  fish.z = d.pos.z;

  // A boat cast fights AT THE BOAT — with a real, continuously-tracked boat
  // anchor. The old approach snapped world.player to the boat once at SET,
  // so the moment the boat moved the line/fight stayed at the phantom SET
  // point (USER playtest: "the line doesn't go to the boat if the boat
  // moves", tension unreadable). The boat anchor keeps the Dragger fights'
  // position tracking but overrides the endpoint traits: the keeper works
  // this line by hand — RMB reel stance and a lure-cost cut, never the
  // winch/hull-segment rules (those belong to hooked Draggers only; hull
  // damage is filtered by the Dragger's own fight id in systems/boatCombat).
  const fight =
    world.mode === 'boat'
      ? startTetherFight(world, preset.id, 'boat', {
          a: {
            anchor: { kind: 'boat' },
            owner: 'player',
            mass: BOAT_MASS_DEFAULT,
            radius: BOAT_RADIUS_DEFAULT,
            reel: { kind: 'player-stance' },
            cut: { kind: 'lure' },
          },
        })
      : startTetherFight(world, preset.id, 'player');
  if (fight) {
    applySpeciesParams(world, fish, params);
    world.run.activeCatch = {
      disturbanceId: d.id,
      tier: d.tier,
      weight,
      species: preset.id,
      name: preset.name,
    };
    // Bestiary (plan 04 §6.1): hooked = seen + fought — the species is only
    // revealed at the moment it is hooked, so that is the silhouette entry.
    recordBestiary(world, preset.id, 'hooked');
  } else {
    world.run.activeCatch = null;
  }
}

// Apply the species FishParams to the catch's combat-facing stats (the species
// replaces the M3 tier capsule — dial 6 fishStaminaPool still multiplies).
// Exported: the boat fight (03 §6) builds its Dragger through the same seam.
export function applySpeciesParams(
  world: WorldState,
  fish: WorldState['fish'],
  params: FishParams,
): void {
  if (!fish) return;
  fish.maxHp = params.hp;
  fish.hp = params.hp;
  fish.tether.mass = params.mass;
  fish.tether.maxSwimSpeed = params.swimSpeed;
  fish.tether.pullForce = params.pullForce;
  fish.tether.maxStamina = params.stamina * world.tuning.fishStaminaPool;
  fish.stamina = fish.tether.maxStamina;
  fish.tether.lungeCooldown = params.lungeCooldown;
  fish.tether.lungeStaminaCost = params.lungeStaminaCost;
  fish.tether.dragSpeed = params.dragSpeed;
  fish.tether.dragStaminaCostPerM = params.dragStaminaCostPerM;
  fish.tether.routedDrag = params.routedDrag;
  fish.tether.patterns = { ...params.patterns };
  fish.tether.exhausted = false;
  fish.state = 'idle';
  fish.stateTimer = 0;
  fish.spine = new Float32Array(params.spineSegments);
  fish.params = params;
}

// Casting: a fresh LMB press, aimed at an idle disturbance within CAST_RANGE of
// the caster (the boat, or a walkable-shore player with no land fish to gaff).
function handleCast(world: WorldState, lmbEdge: boolean): void {
  if (!lmbEdge) return;
  if (world.tether.fights.length > 0) return; // one fight at a time
  if (world.water.active) return;
  if (world.run.promptId != null) return;

  const caster =
    world.mode === 'boat'
      ? { x: world.boat.x, z: world.boat.z }
      : world.fish === null
        ? { x: world.player.x, z: world.player.z }
        : null;
  if (!caster) return;

  const point = world.run.debugCastPoint ?? world.input.mouseWorld;
  const target = pickCastTarget(world.disturbances, caster, point);
  if (!target) return;

  startBite(target);
  target.biteTimer = biteDelaySeconds(target.seed, world.seed);
}

// --- M6: hooking THE CONGREGATION (plan 05 §2.1) ---------------------------------
//
// "ONE TetherState whose 'fish' is a swarm centre." The swarm centre rides the
// single catch slot exactly like any other species — same FishParams generator,
// same applySpeciesParams, same startTetherFight — so the constraint, the reel,
// the brace, the cut, the snap and the LAND prompt are unchanged. The only two
// additions are the fight-level pull multiplier (the mass pool's lever) and the
// swarm state the boss system then drives.
//
// THE PHASE GATE: the congregation does not assemble before dark. At dusk or
// false dawn the SET is refused through the SAME decline path the license gate
// uses (plan 04 §8.4) — the ripple stays, re-castable, declining again.

export const CONGREGATION_PHASES = new Set(['night', 'deepNight']);

export function congregationBiteEligible(world: WorldState): boolean {
  const phase = phaseAt(runElapsedMs(world.run.startedAt, world.time.elapsed));
  return CONGREGATION_PHASES.has(phase);
}

// Exported: this IS the SET path, and the ?debug gate driver hooks the boss
// through it rather than through a parallel construction of its own.
export function hookCongregation(world: WorldState, d: Disturbance): void {
  if (!congregationBiteEligible(world)) {
    // §8.4 decline, verbatim: the ripple remains, and it declines again.
    d.state = 'idle';
    d.biteTimer = 0;
    d.promptTimer = 0;
    world.run.promptId = null;
    return;
  }
  d.state = 'gone';
  world.run.promptId = null;

  const loot = createRng(world.seed, LOOT, d.id);
  const preset = speciesById(CONGREGATION_SPECIES_ID);
  const params = generateFishParams(preset, loot, { zone: world.run.zone });

  const fish = world.fish ?? createFish();
  world.fish = fish;
  fish.x = d.pos.x;
  fish.z = d.pos.z;

  const fight =
    world.mode === 'boat'
      ? startTetherFight(world, preset.id, 'boat', {
          a: {
            anchor: { kind: 'boat' },
            owner: 'player',
            mass: BOAT_MASS_DEFAULT,
            radius: BOAT_RADIUS_DEFAULT,
            reel: { kind: 'player-stance' },
            cut: { kind: 'lure' },
          },
        })
      : startTetherFight(world, preset.id, 'player');
  if (!fight) {
    world.run.activeCatch = null;
    return;
  }
  applySpeciesParams(world, fish, params);

  const swarm = buildSwarm(world.seed, fight.id);
  world.congregation = swarm;
  fight.pullForceMult = pullForceMultFor(swarm);

  // The receipt tier: the Congregation is priced at the epic band (tier 4 — the
  // top of TIER_MULT / the Dread gain table). Its own preset tier is 5, the
  // bestiary Boss rank, which those two tables do not reach.
  world.run.activeCatch = {
    disturbanceId: d.id,
    tier: 4,
    weight: params.weightKg,
    species: preset.id,
    name: preset.name,
  };
  recordBestiary(world, preset.id, 'hooked');
  emitTownEvent({
    type: 'boss.started',
    bossId: 'congregation',
    zone: world.run.zone,
    fightId: fight.id,
    members: swarm.members.length,
    massPool: swarm.massPool,
  });
}
