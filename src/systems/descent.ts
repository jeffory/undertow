// SINKHOLE DESCENT (systems) — plan 03 §2.5/§3.1.6. The contextual hold at a
// sinkhole's mouth: row the boat over the gap, hold the same E verb the bell
// buoy uses, and the lake goes deeper. The two prompts never overlap in space (a
// buoy is a float you extract at; a sinkhole is a hole you go down), so one
// diegetic "hold to commit" verb serves both.
//
// Runs after the night clock and BEFORE the run terminal, so a run cannot both
// descend and extract on the same tick.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { DESCEND_HOLD_SECONDS, canDescend, descend, nearestSinkhole } from '../run/descent';

export function updateDescent(world: WorldState, dt: number): void {
  const run = world.run;
  if (run.ended) return;

  // Descending is a boat verb with both hands free: not mid-fight, not in the
  // water, not while a Dragger has the hull.
  const eligible =
    world.mode === 'boat' &&
    !world.water.active &&
    !world.boatCombat.active &&
    world.tether.fights.length === 0 &&
    canDescend(world);

  if (!eligible) {
    run.descend.held = 0;
    run.descend.buoyId = null;
    return;
  }

  const sinkhole = nearestSinkhole(world, world.boat.x, world.boat.z);
  if (!sinkhole || !world.intent.extract) {
    run.descend.held = 0;
    run.descend.buoyId = null;
    return;
  }

  run.descend.buoyId = sinkhole.id;
  run.descend.held += dt;
  if (run.descend.held >= DESCEND_HOLD_SECONDS) {
    run.descend.held = 0;
    descend(world);
  }
}
