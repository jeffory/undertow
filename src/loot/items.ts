// ITEMS (loot) — plan 04 §7.2/§7.3 data: the trinket prefix/suffix affix pools,
// the inert line/lure/bait/consumable name pools, and the Drowned named uniques.
// Logic (rarity ladder, slot roll, affix rolls, the Drowned roll) lives in
// roller.ts; effects application in runStart.ts.
//
// Affix pools (plan §7.2 §6.4): prefixes Barnacled (+HP), Punctual (+reelRate),
// Spiteful (+gaff), Damp (stamina regen), Municipal (+Memories on extraction);
// suffixes of the Spillway (dodge), of Held Water (brace +25%), of the
// Congregation (Callers give loot), of Morning (breath +6s).
//
// Only the five effects a system exists for are wired in applyTrinkets: hp,
// staminaRegen, memories, brace, breath. The others (reel / gaff / dodge /
// congregation) are rolled and displayed but are deliberate no-ops until their
// owning systems exist — "wire ONLY where systems exist".
//
// Pure data + types: no `three` imports.

export const RARITIES = ['C', 'U', 'R', 'E', 'Drowned'] as const;
export type Rarity = (typeof RARITIES)[number];

export const SLOTS = ['trinket', 'line', 'lure', 'bait', 'consumable'] as const;
export type Slot = (typeof SLOTS)[number];

export interface ItemEffect {
  key: string; // 'hp' | 'staminaRegen' | 'memories' | 'brace' | 'breath' | unwired gimmicks
  value: number;
}

export interface SundryItem {
  id: string;
  name: string;
  rarity: Rarity;
  slot: Slot;
  prefix?: string; // affix keys (trinkets only)
  suffix?: string;
  effects: ItemEffect[];
}

// --- affix pools (rarity-weighted in roller.ts) --------------------------------

export interface AffixDef {
  key: string;
  name: string;
  effect: string; // ItemEffect.key
  value: number;
  weight: number; // base pick weight; scaled by RARITY_AFFIX_MULT at roll time
}

export const PREFIXES: AffixDef[] = [
  { key: 'barnacled', name: 'Barnacled', effect: 'hp', value: 15, weight: 5 },
  { key: 'damp', name: 'Damp', effect: 'staminaRegen', value: 8, weight: 4 },
  { key: 'municipal', name: 'Municipal', effect: 'memories', value: 0.05, weight: 3 },
  { key: 'punctual', name: 'Punctual', effect: 'reel', value: 0, weight: 3 },
  { key: 'spiteful', name: 'Spiteful', effect: 'gaff', value: 0, weight: 2 },
];

export const SUFFIXES: AffixDef[] = [
  { key: 'held-water', name: 'of Held Water', effect: 'brace', value: 0.25, weight: 4 },
  { key: 'morning', name: 'of Morning', effect: 'breath', value: 6, weight: 4 },
  { key: 'spillway', name: 'of the Spillway', effect: 'dodge', value: 0, weight: 3 },
  { key: 'congregation', name: 'of the Congregation', effect: 'congregation', value: 0, weight: 2 },
];

// Higher rarities favour the stronger affixes (plan §7.3 "rarity-weighted,
// higher rarity favours stronger entries"). Drowned never rolls affixes — a
// Drowned tier drops a named unique instead — so its mult is a 0 placeholder.
export const RARITY_AFFIX_MULT: Record<Rarity, number> = { C: 1, U: 1.3, R: 1.7, E: 2.2, Drowned: 0 };

// --- inert slot pools (non-trinket sundries — rolled, no wired effects yet) ----

export const LINE_POOL = ['Waxed Linen', 'Braided Sinew', 'Bellwire'];
export const LURE_POOL = ['Chum Knot', 'Lantern Grub', 'Wailing Spoon', 'Leaded Prayer', 'Sounding Bell'];
export const BAIT_POOL = ['Damp Grain', 'Brine Shrimp', 'Office Biscuit'];
export const CONSUMABLE_POOL = ['Bottled Light', 'Smoked Herring', 'Tincture of Bravado'];

export const SLOT_POOLS: Record<Exclude<Slot, 'trinket'>, string[]> = {
  line: LINE_POOL,
  lure: LURE_POOL,
  bait: BAIT_POOL,
  consumable: CONSUMABLE_POOL,
};

// rarity rank → pool index (better rarities pull from the deeper end of a pool)
export const RARITY_RANK: Record<Rarity, number> = { C: 0, U: 1, R: 2, E: 3, Drowned: 3 };

// --- Drowned uniques (plan §7.2/§7.3) -------------------------------------------
//
// "Drowned rolls a named unique instead of affixes." A Drowned-tier catch drop
// draws one named unique from this pool (the §7.2 uniques — Founder's Barometer,
// Dam Key Spare, the Hymnal, the Wedding Band — plus the §6.2/6.3 Drowned tackle:
// Widow's Hair, the Baby Shoe, Maren's Thimble). Each carries its gimmick id as
// an unwired effect (collected, silent until its hook registry exists — same
// convention as the unwired trinket affixes). Drowned weight is 0 below license
// grade 6 (§8.2 G6), so these only surface on a grade-6+ ladder.
export interface DrownedUniqueDef {
  key: string; // gimmick id (unwired hook)
  name: string;
  slot: Slot;
}

export const DROWNED_UNIQUES: DrownedUniqueDef[] = [
  { key: 'founders_quality', name: "The Founder's Barometer", slot: 'trinket' },
  { key: 'dam_key_rescue', name: 'Dam Key Spare', slot: 'trinket' },
  { key: 'hymnal_dread_vent', name: 'The Hymnal (Waterlogged)', slot: 'trinket' },
  { key: 'wedding_band', name: 'Wedding Band (Yours)', slot: 'trinket' },
  { key: 'widows_hair', name: "Widow's Hair", slot: 'line' },
  { key: 'baby_shoe', name: 'The Baby Shoe', slot: 'lure' },
  { key: 'marens_thimble', name: "Maren's Thimble", slot: 'lure' },
];
