// RIG CATALOGUE (content) — plan 05 §1.2 / §1.8, task t19 slice 2.
//
// What the rig-up register can list. Per the task: "Item catalogues come from
// src/loot/items.ts — verify what item classes exist; render what exists, show
// empty slots for classes without content yet."
//
//   rods       — loot/items.ts has NO rod class yet (the Dredger / Longliner
//                stat blocks are t4-owned, plan §1.8). We still render the two
//                named unlock rods as silhouette lock-ups gated by their
//                workshop, plus the default staff — so the slot has content to
//                requisition even before the stat blocks land.
//   line       — loot/items.ts LINE_POOL, mapped onto the world's LineStats ids
//                (game/line.ts: 'waxed-linen' | 'braided-sinew' | 'bellwire'),
//                so an equipped line actually feeds the run's line slot.
//   lure       — loot/items.ts LURE_POOL (no lure stat table exists yet — the
//                id is the display name; the run feeds world.lure.id).
//   trinkets   — the player's own `box` (sundries with slot 'trinket').
//   consumables— loot/items.ts BAIT_POOL + CONSUMABLE_POOL (no in-run system
//                consumes them yet — they persist in the loadout).
//
// Gating comes from content/buildings.ts (a workshop must be on the dry
// register) and the Keeper's License grade (save.license.grade). A rod row
// carries its own `unlockedBy` + `tackleGrade`; the inert sundries carry none
// yet, so they render free until a class gains a gate.
//
// Pure data: no `three`, no DOM, no Math.random.

import { CONSUMABLE_POOL, BAIT_POOL, LINE_POOL, LURE_POOL } from '../loot/items';
import type { BuildingId } from './buildings';

// --- rods ---------------------------------------------------------------------
// The plan §1.8 named unlocks, data-side. `tackleGrade` is the license-grade
// gate (item grade > license grade ⇒ RESTRICTED. NICE TRY.); `unlockedBy` is
// the workshop gate (building must be restored). The base staff has no gates.
export interface RodDef {
  id: string;
  name: string;
  tackleGrade: number;
  unlockedBy: { kind: 'start' } | { kind: 'restored'; id: BuildingId };
}

export const RODS: readonly RodDef[] = [
  { id: 'rod-staff', name: "The Keeper's Staff", tackleGrade: 1, unlockedBy: { kind: 'start' } },
  { id: 'rod-dredger', name: 'Dredger', tackleGrade: 2, unlockedBy: { kind: 'restored', id: 'smokehouse' } },
  { id: 'rod-longliner', name: 'Longliner', tackleGrade: 3, unlockedBy: { kind: 'restored', id: 'chandlery' } },
];

export function rodDef(id: string): RodDef | null {
  return RODS.find((r) => r.id === id) ?? null;
}

// --- line catalogue -------------------------------------------------------------
// items.ts LINE_POOL names, bound to the world's LineStats ids (game/line.ts)
// so an equipped line actually lands in the run's line slot. No gate yet.
export interface RigLineDef {
  id: string;
  name: string;
}

const LINE_IDS: Record<string, string> = {
  'Waxed Linen': 'waxed-linen',
  'Braided Sinew': 'braided-sinew',
  Bellwire: 'bellwire',
};

export const LINE_CATALOGUE: readonly RigLineDef[] = LINE_POOL.map((name) => ({
  id: LINE_IDS[name] ?? name.toLowerCase().replace(/\s+/g, '-'),
  name,
}));

export function lineDef(id: string): RigLineDef | null {
  return LINE_CATALOGUE.find((l) => l.id === id) ?? null;
}

// The LineStats-compatible id for a line's DISPLAY name (a box sundry carries
// the pool name, e.g. 'Waxed Linen'; the run's line slot wants 'waxed-linen').
// Unmapped names (e.g. a future unique like 'Widow's Hair') fall back to a
// kebab of the name — persisted but inert until a stat block exists.
export function lineIdForName(name: string): string {
  return lineDef(name)?.id ?? name.toLowerCase().replace(/\s+/g, '-');
}

// --- lure catalogue --------------------------------------------------------------
// items.ts LURE_POOL. No lure stat table exists yet, so the id is the display
// name; the run feeds world.lure.id. No gate yet.
export const LURE_CATALOGUE: readonly string[] = LURE_POOL;

// --- consumable catalogue ---------------------------------------------------------
// items.ts BAIT_POOL + CONSUMABLE_POOL (bait first — chum, then stores).
export const CONSUMABLE_CATALOGUE: readonly string[] = [...BAIT_POOL, ...CONSUMABLE_POOL];