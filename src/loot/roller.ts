// LOOT ROLLER (loot) — plan 04 §7.1/§7.3, task t19. The rarity ladder
// C/U/R/E/Drowned (Drowned gated until license grade 6, per §8.2 G6 — its weight
// is 0 below that), the slot roll on landed catches by catch-tier + Dread
// weights, the affixed-trinket roller (one prefix + one suffix), the inert-slot
// fallback items, and the Drowned named-unique roll (§7.3 "Drowned rolls a named
// unique instead of affixes"). Every draw is pure over the passed PCG32 stream —
// same seed + same ctx → same drop (spec 8.3, plan 04 §2).
//
// ctx is built from the run reducer: zoneDepth (Shallows = 1), the landed
// catch's tier, the current Dread tier, the equipped license grade, and the
// catch's quality (clean +1 / butcher −1). Dread tier 3+ pulls the rarity
// weights up; qualityBonus moves the catch's item tier.
//
// Pure logic: no `three` imports.

import type { Rng } from '../core/rng';
import {
  PREFIXES,
  SUFFIXES,
  DROWNED_UNIQUES,
  RARITY_AFFIX_MULT,
  SLOT_POOLS,
  RARITY_RANK,
  type AffixDef,
  type Rarity,
  type Slot,
  type SundryItem,
} from './items';

