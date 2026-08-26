// TOWN RESTORATION (meta) — plan 05 §1.3 / §1.4 / §0.2, task t18 slice 2.
//
// The hub's only spend. Pay `cost` Memories, the building goes back up on its
// foundation, and the lake's starting agitation rises +2 (capped +30). The
// twist is TELEGRAPHED, never hidden: `dreadReadout()` is what the ledger
// prints before the player pays.
//
// Everything here is a PURE function over MetaState — no DOM, no `three`, no
// Math.random, no Date. The caller (systems/restoration.ts, ui/restorationUI.ts)
// owns persistence; this module only ever returns a NEW MetaState.
//
// The `building.restored` event (plan §0.2) is returned as plain data so audio
// and the hub renderer can read it later without importing anything of theirs.

import type { MetaState, RestoredState } from '../save/schemas';
import { BUILDINGS, buildingDef, type BuildingDef, type BuildingId } from '../content/buildings';
import { townCopyFor } from '../content/townCopy';
import { startingBonus } from '../game/dread';

// What the unlock conditions can be evaluated against beyond MetaState itself.
// `deepestZone` is derived from the run log by the caller (plan §0.2 keeps
// MetaState to its eight fields, so progression facts are passed in, not stored).
export interface UnlockContext {
  deepestZone: number; // 1..5 — the deepest zone any run has reached
}

export const DEFAULT_UNLOCK_CONTEXT: UnlockContext = { deepestZone: 1 };

export interface BuildingRestoredEvent {
  type: 'building.restored';
  id: BuildingId;
  name: string;
  cost: number;
  /** Restorations standing AFTER this one. */
  restoredCount: number;
  /** Starting Dread the next run will open at. */
  startingDread: number;
}

export type RestoreFailure =
  | 'unknown-building'
  | 'already-restored'
  | 'locked'
  | 'insufficient-memories';

export interface RestoreResult {
  ok: boolean;
  meta: MetaState; // unchanged on failure
  reason?: RestoreFailure;
  event?: BuildingRestoredEvent;
}

// --- reads ---------------------------------------------------------------------

export function isRestored(meta: MetaState, id: string): boolean {
  return meta.buildings[id]?.restored === true;
}

// Restored ids in LEDGER order (content/buildings.ts), so the street is always
// laid out the same way whatever order the town came back in.
export function restoredIds(meta: MetaState): BuildingId[] {
  return BUILDINGS.filter((b) => isRestored(meta, b.id)).map((b) => b.id);
}

export function restoredCount(meta: MetaState): number {
  return restoredIds(meta).length;
}

// plan §0.2 / §1.4: starting Dread = 2 × restoredCount, capped at 30.
export function startingDreadFor(meta: MetaState): number {
  return startingBonus(restoredCount(meta));
}

// What the ledger prints live next to the pay button — the difficulty the
// player is about to buy, in plain numbers (plan §1.3 "telegraphed, not hidden").
export function dreadReadout(meta: MetaState, id?: string): {
  current: number;
  next: number;
  delta: number;
} {
  const current = startingDreadFor(meta);
  const already = id ? isRestored(meta, id) : false;
  const next = already ? current : startingBonus(restoredCount(meta) + 1);
  return { current, next, delta: next - current };
}

export interface UnlockState {
  unlocked: boolean;
  /** Office-speak, shown on locked rows. Empty when unlocked. */
  reason: string;
}

// The order gate (plan §1.4). Office-speak on the locked branch — the register
// never says "locked", it says what paperwork is outstanding.
export function unlockState(
  meta: MetaState,
  def: BuildingDef,
  ctx: UnlockContext = DEFAULT_UNLOCK_CONTEXT,
): UnlockState {
  const cond = def.unlockedBy;
  switch (cond.kind) {
    case 'start':
      return { unlocked: true, reason: '' };
    case 'restored': {
      if (isRestored(meta, cond.id)) return { unlocked: true, reason: '' };
      const req = buildingDef(cond.id);
      const name = req ? townCopyFor(req.id)?.name ?? req.name : cond.id;
      return {
        unlocked: false,
        reason: `WITHHELD — the ${name} is not yet on the dry register.`,
      };
    }
    case 'restoredCount': {
      const have = restoredCount(meta);
      if (have >= cond.n) return { unlocked: true, reason: '' };
      const short = cond.n - have;
      return {
        unlocked: false,
        reason:
          `WITHHELD — Phase 1 works open at ${cond.n} restored premises. ` +
          `${short} outstanding.`,
      };
    }
    case 'zoneReached': {
      if (ctx.deepestZone >= cond.n) return { unlocked: true, reason: '' };
      return {
        unlocked: false,
        reason:
          'WITHHELD — the parish roll is held at forty fathoms. ' +
          'The Office cannot survey premises it has not visited.',
      };
    }
    default:
      return { unlocked: false, reason: 'WITHHELD — no schedule exists for these works.' };
  }
}

export function affordable(meta: MetaState, def: BuildingDef): boolean {
  return meta.memories >= def.cost;
}

// Can the player pay for this building RIGHT NOW? Everything the button needs.
export function canRestore(
  meta: MetaState,
  id: string,
  ctx: UnlockContext = DEFAULT_UNLOCK_CONTEXT,
): { ok: boolean; reason?: RestoreFailure } {
  const def = buildingDef(id);
  if (!def) return { ok: false, reason: 'unknown-building' };
  if (isRestored(meta, id)) return { ok: false, reason: 'already-restored' };
  if (!unlockState(meta, def, ctx).unlocked) return { ok: false, reason: 'locked' };
  if (!affordable(meta, def)) return { ok: false, reason: 'insufficient-memories' };
  return { ok: true };
}

// --- the write -----------------------------------------------------------------

// Pay for one building. Returns a NEW MetaState on success (the input is never
// mutated) plus the plan §0.2 `building.restored` event. Memories can never go
// negative — an unaffordable restoration is refused, not overdrawn.
export function restore(
  meta: MetaState,
  id: string,
  opts: { atRun?: number; ctx?: UnlockContext } = {},
): RestoreResult {
  const ctx = opts.ctx ?? DEFAULT_UNLOCK_CONTEXT;
  const check = canRestore(meta, id, ctx);
  if (!check.ok) return { ok: false, meta, reason: check.reason };

  const def = buildingDef(id)!;
  const row: RestoredState = {
    restored: true,
    paid: def.cost,
    atRun: Math.max(0, Math.floor(opts.atRun ?? 0)),
  };
  const next: MetaState = {
    ...meta,
    memories: meta.memories - def.cost,
    buildings: { ...meta.buildings, [def.id]: row },
  };
  const count = restoredCount(next);
  return {
    ok: true,
    meta: next,
    event: {
      type: 'building.restored',
      id: def.id,
      name: townCopyFor(def.id)?.name ?? def.name,
      cost: def.cost,
      restoredCount: count,
      startingDread: startingBonus(count),
    },
  };
}
