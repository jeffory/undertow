// SPECIES DATA (data) — M4 round 1: the 12 Shallows species as concrete preset
// anchors (plan 04 §5, bestiary-shallows.md). ids/names/rarities match the
// bestiary records exactly (old-pike = boss, purse-minnow = bagman live beside
// the roster). Rarity ladder 4C / 3U / 4R / 1E, eligibility 1..3 (two Grade-3
// teases). The disturbance-tier tables pick which species a SET can roll from a
// ripple tier (1 = commons, 2 = uncommon/mid, 3 = rare/epic).
//
// Pure data + lookups: no `three` imports, no logic beyond the tier tables
// (the jitter/wrongness logic lives in gen/fishParams.ts).

import type { FinKind, SpeciesBase } from '../gen/fishParams';
import { canBite } from '../loot/license';

export interface SpeciesPreset extends SpeciesBase {
  lungeCooldown?: number;
  lungeStaminaCost?: number;
  dragSpeed?: number;
  dragStaminaCostPerM?: number;
  routedDrag?: boolean;
}

const D = (): FinKind => 'dorsal';
const P = (): FinKind => 'pectoral';

export const SHALLOWS_SPECIES: SpeciesPreset[] = [
  {
    id: 'silt-pikelet',
    name: 'Silt Pikelet',
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    tier: 1,
    lengthM: 1.2,
    spineSegments: 10,
    girthCurve: [0.16, 0.28, 0.42, 0.55, 0.62, 0.6, 0.54, 0.48, 0.42, 0.38], // slender pike, long taper
    snout: 0.9, // pointed pike snout
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.25,
    jawSplit: 0.15,
    limbBudget: 0,
    humanRatio: 0.05,
    swimFreq: 2.5,
    swimAmp: 0.55,
    palette: 0,
    stats: { mass: 1.4, stamina: 90, pullForce: 4.2, swimSpeed: 6, hp: 90 },
    patterns: { orbit: 0.35, lunge: 0.4, dive: 0.15, drag: 0.1 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 2.6,
  },
  {
    id: 'glass-minnow',
    name: 'Glass Minnow',
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    tier: 1,
    lengthM: 0.8,
    spineSegments: 8,
    girthCurve: [0.2, 0.3, 0.42, 0.48, 0.45, 0.4, 0.36, 0.32], // stubby minnow
    snout: 0.5,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.18,
    jawSplit: 0.1,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 3.2,
    swimAmp: 0.5,
    palette: 1,
    glow: true,
    stats: { mass: 0.6, stamina: 70, pullForce: 3.2, swimSpeed: 7.5, hp: 60 },
    patterns: { orbit: 0.4, lunge: 0.2, dive: 0.35, drag: 0.05 },
    wrongnessInfluence: 0.4,
    lungeCooldown: 2.2,
  },
  {
    id: 'toady-office',
    name: 'Toady of the Office',
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    tier: 1,
    lengthM: 1.0,
    spineSegments: 7,
    girthCurve: [0.3, 0.5, 0.75, 0.95, 1.0, 0.85, 0.62], // deep-bodied toad, fat mid
    snout: 0.15, // blunt head
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.3,
    jawSplit: 0.35,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.2,
    swimAmp: 0.5,
    palette: 0,
    banding: { colorIdx: 1, period: 0.45 }, // the collar
    stats: { mass: 2.2, stamina: 110, pullForce: 3.8, swimSpeed: 5, hp: 130 },
    patterns: { orbit: 0.4, lunge: 0.25, dive: 0.15, drag: 0.2 },
    wrongnessInfluence: 0.55,
    lungeCooldown: 3.2,
    routedDrag: true,
  },
  {
    id: 'damp-roller',
    name: 'Damp Roller',
    rarity: 'C',
    eligibility: 1,
    category: 'crawler',
    tier: 1,
    lengthM: 1.0,
    spineSegments: 6,
    girthCurve: [0.55, 0.7, 0.8, 0.8, 0.7, 0.6], // barrel, thick throughout
    snout: 0.25,
    finCount: 2,
    finKinds: [D()],
    eyeCount: 2,
    eyeSize: 0.26,
    jawSplit: 0.15,
    limbBudget: 2,
    humanRatio: 0.2,
    swimFreq: 1.8,
    swimAmp: 0.7,
    palette: 1, // olive-bronze mud-roller
    stats: { mass: 1.8, stamina: 120, pullForce: 4.0, swimSpeed: 4.5, hp: 120 },
    patterns: { orbit: 0.45, lunge: 0.25, dive: 0.1, drag: 0.2 },
    wrongnessInfluence: 0.9,
    lungeCooldown: 3.4,
  },
  {
    id: 'bottle-post',
    name: 'Bottle Post',
    rarity: 'U',
    eligibility: 1,
    category: 'catch',
    tier: 2,
    lengthM: 1.1,
    spineSegments: 8,
    girthCurve: [0.24, 0.38, 0.52, 0.58, 0.55, 0.5, 0.46, 0.42],
    snout: 0.6,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.2,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.6,
    swimAmp: 0.5,
    palette: 0,
    attachment: 'bottle',
    stats: { mass: 2.0, stamina: 100, pullForce: 4.5, swimSpeed: 5.5, hp: 110 },
    patterns: { orbit: 0.35, lunge: 0.25, dive: 0.15, drag: 0.25 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 3.0,
    routedDrag: true,
  },
  {
    id: 'rungfish',
    name: 'Rungfish',
    rarity: 'U',
    eligibility: 2,
    category: 'catch',
    tier: 2,
    lengthM: 1.1,
    spineSegments: 9,
    girthCurve: [0.22, 0.32, 0.45, 0.5, 0.5, 0.46, 0.42, 0.38, 0.34], // pale banded shad
    snout: 0.55,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.2,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.6,
    swimAmp: 0.5,
    palette: 2, // silver-blue ladder
    banding: { colorIdx: 0, period: 0.2 }, // ladder rungs
    stats: { mass: 1.7, stamina: 110, pullForce: 4.0, swimSpeed: 5.5, hp: 110 },
    patterns: { orbit: 0.4, lunge: 0.3, dive: 0.2, drag: 0.1 },
    wrongnessInfluence: 0.6,
  },
  {
    id: 'grave-shad',
    name: 'Grave Shad',
    rarity: 'U',
    eligibility: 2,
    category: 'catch',
    tier: 2,
    lengthM: 1.4,
    spineSegments: 12,
    girthCurve: [0.14, 0.2, 0.28, 0.36, 0.42, 0.44, 0.43, 0.4, 0.37, 0.34, 0.3, 0.26], // dark slender shad
    snout: 0.7,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.15,
    jawSplit: 0.3,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.0,
    swimAmp: 0.6,
    palette: 3,
    stats: { mass: 1.5, stamina: 130, pullForce: 4.8, swimSpeed: 6.5, hp: 140 },
    patterns: { orbit: 0.35, lunge: 0.2, dive: 0.35, drag: 0.1 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 3.4,
  },
  {
    id: 'hollow-shiner',
    name: 'Hollow Shiner',
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    tier: 3,
    lengthM: 0.9,
    spineSegments: 8,
    girthCurve: [0.22, 0.32, 0.45, 0.5, 0.48, 0.44, 0.4, 0.36], // silvery shiner
    snout: 0.45,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.22,
    jawSplit: 0.25,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.8,
    swimAmp: 0.6,
    palette: 2, // silver-blue, biolum
    glow: true,
    stats: { mass: 1.2, stamina: 95, pullForce: 3.6, swimSpeed: 7, hp: 80 },
    patterns: { orbit: 0.4, lunge: 0.35, dive: 0.2, drag: 0.05 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 2.4,
  },
  {
    id: 'spoonworm',
    name: 'Spoonworm',
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    tier: 3,
    lengthM: 1.9,
    spineSegments: 14,
    girthCurve: [0.12, 0.16, 0.2, 0.22, 0.22, 0.2, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12], // unnervingly long ribbon
    snout: 0.6,
    finCount: 2,
    finKinds: ['ridge'],
    eyeCount: 2,
    eyeSize: 0.25,
    jawSplit: 0.4,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 1.5,
    swimAmp: 1.1,
    palette: 3, // pale sickly — the rare+ pale variant
    stats: { mass: 2.4, stamina: 140, pullForce: 5.5, swimSpeed: 8, hp: 160 },
    patterns: { orbit: 0.3, lunge: 0.4, dive: 0.25, drag: 0.05 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 3.0,
  },
  {
    id: 'whetstone-bream',
    name: 'Whetstone Bream',
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    tier: 3,
    lengthM: 1.1,
    spineSegments: 7,
    girthCurve: [0.3, 0.45, 0.6, 0.65, 0.6, 0.5, 0.4], // flat silver blade
    snout: 0.6,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.45,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.4,
    swimAmp: 0.5,
    palette: 2, // metallic silver-blue
    stats: { mass: 1.6, stamina: 105, pullForce: 4.4, swimSpeed: 6, hp: 120 },
    patterns: { orbit: 0.4, lunge: 0.3, dive: 0.2, drag: 0.1 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 3.0,
  },
  {
    id: 'bell-carp',
    name: 'Bell Carp',
    rarity: 'R',
    eligibility: 3,
    category: 'catch',
    tier: 3,
    lengthM: 1.2,
    spineSegments: 8,
    girthCurve: [0.3, 0.55, 0.8, 0.95, 1.0, 0.9, 0.72, 0.55], // deep-bodied carp, blunt head
    snout: 0.2,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.2,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 1.6,
    swimAmp: 0.45,
    palette: 1, // olive-bronze
    attachment: 'bell',
    stats: { mass: 2.6, stamina: 130, pullForce: 4.6, swimSpeed: 4.8, hp: 150 },
    patterns: { orbit: 0.4, lunge: 0.2, dive: 0.1, drag: 0.3 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 3.6,
    routedDrag: true,
  },
  {
    id: 'marens-fox',
    name: "Maren's Fox",
    rarity: 'E',
    eligibility: 3,
    category: 'catch',
    tier: 4,
    lengthM: 1.3,
    spineSegments: 11,
    girthCurve: [0.2, 0.3, 0.4, 0.46, 0.48, 0.46, 0.42, 0.38, 0.34, 0.3, 0.26], // slim fox, fast
    snout: 0.6,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.28,
    jawSplit: 0.3,
    limbBudget: 0,
    humanRatio: 0.2,
    swimFreq: 4.0,
    swimAmp: 0.4,
    palette: 4,
    banding: { colorIdx: 0, period: 0.3 }, // the only red in the Shallows
    stats: { mass: 1.3, stamina: 90, pullForce: 5.2, swimSpeed: 9, hp: 100 },
    patterns: { orbit: 0.35, lunge: 0.4, dive: 0.15, drag: 0.1 },
    wrongnessInfluence: 0.7,
    lungeCooldown: 2.2,
    routedDrag: true,
  },
];

// The zone boss + the Bagman variant live beside the roster as special records
// (bestiary ids must resolve). Not in the disturbance tables for round 1.
export const BOSS_AND_BAGMAN: SpeciesPreset[] = [
  {
    id: 'old-pike',
    name: 'Old Pike',
    rarity: 'Boss',
    eligibility: 1,
    category: 'boss',
    tier: 5,
    lengthM: 3.5,
    spineSegments: 12,
    girthCurve: [0.2, 0.3, 0.4, 0.5, 0.55, 0.56, 0.54, 0.5, 0.46, 0.42, 0.38, 0.34], // massive scarred pike
    snout: 0.85,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.3,
    jawSplit: 0.2,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.0,
    swimAmp: 0.55,
    palette: 3,
    stats: { mass: 4.5, stamina: 220, pullForce: 6.5, swimSpeed: 7, hp: 400 },
    patterns: { orbit: 0.35, lunge: 0.45, dive: 0.15, drag: 0.05 },
    wrongnessInfluence: 0.4,
    lungeCooldown: 2.8,
    routedDrag: true,
  },
  {
    id: 'purse-minnow',
    name: 'Purse Minnow',
    rarity: 'U',
    eligibility: 1,
    category: 'bagman',
    tier: 2,
    lengthM: 0.7,
    spineSegments: 7,
    girthCurve: [0.2, 0.3, 0.42, 0.46, 0.42, 0.38, 0.34], // frantic small minnow
    snout: 0.5,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.2,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 3.0,
    swimAmp: 0.6,
    palette: 0,
    stats: { mass: 0.8, stamina: 80, pullForce: 3.0, swimSpeed: 6.5, hp: 50 },
    patterns: { orbit: 0.4, lunge: 0.25, dive: 0.2, drag: 0.15 },
    wrongnessInfluence: 0.4,
    lungeCooldown: 2.0,
  },
];

// The night boat-scale hostile (plan 03 §6, plan 04 §4 "Dragger" row): scale
// ×8-20 over a normal catch, finCount 5-9, dark palette, jawSplit 0.6, huge mass
// → huge yaw, and a slow heavy low-frequency wave (plan 04 §117 "Draggers get a
// slow, heavy, low-frequency wave"). It is never in the disturbance tier tables:
// the spawn director hooks it to the BOAT at night (03 §6.1), never to a ripple.
// Rarity E → tier 4, so landing one pays the Dread gain table's Epic rate (+12).
export const NIGHT_SPECIES: SpeciesPreset[] = [
  {
    id: 'dragger',
    name: 'Dragger',
    rarity: 'E',
    eligibility: 1, // it chooses you; the license never gates being hooked
    category: 'dragger',
    tier: 4,
    lengthM: 9,
    spineSegments: 14,
    girthCurve: [
      0.18, 0.3, 0.44, 0.58, 0.7, 0.78, 0.82, 0.82, 0.78, 0.7, 0.6, 0.5, 0.42, 0.34,
    ],
    snout: 0.35, // blunt, broad — a head built to take a gunwale off
    finCount: 7, // odd, wrong (plan 04: 5-9)
    finKinds: [D(), P(), 'ridge'],
    eyeCount: 2,
    eyeSize: 0.16, // small eyes on a very large animal
    jawSplit: 0.6, // plan 04's Dragger row, exactly
    limbBudget: 0,
    humanRatio: 0.1,
    swimFreq: 0.8, // slow, heavy, low-frequency
    swimAmp: 0.75,
    // Countershaded like a real deep-water animal: dark slate dorsal (the E
    // rarity tone deepens it another 20%), pale underside. Palette 5's near-black
    // belly would have made it a silhouette with no two-tone read at all.
    palette: 2,
    stats: { mass: 9, stamina: 340, pullForce: 8.5, swimSpeed: 5.2, hp: 520 },
    patterns: { orbit: 0.3, lunge: 0.35, dive: 0.1, drag: 0.25 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 3.2,
    lungeStaminaCost: 26,
    dragSpeed: 3.4,
    dragStaminaCostPerM: 2.5,
    routedDrag: true, // it yaws the boat toward hazards (plan 03 §6.1)
  },
];

export const DRAGGER_SPECIES_ID = 'dragger';

export const ALL_SPECIES: SpeciesPreset[] = [
  ...SHALLOWS_SPECIES,
  ...BOSS_AND_BAGMAN,
  ...NIGHT_SPECIES,
];

const BY_ID = new Map<string, SpeciesPreset>(ALL_SPECIES.map((s) => [s.id, s]));

export function speciesById(id: string): SpeciesPreset {
  const sp = BY_ID.get(id);
  if (!sp) throw new Error(`unknown species id '${id}'`);
  return sp;
}

// The receipt name: "one (1) purse minnow, damp". Unknown ids fall back to the
// id itself so a legacy 'capsule' record still renders.
export function speciesDisplayName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

// Disturbance-tier → weighted species pool (04 §5 / cast SET). Rarity of the
// ripple tier: 1 = commons + a Uncommon hint, 2 = the Uncommon middle with a
// Rare chance, 3 = the Rare/Epic top of the ladder.
export interface TierRow {
  id: string;
  w: number;
}

export const TIER_TABLES: Record<1 | 2 | 3, TierRow[]> = {
  1: [
    { id: 'silt-pikelet', w: 4 },
    { id: 'glass-minnow', w: 4 },
    { id: 'toady-office', w: 3 },
    { id: 'damp-roller', w: 2 },
    { id: 'bottle-post', w: 1 },
  ],
  2: [
    { id: 'bottle-post', w: 4 },
    { id: 'rungfish', w: 3 },
    { id: 'grave-shad', w: 3 },
    { id: 'hollow-shiner', w: 2 },
  ],
  3: [
    { id: 'hollow-shiner', w: 3 },
    { id: 'spoonworm', w: 3 },
    { id: 'whetstone-bream', w: 3 },
    { id: 'bell-carp', w: 2 },
    { id: 'marens-fox', w: 1 },
  ],
};

// Roll a species preset from a disturbance tier (seeded — deterministic).
export function rollSpeciesFromTier(rng: { nextFloat(): number }, tier: 1 | 2 | 3): SpeciesPreset {
  const table = TIER_TABLES[tier] ?? TIER_TABLES[1];
  const total = table.reduce((s, r) => s + r.w, 0);
  let r = rng.nextFloat() * total;
  for (const row of table) {
    r -= row.w;
    if (r <= 0) return speciesById(row.id);
  }
  return speciesById(table[table.length - 1]!.id);
}

// Bite-eligibility gate (plan 04 §8.4): resolve which species takes the hook
// WITHOUT ever selecting one whose eligibility exceeds the license grade — the
// filter runs before the weighted draw, so the roll normalises over the eligible
// rows only (same seed + same tier + same grade → same species). When the whole
// tier declines (nothing in it is license-eligible) it returns null: the
// disturbance stays present but does not respond to the cast.
export function rollEligibleSpeciesFromTier(
  rng: { nextFloat(): number },
  tier: 1 | 2 | 3,
  licenseGrade: number,
): SpeciesPreset | null {
  const table = TIER_TABLES[tier] ?? TIER_TABLES[1];
  const eligible = table.filter((row) => canBite(speciesById(row.id), licenseGrade));
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, r) => s + r.w, 0);
  let r = rng.nextFloat() * total;
  for (const row of eligible) {
    r -= row.w;
    if (r <= 0) return speciesById(row.id);
  }
  return speciesById(eligible[eligible.length - 1]!.id);
}
