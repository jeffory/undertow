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
import { startTetherFight } from '../game/tether';
import type { Disturbance } from '../run/disturbance';
import {
  PROMPT_WINDOW,
  biteDelaySeconds,
  pickCastTarget,
  startBite,
  release,
} from '../run/disturbance';
import { rollSpeciesAtSet } from '../run/species';
import { generateFishParams, type FishParams } from '../gen/fishParams';
import { recordBestiary } from '../bestiary/bestiary';

// M4 round 1: the species is rolled AT SET from the disturbance-tier table
// (loot stream) and the FishParams carry the stats that scale the tether fight
// — replacing the M3 FISH_TIER_SCALE capsule. The wrongness curve is zone 1
// (Shallows) for now = mild.
const SHALLOWS_ZONE = 1;

export function updateCastFlow(world: WorldState, dt: number): void {
  stepDisturbances(world, dt);
  // Edge detection is centralized so a single held press never double-fires
  // (the cast, the SET, and the RELEASE all consume the same rising edges).
  const lmb = world.intent.primary && !world.run.castPrev;
  const rmb = world.intent.secondary && !world.run.secondaryPrev;
  world.run.castPrev = world.intent.primary;
  world.run.secondaryPrev = world.intent.secondary;
  handlePrompt(world, lmb, rmb);
  handleCast(world, lmb);
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
// the bite demands a deliberate decision inside the window.
function handlePrompt(world: WorldState, lmbEdge: boolean, rmbEdge: boolean): void {
  if (world.run.promptId == null) return;
  const d = world.disturbances.find((x) => x.id === world.run.promptId);
  if (!d || d.state !== 'prompt') {
    world.run.promptId = null;
    return;
  }
  if (lmbEdge) {
    setCatch(world, d);
  } else if (rmbEdge) {
    release(d);
    world.run.promptId = null;
  }
}

// SET — roll species/params AT the commit, spawn + scale the fish, start the
// tether fight, tag the active catch for the run reducer.
function setCatch(world: WorldState, d: Disturbance): void {
  d.state = 'gone';
  world.run.promptId = null;
  const loot = createRng(world.seed, LOOT, d.id);
  const preset = rollSpeciesAtSet(loot, d.tier);
  const params = generateFishParams(preset, loot, { zone: SHALLOWS_ZONE });
  const weight = params.weightKg;

  const fish = world.fish ?? createFish();
  world.fish = fish;
  fish.x = d.pos.x;
  fish.z = d.pos.z;

  // A boat cast fights at the boat — the keeper "is aboard", so the tether's
  // player endpoint rides the boat position (the foot keeper otherwise sits at
  // the last islet and the line would point across the lake).
  if (world.mode === 'boat') {
    world.player.x = world.boat.x;
    world.player.z = world.boat.z;
  }

  const fight = startTetherFight(world, preset.id, 'player');
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
function applySpeciesParams(
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