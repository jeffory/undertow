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
import { startTetherFight, FISH_STAMINA_BASE } from '../game/tether';
import type { Disturbance } from '../run/disturbance';
import {
  PROMPT_WINDOW,
  biteDelaySeconds,
  pickCastTarget,
  startBite,
  release,
} from '../run/disturbance';
import { rollSpeciesAtSet, rollWeight } from '../run/species';

// M1 fish stats scaled by the disturbance tier (task t12 #1: "fish tier scales
// the M1 fish stats for now"). M4 fills the real species table.
const FISH_TIER_SCALE: Record<
  1 | 2 | 3,
  { mass: number; maxHp: number; swimSpeed: number; pullForce: number; staminaMult: number }
> = {
  1: { mass: 1.2, maxHp: 100, swimSpeed: 5, pullForce: 3, staminaMult: 1.0 },
  2: { mass: 1.8, maxHp: 150, swimSpeed: 6, pullForce: 4.5, staminaMult: 1.4 },
  3: { mass: 2.6, maxHp: 210, swimSpeed: 7, pullForce: 6, staminaMult: 1.9 },
};

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

// SET — roll species/weight AT the commit, spawn + scale the fish, start the
// tether fight, tag the active catch for the run reducer.
function setCatch(world: WorldState, d: Disturbance): void {
  d.state = 'gone';
  world.run.promptId = null;
  const loot = createRng(world.seed, LOOT, d.id);
  const species = rollSpeciesAtSet(loot, d.tier);
  const weight = rollWeight(loot, d.tier);

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

  const fight = startTetherFight(world, species, 'player');
  if (fight) {
    scaleFishForTier(world, fish, d.tier);
    world.run.activeCatch = { disturbanceId: d.id, tier: d.tier, weight, species };
  } else {
    world.run.activeCatch = null;
  }
}

// Scale the M1 fish stats by the disturbance tier (dial 6 still applies).
function scaleFishForTier(world: WorldState, fish: WorldState['fish'], tier: 1 | 2 | 3): void {
  const s = FISH_TIER_SCALE[tier]!;
  if (!fish) return;
  fish.maxHp = s.maxHp;
  fish.hp = s.maxHp;
  fish.tether.mass = s.mass;
  fish.tether.maxSwimSpeed = s.swimSpeed;
  fish.tether.pullForce = s.pullForce;
  fish.tether.maxStamina = FISH_STAMINA_BASE * world.tuning.fishStaminaPool * s.staminaMult;
  fish.stamina = fish.tether.maxStamina;
  fish.tether.exhausted = false;
  fish.state = 'idle';
  fish.stateTimer = 0;
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