export interface RollCtx {
  zoneDepth: number; // 1..5 (Shallows = 1) — base rarity ladder
  catchTier: number; // 1..5 — the landed catch's loot tier
  dreadTier: number; // 0..4
  licenseGrade: number; // 1..7
  qualityBonus: number; // clean +1, butcher −1
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Base rarity weights per zone depth (plan §7.1 "base rarity weights per zone
// depth shift with dreadTier and qualityBonus"). Drowned weight is 0 until the
// G6 gate (license grade 6) — the ladder includes the slot so deeper-zone runs
// can light it up later; below grade 6 the Drowned tail simply never rolls.
const ZONE_BASE: Record<number, Record<Exclude<Rarity, 'Drowned'>, number>> = {
  1: { C: 62, U: 24, R: 11, E: 3 },
  2: { C: 46, U: 30, R: 18, E: 6 },
  3: { C: 32, U: 30, R: 26, E: 12 },
  4: { C: 20, U: 26, R: 32, E: 22 },
  5: { C: 10, U: 20, R: 36, E: 34 },
};

export const DROWNED_WEIGHT = 3; // the G6-gated tail of the ladder
export const DROWNED_GATE_GRADE = 6;

export function rarityWeights(ctx: RollCtx): Record<Rarity | 'Drowned', number> {
  const depth = clamp(Math.floor(ctx.zoneDepth), 1, 5);
  const base = { ...ZONE_BASE[depth]! } as Record<Rarity, number>;
  if (ctx.dreadTier >= 3) {
    base.C *= 0.7;
    base.U *= 0.95;
    base.R *= 1.35;
    base.E *= 1.7;
  }
  if (ctx.qualityBonus >= 1) {
    base.C *= 0.85;
    base.U *= 0.95;
    base.R *= 1.15;
    base.E *= 1.4;
  }
  if (ctx.qualityBonus <= -1) {
    base.C *= 1.3;
    base.U *= 1.1;
    base.R *= 0.85;
    base.E *= 0.5;
  }
  return { ...base, Drowned: ctx.licenseGrade >= DROWNED_GATE_GRADE ? DROWNED_WEIGHT : 0 };
}

// Roll the rarity ladder C/U/R/E (+ Drowned once the G6 gate lifts its weight —
// grade 6+ adds the Drowned tail, plan §8.2 G6).
export function rollRarity(rng: Rng, ctx: RollCtx): Rarity {
  const w = rarityWeights(ctx);
  const ladder: [Rarity, number][] = [
    ['C', w.C],
    ['U', w.U],
    ['R', w.R],
    ['E', w.E],
  ];
  if (w.Drowned > 0) ladder.push(['Drowned', w.Drowned]);
  const total = ladder.reduce((s, [, v]) => s + v, 0);
  let r = rng.nextFloat() * total;
  for (const [rar, v] of ladder) {
    r -= v;
    if (r <= 0) return rar;
  }
  return 'E';
}

// --- slot roll (landed-catch tier + Dread weights; rods are meta-only) ---------

const SLOT_BASE: Record<Slot, number> = {
  line: 1.4,
  lure: 1.6,
  trinket: 1.0,
  bait: 1.8,
  consumable: 1.2,
};

export function slotWeights(ctx: RollCtx): Record<Slot, number> {
  const w = { ...SLOT_BASE };
  if (ctx.dreadTier >= 3) {
    w.trinket *= 1.6;
    w.lure *= 1.2;
    w.line *= 1.1;
    w.bait *= 0.7;
  }
  if (ctx.qualityBonus >= 1) w.trinket *= 1.4;
  if (ctx.qualityBonus <= -1) w.trinket *= 0.6;
  return w;
}

export function rollSlot(rng: Rng, ctx: RollCtx): Slot {
  const w = slotWeights(ctx);
  const total = (Object.keys(w) as Slot[]).reduce((s, k) => s + w[k], 0);
  let r = rng.nextFloat() * total;
  for (const k of Object.keys(w) as Slot[]) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'consumable';
}

// Drop chance per landed catch — grows with the catch's tier and Dread (higher
// pressure → better odds). Clean catches get a quality bonus bump.
export function dropChance(ctx: RollCtx): number {
  const tier = clamp(Math.floor(ctx.catchTier), 1, 5);
  return Math.min(1, 0.2 + tier * 0.05 + ctx.dreadTier * 0.04 + (ctx.qualityBonus >= 1 ? 0.08 : 0));
}

// --- the affix roller (plan §7.3) ------------------------------------------------

// One prefix + one suffix, each weighted by the trinket's rarity (higher
// rarity favours the stronger entries). Effects accumulate from both affixes —
// a "Damp of Held Water" is stamina regen + brace.
export function rollAffixedTrinket(rng: Rng, rarity: Rarity): SundryItem {
  const prefix = weightedAffix(rng, PREFIXES, rarity);
  const suffix = weightedAffix(rng, SUFFIXES, rarity);
  return {
    id: `trinket-${(rng.nextU32() >>> 0).toString(36)}`,
    name: `${prefix.name} ${suffix.name}`,
    rarity,
    slot: 'trinket',
    prefix: prefix.key,
    suffix: suffix.key,
    effects: [
      { key: prefix.effect, value: prefix.value },
      { key: suffix.effect, value: suffix.value },
    ],
  };
}

function weightedAffix(rng: Rng, pool: AffixDef[], rarity: Rarity): AffixDef {
  const mult = RARITY_AFFIX_MULT[rarity];
  const total = pool.reduce((s, a) => s + a.weight * mult, 0);
  let r = rng.nextFloat() * total;
  for (const a of pool) {
    r -= a.weight * mult;
    if (r <= 0) return a;
  }
  return pool[pool.length - 1]!;
}

// A non-trinket slot drop: a named, inert sundry (lines/lures/bait/consumables
// from the plan §7.2 pools — rolled and collected, effects wired later).
export function rollInertItem(rng: Rng, rarity: Rarity, slot: Exclude<Slot, 'trinket'>): SundryItem {
  const pool = SLOT_POOLS[slot];
  const name = pool[Math.min(pool.length - 1, RARITY_RANK[rarity])]!;
  return {
    id: `sundry-${(rng.nextU32() >>> 0).toString(36)}`,
    name,
    rarity,
    slot,
    effects: [],
  };
}

// A Drowned-tier drop (plan §7.3 "Drowned rolls a named unique instead of
// affixes"): one named unique from the §7.2 pool, its gimmick id carried as an
// unwired effect (collected, silent until its hook registry exists). Seeded over
// the passed stream — same seed → same unique.
export function rollDrownedUnique(rng: Rng): SundryItem {
  const def = DROWNED_UNIQUES[Math.floor(rng.nextFloat() * DROWNED_UNIQUES.length)]!;
  return {
    id: `drowned-${(rng.nextU32() >>> 0).toString(36)}`,
    name: def.name,
    rarity: 'Drowned',
    slot: def.slot,
    effects: [{ key: def.key, value: 0 }],
  };
}

// A NAMED story unique (05 §2.3 — the Echo's Scale). Not a draw: a boss whose
// whole design is "guaranteed clean catch" cannot pay out a random trinket, and
// a story trophy must never be reachable from an ordinary Drowned roll either —
// so it is not in DROWNED_UNIQUES (the random pool) at all. What it DOES reuse
// is the pipeline: the same SundryItem shape, the same 'Drowned' rarity, the
// same unwired-gimmick effect convention, so the receipt, the box, the save and
// the rig-up screen all read it as exactly what it is — a Drowned-tier item.
export interface NamedUniqueDef {
  id: string; // stable item id — a story item is the same item every time
  key: string; // gimmick id (unwired hook), like every other Drowned unique
  name: string;
  slot: Slot;
}

export function namedDrownedUnique(def: NamedUniqueDef): SundryItem {
  return {
    id: def.id,
    name: def.name,
    rarity: 'Drowned',
    slot: def.slot,
    effects: [{ key: def.key, value: 0 }],
  };
}

// The full landed-catch drop: roll the slot, then rarity, then the item. Returns
// null when nothing surfaces ("the boat recovers nothing but the line"). A
// Drowned rarity short-circuits the slot roll — it drops a named unique.
export function rollCatchDrop(rng: Rng, ctx: RollCtx): SundryItem | null {
  if (!rng.chance(dropChance(ctx))) return null;
  const rarity = rollRarity(rng, ctx);
  if (rarity === 'Drowned') return rollDrownedUnique(rng);
  const slot = rollSlot(rng, ctx);
  if (slot === 'trinket') return rollAffixedTrinket(rng, rarity);
  return rollInertItem(rng, rarity, slot);
}

// A guaranteed drop with a rarity FLOOR — the boat-tier loot of a landed Dragger
// (plan 03 §6.1: "guaranteed Rare+"). Same ladder, same slot roll; the rarity is
// simply lifted to `minRarity` when the draw comes in under it, and the
// drop-chance gate is skipped (a Dragger always pays).
export function rollGuaranteedDrop(rng: Rng, ctx: RollCtx, minRarity: Rarity = 'R'): SundryItem {
  const rolled = rollRarity(rng, ctx);
  const rarity: Rarity =
    RARITY_RANK[rolled] < RARITY_RANK[minRarity] ? minRarity : rolled;
  if (rarity === 'Drowned') return rollDrownedUnique(rng);
  const slot = rollSlot(rng, ctx);
  if (slot === 'trinket') return rollAffixedTrinket(rng, rarity);
  return rollInertItem(rng, rarity, slot);
}
