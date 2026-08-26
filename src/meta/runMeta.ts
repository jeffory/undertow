// RUN ↔ META HOOKS (meta) — plan 05 §0.2 "`runMetaStart` / `runMetaEnd` hooks:
// called by t3 at run start/end; the run start sets `DreadSystem.startingValue
// = 2 × restoredCount (cap 30)`". Task t18 slice 2.
//
// `runMetaStart` is the whole of it this round: a fresh run opens the water at
// the Dread the town has bought. It runs alongside the other run-start passives
// (loot/runStart.ts) so there is exactly one seam where a fresh world gets its
// carried-over state.
//
// `runMetaEnd` is DEFERRED — plan §6.1's contentTracker is M10 work. The
// Memories side of the run end already lands in the save (save/migrate.ts
// `applyRunResult` banks the receipt into `metaState.memories`).
//
// Pure logic: no `three` imports (core/save is a guarded DOM/IndexedDB seam).

import type { WorldState } from '../core/world';
import type { MetaState, SaveGame } from '../save/schemas';
import { startingDreadFor } from './restoration';
import type { UnlockContext } from './restoration';
import { MAX_ZONE, MIN_ZONE } from '../core/zones';

// The deepest zone any logged run reached. plan §0.2 keeps MetaState to eight
// fields, so this progression fact is DERIVED from the run log rather than
// stored — the ledger's `zoneReached` gates read it through UnlockContext.
export function deepestZoneReached(save: Pick<SaveGame, 'runs'> | null): number {
  if (!save) return MIN_ZONE;
  let deepest = MIN_ZONE;
  for (const run of save.runs) {
    const zone = MIN_ZONE + (run.sinkholesDescended ?? 0);
    if (zone > deepest) deepest = zone;
  }
  return Math.min(MAX_ZONE, deepest);
}

export function unlockContextFor(save: Pick<SaveGame, 'runs'> | null): UnlockContext {
  return { deepestZone: deepestZoneReached(save) };
}

// The run-start hook. Stamps the world's opening Dread from the restored town
// and re-stamps the run's `startedAtDread` / `dreadPeak` (run/run.ts's initRun
// captured them from a world that had not been told about the town yet).
// A run already under way at a HIGHER Dread is never pulled down — this is a
// floor on the opening value, not an assignment mid-run.
export function runMetaStart(world: WorldState, meta: MetaState | null | undefined): number {
  if (!meta) return world.dread;
  const base = startingDreadFor(meta);
  if (base > world.dread) world.dread = base;
  world.run.startedAtDread = world.dread;
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);
  return world.dread;
}
