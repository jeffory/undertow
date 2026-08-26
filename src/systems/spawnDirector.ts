// SPAWN DIRECTOR (systems) — plan 03 §9, task t12 #6. Runs in the `spawn` slot
// (after the dread system). Refills the disturbance pool on the per-phase timer
// and purges consumed ripples (release-farming feeds the refill). Keeps the M1
// land-fish scaffold alive for the docked debug path (lake-shot / T fight).
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { spawnFish, updateFishAI } from '../game/fish';
import { stepSpawnDirector } from '../spawn/director';
import { dockedIslet } from '../gen/lakeWorld';

export function updateSpawnDirectorSystem(world: WorldState, dt: number): void {
  // M1 land-fish scaffold: docked on foot with no catch in flight spawns the
  // debug fish (the T-key fight path + lake-shot gate rely on it). Boat mode
  // has no stray land fish — disturbances own the open water.
  // M7 (plan 05 §2.2): a ROOF is a walkable islet, but nothing flops about on
  // the slates of a drowned house — and, more to the point, the foot cast flow
  // refuses to cast while a land fish is alive (systems/castFlow.ts: on foot the
  // caster is the player only when `world.fish === null`, so a stray scaffold
  // fish would make rooftop fishing impossible). The scaffold is therefore
  // restricted to NATURAL shores. Every docked islet in zones 1-2 is walkable,
  // so this is a no-op outside the Township.
  const iso = dockedIslet(world);
  if (
    world.mode === 'foot' &&
    world.dockedIslet != null &&
    iso?.kind === 'walkable' &&
    world.fish === null &&
    world.run.activeCatch === null &&
    world.tether.fights.length === 0
  ) {
    spawnFish(world);
  }
  if (world.fish && world.tether.fights.length === 0) updateFishAI(world, dt);

  // The disturbance pool (budgets + refill cadence).
  stepSpawnDirector(world, dt);
}