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

// --- tuning constants ---------------------------------------------------------
export const BREATH_MAX = 15; // s of breath (spec §4.5 "15s breath timer")
export const BREATH_DRAIN = 1; // breath/s while under
export const WATER_DAMP = 0.85; // movement velocity damp while under (plan §8 "vel × 0.85/frame")
export const DRIFT_AMP = 0.3; // m/s — sinusoidal drift magnitude (plan §8 "small drift")
export const DRIFT_FREQ_X = 0.7; // rad/s — drift wave along x
export const DRIFT_FREQ_Z = 0.5; // rad/s — drift wave along z

// The player is "in deep water" once their centre sits beyond the walkable
// islet — the same radius the collision system clamps to. So the only way past
// it is being pulled (a tethered drag), which is exactly the trigger.
function inDeepWater(world: WorldState): boolean {
  const g = world.ground;
  const p = world.player;
  const dist = Math.hypot(p.x - g.x, p.z - g.z);
  return dist > g.radius - p.radius;
}

function updateDrift(world: WorldState): void {
  const t = world.time.elapsed;
  world.water.drift.x = Math.sin(t * DRIFT_FREQ_X) * DRIFT_AMP;
  world.water.drift.z = Math.cos(t * DRIFT_FREQ_Z) * DRIFT_AMP;
}

function updateTowardShore(world: WorldState): void {
  const g = world.ground;
  const p = world.player;
  const dx = g.x - p.x;
  const dz = g.z - p.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  world.water.towardShore.x = dx / len;
  world.water.towardShore.z = dz / len;
}

function surface(world: WorldState): void {
  world.water.active = false;
  world.water.breath = world.water.breathMax;
  world.water.drift.x = 0;
  world.water.drift.z = 0;
  world.ui.underwater = false;
  const ev: TetherEvent = { type: 'surfaced', breathSec: world.water.breathMax };
  world.tetherEvents.push(ev);
}

export function updateWaterPhase(world: WorldState, dt: number): void {
  const water = world.water;

  if (water.active) {
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
    if (!inDeepWater(world)) surface(world);
    return;
  }

  // Trigger: a drag displaced the player past the shoreline while tethered.
  if (world.tether.fights.length > 0 && inDeepWater(world)) {
    enterWaterPhase(world, { breathSec: BREATH_MAX, occupied: false });
    world.ui.underwater = true;
    world.tetherEvents.push({
      type: 'pulledUnder',
      breathSec: BREATH_MAX,
      occupied: false,
    });
  }
}