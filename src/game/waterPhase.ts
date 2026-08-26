// WATER PHASE (game) — plan 02 §8, T9. Submerged state, triggered when a drag
// displaces the tethered player past the islet shoreline (world.ground
// boundary). Runs between tetherConstraint and tetherLog (it reads the
// post-pull position and pushes surfaced/pulledUnder events into the stream
// before the logger consumes it) and before movement/collision (movement reads
// its drift; collision skips the player clamp while under, so the swimmer stays
// out in the water instead of being snapped back to the shore).
//
// Behaviour (spec §4.5 / plan 02 §8):
//   - Trigger: player past the ground boundary while a tether fight is active.
//   - Breath: drains 1/s from 15. Clamps at 0 — NOT lethal in M2 (clamp +
//     surface at shore; the threatsApproach / drowning pressure is 03/05's).
//   - Verbs under: reel / cut / struggle toward shore. Dodge (controller) and
//     gaff (combat) are suppressed; movement is damped (0.85×) plus a small
//     sinusoidal drift — slow and drifty.
//   - Exit: reach the shore (back inside the boundary) → surfaced, breath reset.
//     A fight ending while under (cut / land / snap / butcher) surfaces too.
//   - ui.underwater flag is set on entry / cleared on exit; a DOM tint in the
//     ui system (systems.ts) consumes it as the screen-inversion hook.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { enterWaterPhase } from './tether';
import type { TetherEvent } from './tether';
import { dockedIslet, nearestDockableIslet, dockPlayer } from '../gen/lakeWorld';
import { circleOutOfHull, polygonCentroid } from '../core/poly';

// --- tuning constants ---------------------------------------------------------
export const BREATH_MAX = 15; // s of breath (spec §4.5 "15s breath timer")
export const BREATH_DRAIN = 1; // breath/s while under
export const WATER_DAMP = 0.85; // movement velocity damp while under (plan §8 "vel × 0.85/frame")
export const DRIFT_AMP = 0.3; // m/s — sinusoidal drift magnitude (plan §8 "small drift")
export const DRIFT_FREQ_X = 0.7; // rad/s — drift wave along x
export const DRIFT_FREQ_Z = 0.5; // rad/s — drift wave along z

// --- swamp (extended water phase, plan 03 §6.1) --------------------------------
// A hull swamp drops the keeper in the water with the haul sinking around them.
// There is no tether fight holding them under any more, breath IS lethal, and
// the only exit is a walkable shore.
export const SWAMP_PICKUP_RANGE = 2.5; // m — reach for a sinking CatchRecord
export const SWAMP_PICKUP_BREATH = 2; // s of breath per pickup ("each pickup costs breath seconds")
export const SWAMP_SHORE_RANGE = 1.5; // m — close enough to a walkable hull to climb out

// The player is "in deep water" once their circle pokes past the walkable islet
// they are docked to (the islet's convex hull — plan 03 §2.6). So the only way
// past it is being pulled (a tethered drag), which is exactly the trigger. Falls
// back to the M1 ground circle when no lake is present.
function inDeepWater(world: WorldState): boolean {
  const p = world.player;
  const iso = dockedIslet(world);
  if (iso) {
    return circleOutOfHull({ x: p.x, z: p.z, radius: p.radius }, iso.hull) > 0;
  }
  const g = world.ground;
  const dist = Math.hypot(p.x - g.x, p.z - g.z);
  return dist > g.radius - p.radius;
}

function updateDrift(world: WorldState): void {
  const t = world.time.elapsed;
  world.water.drift.x = Math.sin(t * DRIFT_FREQ_X) * DRIFT_AMP;
  world.water.drift.z = Math.cos(t * DRIFT_FREQ_Z) * DRIFT_AMP;
}

function updateTowardShore(world: WorldState): void {
  // struggle vector points at the walkable surface centre (islet hull centroid,
  // or the legacy ground centre)
  const p = world.player;
  const iso = dockedIslet(world);
  const target = iso ? polygonCentroid(iso.hull) : { x: world.ground.x, z: world.ground.z };
  const dx = target.x - p.x;
  const dz = target.z - p.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  world.water.towardShore.x = dx / len;
  world.water.towardShore.z = dz / len;
}

function surface(world: WorldState): void {
  world.water.active = false;
  world.water.breath = world.water.breathMax;
  world.water.drift.x = 0;
  world.water.drift.z = 0;
  world.water.sinkingHaul = false;
  world.water.lethal = false;
  world.water.adrift = false;
  world.ui.underwater = false;
  // Anything still sinking when the keeper climbs out is lost from the run haul
  // (plan §6.1: "extraction yields what you actually carried out").
  world.run.sinking = [];
  const ev: TetherEvent = { type: 'surfaced', breathSec: world.water.breathMax };
  world.tetherEvents.push(ev);
}

