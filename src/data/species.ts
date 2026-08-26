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

// --- M6: THE KELP GRAVES (zone 2) ------------------------------------------------
// The four zone-2 story species (docs/story/kelp-graves.md §6) plus the zone's
// boss, THE CONGREGATION (plan 05 §2.1). These rows are deliberately NOT in
// TIER_TABLES: the disturbance tables are the Shallows' bite pool and widening
// them would change what a zone-1 (and a non-boss zone-2) ripple rolls. The
// kelp roster is drawn from directly — by the Congregation's landing burst
// (bosses/congregation.ts), which is the only producer of these ids this round.
export const KELP_SPECIES: SpeciesPreset[] = [
  {
    id: 'shroud-ribbon',
    name: 'Shroud-Ribbon',
    rarity: 'C',
    eligibility: 2,
    category: 'catch',
    tier: 1,
    lengthM: 1.6,
    spineSegments: 12,
    // a flat blade: shallow, even girth the whole length, tapering at both ends
    girthCurve: [0.12, 0.2, 0.28, 0.33, 0.35, 0.35, 0.34, 0.32, 0.29, 0.25, 0.2, 0.15],
    snout: 0.35,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.14,
    jawSplit: 0.1,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 3.4,
    swimAmp: 0.7,
    palette: 2,
    stats: { mass: 0.9, stamina: 80, pullForce: 3.4, swimSpeed: 6.5, hp: 70 },
    patterns: { orbit: 0.45, lunge: 0.2, dive: 0.3, drag: 0.05 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 2.4,
  },
  {
    id: 'net-choked-gudgeon',
    name: 'Net-Choked Gudgeon',
    rarity: 'U',
    eligibility: 2,
    category: 'snatcher',
    tier: 2,
    lengthM: 1.1,
    spineSegments: 8,
    girthCurve: [0.32, 0.55, 0.8, 0.95, 0.9, 0.72, 0.55, 0.42], // heavy-bellied
    snout: 0.3,
    finCount: 4,
    finKinds: [D(), P(), 'ridge'],
    eyeCount: 2,
    eyeSize: 0.22,
    jawSplit: 0.4,
    limbBudget: 0,
    humanRatio: 0.05,
    swimFreq: 2.4,
    swimAmp: 0.5,
    palette: 3,
    stats: { mass: 2.6, stamina: 130, pullForce: 4.6, swimSpeed: 5.4, hp: 160 },
    patterns: { orbit: 0.3, lunge: 0.3, dive: 0.1, drag: 0.3 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 2.9,
    routedDrag: true, // it wants the line in the weed (story: "it wants you to get in")
  },
  {
    id: 'cenotaph-perch',
    name: 'Cenotaph Perch',
    rarity: 'U',
    eligibility: 2,
    category: 'crawler',
    tier: 2,
    lengthM: 1.0,
    spineSegments: 7,
    girthCurve: [0.34, 0.6, 0.78, 0.82, 0.72, 0.55, 0.4], // blocky slate marker
    snout: 0.2,
    finCount: 4,
    finKinds: [D(), 'ridge'],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.25,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 2.0,
    swimAmp: 0.42,
    palette: 0,
    stats: { mass: 2.4, stamina: 120, pullForce: 5, swimSpeed: 4.8, hp: 150 },
    patterns: { orbit: 0.35, lunge: 0.45, dive: 0.1, drag: 0.1 },
    wrongnessInfluence: 0.55,
    lungeCooldown: 2.4,
  },
  {
    id: 'pew-shad',
    name: 'Pew-Shad',
    rarity: 'R',
    eligibility: 2,
    category: 'catch',
    tier: 3,
    lengthM: 1.15,
    spineSegments: 9,
    girthCurve: [0.22, 0.38, 0.55, 0.66, 0.68, 0.62, 0.52, 0.42, 0.32],
    snout: 0.45,
    finCount: 3,
    finKinds: [D(), P()],
    eyeCount: 2,
    eyeSize: 0.2,
    jawSplit: 0.15,
    limbBudget: 0,
    humanRatio: 0.1,
    swimFreq: 3,
    swimAmp: 0.5,
    palette: 1,
    stats: { mass: 1.6, stamina: 140, pullForce: 5.4, swimSpeed: 7.2, hp: 130 },
    patterns: { orbit: 0.5, lunge: 0.25, dive: 0.15, drag: 0.1 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 2.6,
  },
  {
    // THE CONGREGATION (plan 05 §2.1): "a school that fights as one mass on one
    // hook". This preset is the SWARM CENTRE — the single body the tether is
    // actually attached to. The 20-40 members that orbit it are instanced
    // render/sim state owned by bosses/congregation.ts, not fish rigs.
    id: 'the-congregation',
    name: 'The Congregation',
    rarity: 'Boss',
    eligibility: 1, // it does not ask to see your licence
    category: 'boss',
    tier: 5,
    lengthM: 2.6,
    spineSegments: 12,
    girthCurve: [0.24, 0.4, 0.56, 0.68, 0.76, 0.78, 0.76, 0.7, 0.62, 0.52, 0.42, 0.32],
    snout: 0.4,
    finCount: 6,
    finKinds: [D(), P(), 'ridge'],
    eyeCount: 3, // the wrong number, on purpose
    eyeSize: 0.16,
    jawSplit: 0.5,
    limbBudget: 1,
    humanRatio: 0.3, // forty-seven parishioners, averaged
    swimFreq: 1.8,
    swimAmp: 0.6,
    palette: 3,
    stats: { mass: 5.5, stamina: 300, pullForce: 7.2, swimSpeed: 6.2, hp: 600 },
    patterns: { orbit: 0.4, lunge: 0.3, dive: 0.1, drag: 0.2 },
    wrongnessInfluence: 0.75,
    lungeCooldown: 3,
    lungeStaminaCost: 18,
    dragSpeed: 3,
    dragStaminaCostPerM: 1.6,
    routedDrag: true,
  },
];

// --- M7: THE TOWNSHIP (zone 3) -----------------------------------------------------
// The drowned Hollow's second mouth (plan 05 §2.2, docs/story/township.md §6).
// Like the KELP rows these are deliberately NOT in TIER_TABLES: a Snatcher is
// never something a ripple rolls — it is spawned onto a LIVE FIGHT by the spawn
// director (systems/snatcher.ts), which is the only producer of this id.
export const TOWNSHIP_SPECIES: SpeciesPreset[] = [
  {
    // THE GALLOWS SNATCHER — "a lean, many-jointed jaw darting between
    // submerged chimney stacks". Eel-like on purpose: the longest spine the
    // generator allows, an even ribbon of girth the whole way down, a long
    // snout and the widest jaw split in the game — it is mostly mouth, which
    // is the entire point of the animal.
    id: 'gallows-snatcher',
    name: 'Gallows Snatcher',
    rarity: 'U',
    eligibility: 2,
    category: 'snatcher',
    tier: 2,
    lengthM: 3.4,
    spineSegments: 14,
    girthCurve: [
      0.1, 0.2, 0.3, 0.34, 0.33, 0.31, 0.3, 0.29, 0.28, 0.26, 0.23, 0.19, 0.15, 0.1,
    ],
    snout: 0.95, // all head and hinge
    finCount: 5, // odd, wrong
    finKinds: [D(), 'ridge'],
    eyeCount: 2,
    eyeSize: 0.12, // small eyes; it does not need to look at you
    jawSplit: 0.85, // the second mouth
    limbBudget: 1, // the "many-jointed" read the bestiary silhouette promises
    humanRatio: 0.2,
    swimFreq: 3.4, // fast, whipping — an eel closing on a hooked fish
    swimAmp: 0.85,
    palette: 2,
    stats: { mass: 2.6, stamina: 120, pullForce: 5.6, swimSpeed: 8.4, hp: 110 },
    patterns: { orbit: 0.3, lunge: 0.45, dive: 0.1, drag: 0.15 },
    wrongnessInfluence: 0.7,
    lungeCooldown: 2.2,
    lungeStaminaCost: 16,
    dragSpeed: 4.2,
    dragStaminaCostPerM: 2,
    routedDrag: false,
  },
  {
    // THE POSTMASTER (plan 05 §2.2) — "a tall, waterlogged figure in a
    // brass-buttoned coat, sorting parcels in the current". No new asset: the
    // long-coat read is bought entirely from the fish generator's own dials.
    //   • humanRatio 0.85 — the highest in the game; he is a man, mostly;
    //   • the girth curve holds a broad, FLAT, near-constant width through the
    //     middle — that is the coat, not a body — over a narrower base;
    //   • one bump near the HEAD end, standing proud of that flat line — the
    //     MAILBAG over the shoulder, which render/postmaster.ts stands on end so
    //     it reads as a tall dorsal hump on a figure rather than a fish's back;
    //   • snout 0.3 (a blunt human head under a cap), limbBudget 3 (the arms
    //     that are still sorting), palette 5 (the boss deep-dark, near-black).
    // He is a BOSS rarity, so RARITY_TONE deepens the dorsal another 28%.
    id: 'the-postmaster',
    name: 'The Postmaster',
    rarity: 'Boss',
    eligibility: 2,
    category: 'boss',
    tier: 5,
    lengthM: 2.9,
    spineSegments: 12,
    girthCurve: [0.26, 0.34, 0.4, 0.46, 0.62, 0.66, 0.66, 0.68, 0.86, 0.72, 0.52, 0.34],
    snout: 0.3,
    finCount: 4,
    finKinds: [D(), 'ridge'],
    eyeCount: 2,
    eyeSize: 0.18,
    jawSplit: 0.2, // he does not bite. He delivers.
    limbBudget: 3,
    humanRatio: 0.85,
    swimFreq: 1.1, // unhurried. He has thirty years of backlog and all night.
    swimAmp: 0.4,
    palette: 5,
    stats: { mass: 9, stamina: 400, pullForce: 8, swimSpeed: 6.5, hp: 900 },
    patterns: { orbit: 0.4, lunge: 0, dive: 0, drag: 0.6 },
    wrongnessInfluence: 0.6,
    lungeCooldown: 4,
    lungeStaminaCost: 20,
    dragSpeed: 3.2,
    dragStaminaCostPerM: 1.4,
    routedDrag: true,
  },
];

// --- M8: THE CHOIR (zone 4) ---------------------------------------------------------
// The bioluminescent void's roaming elite (plan 05 §2.3). Like the KELP and
// TOWNSHIP rows this is deliberately NOT in TIER_TABLES: a Whistler is never
// something a ripple rolls — systems/whistler.ts is the only producer of this id,
// and it produces at most one per run.
export const CHOIR_SPECIES: SpeciesPreset[] = [
  {
    // THE WHISTLER — "roaming elite that hooks YOU" (spec §5), heard long before
    // it is ever seen. No new asset: the read is bought from the generator's
    // dials, the same way the Snatcher's and the Postmaster's were.
    //   • the longest spine the generator allows (14) over a thin, even girth —
    //     a ribbon, not a body, so what the lantern catches at the strike is a
    //     length of something rather than an animal;
    //   • `glow: true` — the ONE preset in the game that carries it, because it
    //     is the only thing in the Choir that is lit from inside. In a zone whose
    //     entire look is emissive points on black, the elite has to be one;
    //   • snout 0.72 and jawSplit 0.55 — a long head with a hinge, not a mouth
    //     that has to open wide: it does not bite you, it puts a line on you;
    //   • eyeCount 0. It has never needed to look at anything. It listens.
    //   • humanRatio 0.35 — enough shoulder in the silhouette to be wrong.
    // Rarity E, so tier 4 — the "tier-4 elite" the plan asks for exactly, and
    // the rarity / eligibility / category the bible's own bestiary record files
    // it under (docs/story/choir.md §4: E, 3, 'dragger' — it drags, it does not
    // call).
    id: 'the-whistler',
    name: 'The Whistler',
    rarity: 'E',
    eligibility: 3,
    category: 'dragger',
    tier: 4,
    lengthM: 4.6,
    spineSegments: 14,
    girthCurve: [
      0.08, 0.15, 0.22, 0.24, 0.24, 0.23, 0.23, 0.22, 0.21, 0.2, 0.18, 0.15, 0.11, 0.07,
    ],
    snout: 0.72,
    finCount: 3, // almost nothing to see, and two of them are ridges
    finKinds: [D(), 'ridge'],
    eyeCount: 0,
    eyeSize: 0.05,
    jawSplit: 0.55,
    limbBudget: 2,
    humanRatio: 0.35,
    swimFreq: 2.1, // an unhurried whip — it is not chasing, it is arriving
    swimAmp: 0.7,
    palette: 4,
    glow: true,
    stats: { mass: 11, stamina: 260, pullForce: 9, swimSpeed: 9.5, hp: 420 },
    patterns: { orbit: 0.25, lunge: 0, dive: 0.1, drag: 0.65 },
    wrongnessInfluence: 0.85,
    lungeCooldown: 5,
    lungeStaminaCost: 22,
    dragSpeed: 4.8,
    dragStaminaCostPerM: 1.8,
    routedDrag: true,
  },
  {
    // MAREN'S ECHO — the M8 boss, plan 05 §2.3: "not her; the town's memory of
    // her, wearing the flood". The preset is the Postmaster's trick used for the
    // opposite purpose: the rig is STOOD UPRIGHT by the render side, so the
    // girth curve is read bottom-up as a figure — a small head, narrow
    // shoulders, and a hem of drenched linen widening into the dark.
    //
    // Every dial that could make her a monster is turned OFF, on purpose:
    //   • eyeCount 0 — "it has no eyes, only the reflection of the lantern room";
    //   • jawSplit 0 — the only preset in the game with no mouth at all. She has
    //     no verb to bite you with, in the data as well as in the code;
    //   • humanRatio 0.96 — the most human thing in the water, which is exactly
    //     what makes her unbearable;
    //   • swimFreq 0.55 — the slowest sway in the game. She is not swimming; she
    //     is standing in a current, mirroring the rise and fall of your
    //     shoulders (choir.md §5.2);
    //   • patterns — orbit 1, and a ZERO in every hostile column. There is no
    //     lunge weight to roll, no drag weight to roll. The FSM she would use is
    //     never even constructed (she is not world.fish), but the data says the
    //     same thing the code does.
    // Boss rarity, and therefore tier 5 like every other boss — the roster's own
    // ladder (tests/data/species.test.ts) is C1 U2 R3 E4 Boss5 and she is not an
    // exception to it. She IS landed, unlike the other three, and the receipt's
    // tier column tops out at 4 (Drowned) — so it is her CATCH RECORD that is
    // filed at the top of that ladder, in systems/marensEcho.ts, and not her.
    id: 'marens-echo',
    name: "Maren's Echo",
    rarity: 'Boss',
    eligibility: 3,
    category: 'boss',
    tier: 5,
    lengthM: 2.4,
    spineSegments: 12,
    // Read BOTTOM-UP, because the render side stands the rig on end (index 0 is
    // the tail, which the quarter-turn puts in the water): a broad hem of
    // drenched linen at the waterline, narrowing through the body to a small
    // bowed head at the top. The Postmaster's curve is the same trick with the
    // hump the other way up.
    girthCurve: [0.76, 0.74, 0.7, 0.66, 0.62, 0.58, 0.55, 0.52, 0.5, 0.44, 0.3, 0.15],
    snout: 0.08, // a face turned away, and nothing on it
    finCount: 2,
    finKinds: ['ridge'],
    eyeCount: 0,
    eyeSize: 0.05,
    jawSplit: 0, // she does not bite. She does not do anything.
    limbBudget: 2, // two arms, at her sides
    humanRatio: 0.96,
    swimFreq: 0.55,
    swimAmp: 0.34,
    palette: 6, // drowned linen — added for her (render/fishMesh.ts)
    // The second and last preset in the game to carry `glow`, and for the
    // opposite reason to the Whistler's. The Whistler is lit from inside because
    // it is a thing that hunts in the dark. She holds at EIGHTEEN METRES in a
    // zone whose lighting model is "geometry only where light touches" — past
    // the lantern's useful falloff, an unlit body is not a silhouette, it is
    // nothing at all, and the whole encounter is a silhouette you have to look
    // at. The additive pass (render/fishMesh.ts GLOW_MATERIAL, opacity 0.45 over
    // a near-white palette) reads as the lantern's own light remembered on wet
    // linen rather than as bioluminescence: cold, faint, and the only pale thing
    // in forty fathoms.
    glow: true,
    stats: { mass: 3.2, stamina: 100, pullForce: 0, swimSpeed: 0, hp: 100 },
    patterns: { orbit: 1, lunge: 0, dive: 0, drag: 0 },
    // The floor the roster allows. The zone-4 wrongness curve should barely move
    // her: every other species gets stranger the deeper you go, and she is the
    // one thing down there that is exactly what it looks like.
    wrongnessInfluence: 0.4,
    lungeCooldown: 0,
    lungeStaminaCost: 0,
    dragSpeed: 0,
    dragStaminaCostPerM: 0,
    routedDrag: false,
  },
];

export const WHISTLER_SPECIES_ID = 'the-whistler';

// 05 §2.3 — the Choir BOSS. Landed like a catch, which is the point of her.
export const MARENS_ECHO_SPECIES_ID = 'marens-echo';

export const SNATCHER_SPECIES_ID = 'gallows-snatcher';
export const POSTMASTER_SPECIES_ID = 'the-postmaster';

export const CONGREGATION_SPECIES_ID = 'the-congregation';

// The roster the Congregation's landing burst itemises (the boss itself is not
// one of its own accounts). Weights bias the shower toward the commons.
export const KELP_BURST_ROSTER: TierRow[] = [
  { id: 'shroud-ribbon', w: 5 },
  { id: 'cenotaph-perch', w: 3 },
  { id: 'net-choked-gudgeon', w: 3 },
  { id: 'pew-shad', w: 2 },
];

export const DRAGGER_SPECIES_ID = 'dragger';

export const ALL_SPECIES: SpeciesPreset[] = [
  ...SHALLOWS_SPECIES,
  ...BOSS_AND_BAGMAN,
  ...NIGHT_SPECIES,
  ...KELP_SPECIES,
  ...TOWNSHIP_SPECIES,
  ...CHOIR_SPECIES,
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
