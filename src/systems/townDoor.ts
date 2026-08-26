// LIGHTHOUSE DOOR (systems) — the restoration verb (plan 05 §1.1 "the rig-up and
// restoration are HTML overlays triggered by proximity/interaction with the
// lighthouse door", task t18 slice 4).
//
// The same contextual hold the lake already uses (hold E at a bell buoy to
// extract, over a sinkhole to descend), on foot at the lighthouse door: walk up,
// hold, the Office of Public Works register opens. One verb, three doors.
//
// The system only ever sets `world.town.open` — the overlay itself is the ui
// system's job (ui/restorationUI.ts), so the sim stays DOM-free and three-free.
//
// Runs in the sim phase, so the hold scales with ?timescale like every other
// held verb.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { lighthouseFoot } from '../meta/hubStreet';

// m — the doorstep. Wider than the 3 m buoy reach (the tower's footprint is
// itself a couple of metres across) and narrower than the 6 m sinkhole mouth.
export const DOOR_RANGE = 4.5;
// s — shorter than the descent's 2 s: opening a register is not a commitment.
export const DOOR_HOLD_SECONDS = 1;

// Is the keeper standing at the lighthouse door, hands free?
export function atLighthouseDoor(world: WorldState): boolean {
  const lake = world.lake;
  if (!lake) return false;
  if (world.mode !== 'foot' || world.water.active) return false;
  if (world.dockedIslet !== lake.startIslet) return false;
  if (world.tether.fights.length > 0) return false;
  const iso = lake.islets[lake.startIslet];
  if (!iso) return false;
  const door = lighthouseFoot(iso);
  return Math.hypot(door.x - world.player.x, door.z - world.player.z) <= DOOR_RANGE;
}

export function updateTownDoor(world: WorldState, dt: number): void {
  const town = world.town;

  // While the register is up the hold is parked — releasing E must not
  // immediately re-arm and re-open it behind the overlay.
  if (town.open) {
    town.held = 0;
    town.near = atLighthouseDoor(world);
    return;
  }

  const near = atLighthouseDoor(world);
  town.near = near;
  if (!near || !world.intent.extract) {
    town.held = 0;
    return;
  }
  town.held += dt;
  if (town.held >= DOOR_HOLD_SECONDS) {
    town.held = 0;
    town.open = true;
  }
}
