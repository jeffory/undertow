// TOWN BUILDINGS (content) — plan 05 §1.3/§1.4, task t18 slice 2.
//
// The restorable town, as DATA. Plan §1.4 tables twenty buildings across four
// phase gates; THIS ROUND ships the EIGHT that docs/story/town.md §3 wrote —
// Phase 0 (#1–5, available from `start`), the head of Phase 1 (Apothecary,
// Bakery — "after any 5 restored"), and one Phase 2 row (the Schoolhouse,
// gated behind reaching the Township) that the ledger lists but cannot yet
// sell. Rows #9–20 are DEFERRED and drop into this same array with no code
// change.
//
// IDs, names, costs and copy are town.md's, verbatim (see content/townCopy.ts;
// tests/content/townCopy.test.ts asserts the two never drift). Ordering rules
// and phase gates are plan §1.4's.
//
// Every restoration raises the run's starting Dread by +2, capped at +30
// (plan §1.4, §0.2) — that arithmetic lives in game/dread.ts `startingBonus`
// and is telegraphed by the ledger, never hidden.
//
// Pure data: no `three`, no DOM, no Math.random.

export type BuildingId =
  | 'smokehouse'
  | 'chandlery'
  | 'post-office'
  | 'bell-tower'
  | 'chapel'
  | 'apothecary'
  | 'bakery'
  | 'schoolhouse';

// plan §1.4 "Order gating via an `unlockedBy: RunCondition` field". The full
// condition set (`bossDefeated`, `forwardingAddress`, `noteRead`) belongs to
// M6–M10; the three this round can actually evaluate are modelled now and the
// rest are DEFERRED.
export type UnlockCondition =
  | { kind: 'start' }
  | { kind: 'restored'; id: BuildingId }
  | { kind: 'restoredCount'; n: number }
  | { kind: 'zoneReached'; n: number };

export interface BuildingDef {
  id: BuildingId;
  /** plan §1.4 row number — the town's own order of return. */
  row: number;
  /** Fallback name; the player-facing one comes from content/townCopy.ts. */
  name: string;
  /** Memories. plan §1.4 "Cost band" / town.md `costMemories`. */
  cost: number;
  unlockedBy: UnlockCondition;
}

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'smokehouse', row: 1, name: 'Old Sluice Smokehouse', cost: 40, unlockedBy: { kind: 'start' } },
  { id: 'chandlery', row: 2, name: 'Basin Chandlery & Rigging', cost: 45, unlockedBy: { kind: 'start' } },
  { id: 'post-office', row: 3, name: 'District Post Office', cost: 50, unlockedBy: { kind: 'start' } },
  { id: 'bell-tower', row: 4, name: 'Parish Bell Tower', cost: 40, unlockedBy: { kind: 'start' } },
  { id: 'chapel', row: 5, name: 'Chapel of Saint Jude-in-the-Fens', cost: 60, unlockedBy: { kind: 'start' } },
  { id: 'apothecary', row: 6, name: 'Weirside Apothecary', cost: 110, unlockedBy: { kind: 'restoredCount', n: 5 } },
  { id: 'bakery', row: 7, name: 'Hollow Commons Bakery', cost: 110, unlockedBy: { kind: 'restoredCount', n: 5 } },
  { id: 'schoolhouse', row: 14, name: 'Parish Schoolhouse', cost: 180, unlockedBy: { kind: 'zoneReached', n: 3 } },
];

export const BUILDING_IDS: readonly BuildingId[] = BUILDINGS.map((b) => b.id);

export function buildingDef(id: string): BuildingDef | null {
  return BUILDINGS.find((b) => b.id === id) ?? null;
}

// The building's stable slot on the shore's street line (hub presence). It is
// the LEDGER order, not the restoration order: a building always comes back
// where it stood, whatever order the town returns in.
export function buildingSlotIndex(id: string): number {
  const i = BUILDINGS.findIndex((b) => b.id === id);
  return i < 0 ? 0 : i;
}
