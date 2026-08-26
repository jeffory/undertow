// BOTTLED LIGHT (systems) — the in-run verb (plan 05 §1.7 / §0.1's tether
// interface "Bottled Light tension-reset"), task t21.
//
// One keypress, one bottle: L pops a charge the rig-up packed, the active
// fight's tension drops to 0 and the keeper's stamina comes back full. The
// math and the pool live in meta/bottledLight.ts (pure); this system is only
// the seam that reads the intent tap, spends the charge, and puts the
// `bottledLight.used` event on the town queue.
//
// Runs in the sim phase (after the tether constraint has already written this
// step's tension, so the reset is the last word on the step it fired).
//
// Pure logic: no `three`, no DOM.

import type { WorldState } from '../core/world';
import { useBottledLight } from '../meta/bottledLight';
import { emitTownEvent } from '../meta/townEvents';

export function updateBottledLight(world: WorldState, _dt: number): void {
  if (!world.intent.bottledLight) return;
  world.intent.bottledLight = false;
  const event = useBottledLight(world);
  if (event) emitTownEvent(event);
}
