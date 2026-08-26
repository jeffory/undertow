// DOORSTEP BARKS (systems) — plan 05 §1.5, task t19 slice 2.
//
// The sim-side proximity half of the bark verb, in the townDoor pattern: when
// the keeper walks near a RESTORED building on foot, the resident's doorstep
// bark is scheduled ONCE per approach. The ui system reads the world's
// `town.pendingBark` and shows the toast; the audio worker later drains the
// matching `bark.shown` event from the townEvents queue.
//
// Rules (task t19):
//   • proximity: same foot-mode/start-islet/underwater gates as the lighthouse
//     door — the town is only reachable on foot on the start islet;
//   • once per building per approach: `fired[id]` is set when the bark plays,
//     and cleared when the keeper leaves the building's reach, so re-approaching
//     re-arms it;
//   • visit counts accumulate per run and feed the deterministic rotation
//     (meta/barks.ts — no Math.random);
//   • the mask-slip bark only enters the rotation at ≥ 5 restored premises.
//
// Pure sim: no DOM, no `three` (core/save is the guarded DOM/IndexedDB seam).

import type { WorldState } from '../core/world';
import { getSave } from '../core/save';
import { BUILDINGS } from '../content/buildings';
import { barkForRun } from '../meta/barks';
import { barkSetFor } from '../content/townCopy';
import { emitBarkShown } from '../meta/townEvents';
import { restoredIds } from '../meta/restoration';
import { townSlots } from '../meta/hubStreet';
import type { Islet } from '../gen/lakeMap';

// m — how close the keeper must be to a building's door for its resident to
// speak. A little tighter than the door reach (the street is a row of doors).
export const BARK_RANGE = 4.5;

// The buildings currently within reach of the keeper. Pure over (world, islet)
// so the proximity rule is testable without a save. Slot i of the street is
// BUILDINGS[i] (ledger order — see content/buildings.ts buildingSlotIndex).
export function buildingsWithinBarkRange(world: WorldState, islet: Islet): string[] {
  const slots = townSlots(islet, BUILDINGS.length);
  const out: string[] = [];
  for (let i = 0; i < BUILDINGS.length; i++) {
    const def = BUILDINGS[i];
    const slot = slots[i];
    if (!def || !slot) continue;
    if (Math.hypot(slot.x - world.player.x, slot.z - world.player.z) <= BARK_RANGE) {
      out.push(def.id);
    }
  }
  return out;
}

export function updateBarks(world: WorldState, _dt: number): void {
  // foot mode, on the start islet, hands free — the town is a shore, not a lake.
  const lake = world.lake;
  if (!lake) return;
  if (world.mode !== 'foot' || world.water.active) return;
  if (world.dockedIslet !== lake.startIslet) return;
  const iso = lake.islets[lake.startIslet];
  if (!iso) return;
  // a bark is already waiting for its toast — do not pile another onto it
  if (world.town.pendingBark) return;

  const save = getSave();
  if (!save) return;
  const restored = new Set<string>(restoredIds(save.metaState));
  if (restored.size === 0) return;

  const near = buildingsWithinBarkRange(world, iso);
  const barks = world.town.barks;

  // Re-approach: any building we are no longer near has its cooldown reset.
  const nearSet = new Set(near);
  for (const id of Object.keys(barks.fired)) {
    if (!nearSet.has(id)) delete barks.fired[id];
  }

  for (const id of near) {
    if (!restored.has(id)) continue;
    if (barks.fired[id]) continue; // once per approach
    if (!barkSetFor(id)) continue;
    const visit = (barks.visits[id] ?? 0) + 1;
    const line = barkForRun(world.seed, id, visit - 1, restored.size);
    if (!line) continue;
    barks.visits[id] = visit;
    barks.fired[id] = true;
    const pending = {
      text: line.text,
      residentId: line.residentId,
      residentName: line.residentName,
      buildingId: id,
      maskSlipping: line.maskSlipping,
    };
    world.town.pendingBark = pending;
    emitBarkShown(pending, visit);
    return; // one toast at a time — the next approach's turns in after this one
  }
}