// The EXTENDED variant of the phase (plan §6.1's swamp; 05 §2.3's adrift).
// Pickups cost breath seconds; breath 0 drowns ONLY when `water.lethal` is set
// (the swamp sets it; the Whistler's delivery deliberately does not); reaching a
// walkable islet hull climbs out and ends it, losing whatever is still sinking.
function updateSwampPhase(world: WorldState, dt: number): void {
  const water = world.water;
  const p = world.player;

  water.breath = Math.max(0, water.breath - BREATH_DRAIN * dt);
  updateDrift(world);
  updateTowardShore(world);

  // Grab what you can — nearest first, one per step, each paying breath.
  for (let i = 0; i < world.run.sinking.length; i++) {
    const item = world.run.sinking[i]!;
    if (Math.hypot(item.x - p.x, item.z - p.z) <= SWAMP_PICKUP_RANGE) {
      world.run.sinking.splice(i, 1);
      world.run.haul.push(item.record);
      water.breath = Math.max(0, water.breath - SWAMP_PICKUP_BREATH);
      break;
    }
  }

  // Shore = out. Climb onto the nearest walkable islet (the run continues on
  // foot; the boat is gone for good).
  const iso = nearestDockableIslet(world, p.x, p.z, SWAMP_SHORE_RANGE);
  if (iso) {
    surface(world);
    dockPlayer(world, iso.id, { x: p.x, z: p.z });
    return;
  }

  // Out of breath in a swamped boat's wake: the water-phase timer runs out
  // (plan §7.2 death path). hp 0 → the run terminal ends the run at 30%.
  if (water.breath <= 0 && water.lethal) {
    p.hp = 0;
  }
}

export function updateWaterPhase(world: WorldState, dt: number): void {
  const water = world.water;

  if (water.active) {
    // The EXTENDED variants have no fight holding them open — they run on breath
    // and a swim alone. Two producers reach this branch:
    //   • `sinkingHaul` — the hull swamp (03 §6.1), lethal, haul on the bottom;
    //   • `adrift` — the Whistler's delivery (05 §2.3), NOT lethal and with
    //     nothing sinking, because it did not want you dead, it wanted you in
    //     the water. `water.lethal` is what separates the two outcomes, and the
    //     swim to a walkable shore is identical.
    if (water.sinkingHaul || water.adrift) {
      updateSwampPhase(world, dt);
      return;
    }
    // A fight ending while under (cut / land / snap / butcher removes it from
    // world.tether.fights) surfaces the player — treading water at wade pace.
    if (world.tether.fights.length === 0) {
      surface(world);
      return;
    }
    // Breath drains, clamped at 0. NOT lethal in M2 — the player survives by
    // reaching shore; the threatsApproach/drowning pressure is 03/05's hook.
    water.breath = Math.max(0, water.breath - BREATH_DRAIN * dt);
    updateDrift(world);
    updateTowardShore(world);
    // Reaching the shore exits the phase and resets breath to full.
    if (!inDeepWater(world)) {
      surface(world);
      return;
    }
    // 05 §2.2 — THE DROWNING PRESSURE THE COMMENT ABOVE PROMISED, claimed by the
    // Postmaster. `water.lethal` is opt-in state, set by whatever put the keeper
    // under; the swamp branch has read it since 03 §6.1 and this branch now
    // reads it the same way. Nothing sets it on an ordinary drag, so an ordinary
    // water phase still merely clamps at 0 exactly as it always has.
    if (water.breath <= 0 && water.lethal) world.player.hp = 0;
    return;
  }

  // Trigger: a drag displaced the player past the shoreline while tethered.
  // FOOT mode only: aboard the boat the keeper is not in the water at all, and
  // the M1 ground-circle fallback would otherwise read every boat-anchored
  // fight (and every cast made from the boat, which parks the keeper at the
  // boat) as "past the shoreline" and submerge them on open water.
  if (world.mode === 'foot' && world.tether.fights.length > 0 && inDeepWater(world)) {
    enterWaterPhase(world, { breathSec: BREATH_MAX, occupied: false });
    world.ui.underwater = true;
    world.tetherEvents.push({
      type: 'pulledUnder',
      breathSec: BREATH_MAX,
      occupied: false,
    });
  }
}