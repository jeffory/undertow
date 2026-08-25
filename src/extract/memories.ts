// MEMORIES (extract) — plan 03 §7, task t12 #4. The exact conversion math from
// a run haul to the Office's currency:
//   memories = weight × rarityMult × (clean ? 1.5 : 1), floored at the record
// Extraction keeps 100%; death keeps 30% of EACH record, floored, then summed
// (the condolence rate — a tester who dies every run still banks something).
// For M3 the rarity is the disturbance tier (1..3; 4 forward-compatible).
//
// Pure logic: no `three` imports.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'drowned';

// M3: tier 1 = common, 2 = uncommon, 3 = rare, 4 = epic (M4 content fills out).
export const TIER_MULT = [0, 1, 2, 3.5, 6];

export function rarityMultForTier(tier: number): number {
  return TIER_MULT[Math.max(1, Math.min(4, Math.floor(tier)))] ?? 1;
}

export const CLEAN_MULT = 1.5;
export const CONDOLENCE_RATE = 0.3;

export interface CatchRecord {
  species: string;
  tier: number;
  weight: number; // kg
  clean: boolean; // clean-exhaustion land → ×1.5
  memories: number; // floored at the record
  xp: number;
}

// weight × rarityMult × (clean ? 1.5 : 1), floored — the plan's "floor at the record".
export function catchMemories(weight: number, tier: number, clean: boolean): number {
  const mult = rarityMultForTier(tier) * (clean ? CLEAN_MULT : 1);
  return Math.floor(weight * mult);
}

// 30% of each record, floored, then summed — never floor-of-the-sum.
export function condolenceMemories(haul: CatchRecord[]): number {
  let total = 0;
  for (const rec of haul) total += Math.floor(rec.memories * CONDOLENCE_RATE);
  return total;
}

export function haulMemories(haul: CatchRecord[], extracted: boolean): number {
  if (extracted) return haul.reduce((s, r) => s + r.memories, 0);
  return condolenceMemories(haul);
}