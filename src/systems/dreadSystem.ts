// DREAD SYSTEM (systems) — plan 03 §4, task t12 #2. Runs in the `dread` slot
// (after combat). The run reducer folds the fresh tether event stream into the
// haul + Dread gains; the system rolls the peak and wires the one tier effect
// that has a producer in M3 (tier ≥ 3 → the water phase is *occupied* — the t2
// threatsApproach hook). Ambush / Caller / Snatcher / Whistler producers are M4
// (logged in game/dread.ts TIER_EFFECTS, never spawned).
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { processRunEvents } from '../run/reducer';
import { tierFor, heartbeatBpm } from '../game/dread';

export function updateDreadSystem(world: WorldState, _dt: number): void {
  // haul + Dread gains from this tick's tether events (landed / butchered / snap…)
  processRunEvents(world);

  const tier = tierFor(world.dread);
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  // Tier ≥ 3 → the water phase becomes *occupied* (plan §4.2): the one tier
  // effect wired where a system exists now.
  world.water.threatsApproach = tier >= 3;

  // Heartbeat hook for the audio worker (plan §4.5) — pure, nothing binds it yet.
  void heartbeatBpm(world.dread);
}