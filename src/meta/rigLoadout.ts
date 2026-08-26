// RIG LOADOUT (meta) — plan 05 §1.2, task t19 slice 2.
//
// The pure rules behind the rig-up register: what a row may be requisitioned
// against (the Keeper's License grade + which workshops stand on the dry
// register), and how a saved loadout feeds the run at start.
//
// GATING (town.md §5 "Restricted Tackle Overlays"):
//   - `restricted_license_tier`:  item tackle grade > license grade
//   - `restricted_unrestored_building`:  item needs a workshop not yet restored
//   The notice body copy lives in content/townCopy.ts RESTRICTED_NOTICES — this
//   module only picks WHICH gate fired.
//
// RUN-START FEED: trinkets flow through the existing seam (loot/runStart.ts
// `applyRunStartPassives` reads `rigLoadout.trinketIds`); rods/consumables have
// no wired effect yet, so they are persisted and gated but silent. The line and
// lure ids DO map onto world slots (world.line / world.lure), so those two are
// applied here and called from the same run-start seam — one writer, one reader.
//
// Pure logic: no `three`, no DOM, no Math.random.

import type { WorldState } from '../core/world';
import type { RigLoadout, SaveGame } from '../save/schemas';
import { rodDef, lineDef, type RodDef } from '../content/rigCatalog';
import { bottledLightCharges } from './bottledLight';

export type RigGateContext = {
  licenseGrade: number; // save.license.grade (1..7)
  restored: Set<string>; // building ids on the dry register
};

// The writable shape the register hands to core/save — same fields as the
// schema's RigLoadout, without the zod defaults.
export type RigLoadoutLike = RigLoadout;

export type RigRestriction = 'restricted_license_tier' | 'restricted_unrestored_building';

// A row's availability: `ok` true = requisitionable; false carries which gate
// fired (the UI stamps the matching RESTRICTED. NICE TRY. notice).
export interface RigRowGate {
  ok: boolean;
  restriction?: RigRestriction;
}

export function rigGateContext(save: SaveGame): RigGateContext {
  const restored = new Set<string>();
  for (const [id, row] of Object.entries(save.metaState.buildings)) {
    if (row.restored) restored.add(id);
  }
  return { licenseGrade: save.license.grade, restored };
}

// The workshop gate on a rod: a rod whose unlock is a building only renders
// once that building stands. Always ok when the gate is 'start'.
export function rodGate(rod: RodDef, ctx: RigGateContext): RigRowGate {
  if (rod.unlockedBy.kind === 'restored') {
    if (!ctx.restored.has(rod.unlockedBy.id)) {
      return { ok: false, restriction: 'restricted_unrestored_building' };
    }
  }
  if (rod.tackleGrade > ctx.licenseGrade) {
    return { ok: false, restriction: 'restricted_license_tier' };
  }
  return { ok: true };
}

// The generic row gate for a catalogue entry carrying a tackle grade. Inert
// sundries (lines/lures/consumables/trinkets) have no grade or workshop yet —
// the caller passes the fields it has and anything absent is treated as open.
export function gradeGate(tackleGrade: number | null | undefined, ctx: RigGateContext): RigRowGate {
  if (tackleGrade == null) return { ok: true };
  if (tackleGrade > ctx.licenseGrade) return { ok: false, restriction: 'restricted_license_tier' };
  return { ok: true };
}

// Sanitize a persisted loadout against the CURRENT gates: drop anything the
// license or the town now withholds. Used by the register on open and by the
// run-start feed, so a loadout that outlived its gate can never smuggle gear
// into the basin. Returns the ids that survived (per class).
export function sanitizeRigLoadout(save: SaveGame): {
  rodId: string | null;
  lineId: string | null;
  lureIds: string[];
  trinketIds: string[];
  consumables: string[];
} {
  const ctx = rigGateContext(save);
  const loadout = save.rigLoadout;
  const rod = loadout.rodId ? rodDef(loadout.rodId) : null;
  const rodId = rod && rodGate(rod, ctx).ok ? rod.id : null;
  const line = loadout.lineId ? lineDef(loadout.lineId) : null;
  const lineId = line && gradeGate(1, ctx).ok ? line.id : null;
  // Inert classes: no gate today — persist what the register allowed.
  return {
    rodId,
    lineId,
    lureIds: loadout.lureIds.slice(0, 3),
    trinketIds: loadout.trinketIds.slice(0, 2),
    consumables: loadout.consumables.slice(),
  };
}

// Feed the loadout's gear onto a FRESH world's existing slots. Trinkets are
// NOT touched here — applyRunStartPassives already applies them from the same
// rigLoadout.trinketIds (the two share one source). Rods have no wired effect
// yet and are deliberately silent (persisted, gated only); of the consumables,
// only Bottled Light has a verb (05 §1.7) — its packed bottles become the run's
// charge pool here, and bait/food stay inert.
export function applyRigGear(world: WorldState, save: SaveGame): void {
  const kept = sanitizeRigLoadout(save);
  const line = kept.lineId ? lineDef(kept.lineId) : null;
  if (line) world.line.id = line.id;
  const lure = kept.lureIds[0];
  if (lure) world.lure.id = lure;
  world.consumables.bottledLight = bottledLightCharges(kept.consumables);
}

// Reconcile a stale loadout back into the save (drop gated-out ids). Returns
// the cleaned SaveGame; callers persist via core/save's updateSave.
export function reconcileRigLoadout(save: SaveGame): SaveGame {
  const kept = sanitizeRigLoadout(save);
  return {
    ...save,
    rigLoadout: {
      rodId: kept.rodId,
      lineId: kept.lineId,
      lureIds: kept.lureIds,
      trinketIds: kept.trinketIds,
      consumables: kept.consumables,
    },
    equipped: kept.trinketIds,
  };
}