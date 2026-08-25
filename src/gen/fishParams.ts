// FISHPARAMS (gen) — M4 round 1 pure generator (plan 04 §3, plan.md §8.2).
// FishParams = one parameter struct every creature is built from: a lathed
// capsule spine + fins/eyes + per-species stats + swim profile. A species is a
// named preset anchor + seeded jitter (rarity = wider jitter); the wrongness
// curve w(zone) biases fin-parity / limbBudget / humanRatio / jawSplit with
// zone depth (zone 1 = mild = identity).
//
// Everything here is pure over the passed PCG32 `Rng` — same seed + same
// species + same zone → identical FishParams (spec 8.3, plan 04 §2 "seeded and
// deterministic"). The `'loot'` stream feeds the draws at SET.
//
// Pure logic: no `three` imports.

import type { Rng } from '../core/rng';

export type Rarity = 'C' | 'U' | 'R' | 'E' | 'Boss';
export type Category = 'catch' | 'crawler' | 'caller' | 'snatcher' | 'dragger' | 'bagman' | 'boss';
export type FinKind = 'dorsal' | 'pectoral' | 'caudal' | 'ventral' | 'ridge';
export type Attachment = 'bottle' | 'bell' | 'strongbox';

// at = param along the spine 0..1 (0 = tail, 1 = head); the renderer chooses
// the outward axis from `kind`.
export interface FinPlacement {
  at: number;
  kind: FinKind;
  scale: number;
}

export interface Banding {
  colorIdx: number; // index into the palette's band colours
  period: number; // fraction of the spine per band (rungfish 0.2, collar ~0.45)
}

export interface PatternWeights {
  orbit: number;
  lunge: number;
  dive: number;
  drag: number;
}

export interface FishParams {
  speciesId: string;
  name: string;
  rarity: Rarity;
  eligibility: number; // License grade required to bite (1..3 in the Shallows)
  category: Category;

  // rig
  spineSegments: number; // 6..14
  spineLengths: number[]; // world units per segment; sum = totalLength
  girthCurve: number[]; // radius factor per segment 0..1 (lathed profile)
  finCount: number; // 2..9; odd counts read as "wrong"
  finPlacement: FinPlacement[]; // length === finCount
  eyeCount: number; // 0..3; 2 is normal, anything else is the joke
  eyeSize: number; // 0..1 relative to the head ring radius
  jawSplit: number; // 0 = fish mouth … 1 = it can smile
  limbBudget: number; // 0 (surface) … 4 (Township "those are arms")
  humanRatio: number; // 0..1: proportions ease toward human ulna/femur ratios
  palette: number; // index into the zone palette registry (render/fishMesh)
  banding?: Banding;
  glow?: boolean; // biolum — additive MeshBasicMaterial pass
  attachment?: Attachment;

  // animation
  swimFreq: number; // rad/s
  swimAmp: number; // radians of lateral wave

  // combat stats (04 §3.1 FishStats) — consumed by the tether fight
  mass: number; // tether mass ratio vs player (=1)
  stamina: number; // exhaustion pool ceiling
  pullForce: number; // lunge impulse strength
  swimSpeed: number; // max lunge speed m/s
  hp: number;
  tier: number; // loot tier 1..5 (C1 U2 R3 E4 Boss5)
  totalLength: number; // sum(spineLengths) m
  weightKg: number; // ~ k·totalLength³ (receipt weight)

  // behaviour hints (04 §4: weights straight into the tether FSM patterns)
  patterns: PatternWeights;
  wrongnessInfluence: number; // 0.4..0.9 — how hard the zone curve pulls this species
  lungeCooldown: number;
  lungeStaminaCost: number;
  dragSpeed: number;
  dragStaminaCostPerM: number;
  routedDrag: boolean; // bosses + deliberate species drag toward hazards
}

// The anchored preset a species is rolled from. `data/species.ts` holds the
// concrete records; the generator jitters these and applies the wrongness curve.
export interface SpeciesBase {
  id: string;
  name: string;
  rarity: Rarity;
  eligibility: number;
  category: Category;
  tier: number;
  lengthM: number; // target total length (m) — jittered ±8%
  spineSegments: number; // 6..14
  girthCurve: number[]; // radius factors, length === spineSegments
  finCount: number; // 2..9
  finKinds: FinKind[]; // non-caudal fin kinds, cycled to fill finCount-1
  eyeCount: number;
  eyeSize: number;
  jawSplit: number;
  limbBudget: number;
  humanRatio: number;
  swimFreq: number;
  swimAmp: number;
  palette: number;
  banding?: Banding;
  glow?: boolean;
  attachment?: Attachment;
  stats: { mass: number; stamina: number; pullForce: number; swimSpeed: number; hp: number };
  patterns: PatternWeights;
  wrongnessInfluence: number;
  lungeCooldown?: number;
  lungeStaminaCost?: number;
  dragSpeed?: number;
  dragStaminaCostPerM?: number;
  routedDrag?: boolean;
}

// Rarity widens the jitter window (plan 04 §3.5: ×1 / ×1.6 / ×2.2 / ×3 / ×4).
export const RARITY_JITTER_MULT: Record<Rarity, number> = {
  C: 1,
  U: 1.6,
  R: 2.2,
  E: 3,
  Boss: 1,
};

// w(z) = clamp((zone − 1) / 4, 0, 1) — z1 Shallows 0 … z5 Mouth 1 (04 §3.5).
export function wrongnessForZone(zone: number): number {
  return Math.min(1, Math.max(0, (zone - 1) / 4));
}

// weightKg ≈ k·totalLength³ with k tuned so Shallows catches weigh ~2–5 kg.
const WEIGHT_K = 0.85;

export function weightFromLength(totalLength: number): number {
  return Math.round(WEIGHT_K * totalLength * totalLength * totalLength * 10) / 10;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// unit jitter in [-1, 1] scaled by amount × rarity multiplier
function jitter(rng: Rng, amount: number, mult: number): number {
  return (rng.nextFloat() * 2 - 1) * amount * mult;
}

function jitterInt(rng: Rng, amount: number, mult: number): number {
  return Math.round(jitter(rng, amount, mult));
}

// Nearest-neighbour resample so girthCurve always matches a jittered
// spineSegments count.
function resample(arr: number[], n: number): number[] {
  if (arr.length === n) return arr.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (arr.length - 1);
    const i0 = Math.floor(t);
    const i1 = Math.min(arr.length - 1, i0 + 1);
    const f = t - i0;
    out.push(arr[i0]! * (1 - f) + arr[i1]! * f);
  }
  return out;
}

// The fish-normal baseline (makeParams / createFish fallback). Matches the M1
// capsule feel: 8 segments, 3 fins, 2 eyes, small jaw, no limbs.
export function makeParams(): FishParams {
  return {
    speciesId: 'capsule',
    name: 'Capsule',
    rarity: 'C',
    eligibility: 1,
    category: 'catch',
    spineSegments: 8,
    spineLengths: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    girthCurve: [0.5, 0.6, 0.65, 0.6, 0.5, 0.45, 0.4, 0.35],
    finCount: 3,
    finPlacement: [
      { at: 0, kind: 'caudal', scale: 1 },
      { at: 0.35, kind: 'dorsal', scale: 1 },
      { at: 0.22, kind: 'pectoral', scale: 0.8 },
    ],
    eyeCount: 2,
    eyeSize: 0.22,
    jawSplit: 0.1,
    limbBudget: 0,
    humanRatio: 0,
    swimFreq: 6,
    swimAmp: 0.55,
    palette: 0,
    mass: 1.5,
    stamina: 100,
    pullForce: 4,
    swimSpeed: 6,
    hp: 100,
    tier: 1,
    totalLength: 4,
    weightKg: weightFromLength(4),
    patterns: { orbit: 0.4, lunge: 0.3, dive: 0.2, drag: 0.1 },
    wrongnessInfluence: 0.5,
    lungeCooldown: 3,
    lungeStaminaCost: 20,
    dragSpeed: 4,
    dragStaminaCostPerM: 2,
    routedDrag: true,
  };
}

function buildSpineLengths(
  base: SpeciesBase,
  rng: Rng,
  mult: number,
  segs: number,
): { lengths: number[]; total: number } {
  const segLen = base.lengthM / segs;
  const raw: number[] = [];
  for (let i = 0; i < segs; i++) raw.push(segLen * (1 + jitter(rng, 0.06, mult)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const lengths = raw.map((l) => (l * base.lengthM) / sum);
  const total = lengths.reduce((a, b) => a + b, 0);
  return { lengths, total };
}

function buildFinPlacement(base: SpeciesBase, rng: Rng, mult: number, finCount: number): FinPlacement[] {
  const out: FinPlacement[] = [{ at: 0, kind: 'caudal', scale: 0.85 + jitter(rng, 0.15, mult) }];
  const extra = finCount - 1;
  if (extra <= 0) return out;
  const kinds = base.finKinds.length > 0 ? base.finKinds : (['dorsal'] as FinKind[]);
  for (let i = 0; i < extra; i++) {
    const kind = kinds[Math.min(i, kinds.length - 1)]!;
    const span = extra > 1 ? i / (extra - 1) : 0.5;
    const at = clamp(0.16 + span * 0.52 + jitter(rng, 0.05, mult), 0.08, 0.82);
    out.push({ at, kind, scale: 0.85 + jitter(rng, 0.2, mult) });
  }
  return out;
}

// Zone-depth biasing (04 §3.5), applied AFTER the species jitter. Zone 1 (w=0)
// is the identity — the Shallows keep their clean presets.
function applyWrongness(p: FishParams, base: SpeciesBase, rng: Rng, zone: number): void {
  const w = wrongnessForZone(zone);
  if (w <= 0) return;
  const inf = base.wrongnessInfluence;

  // fin parity: +15%/unit w chance to round up to odd; always odd at w ≥ 0.75
  if (w >= 0.75) {
    if (p.finCount % 2 === 0) p.finCount = Math.min(9, p.finCount + 1);
  } else if (rng.chance(0.15 * w)) {
    if (p.finCount % 2 === 0) p.finCount = Math.min(9, p.finCount + 1);
  }

  // limb budget: mean = floor(w·4), ±1 jitter (capped 4)
  const limbMean = Math.floor(w * 4);
  p.limbBudget = clamp(Math.round(lerp(p.limbBudget, limbMean, inf * w)) + rng.int(-1, 1), 0, 4);

  // human ratio: lerp 0 → 1, ±0.15
  p.humanRatio = clamp(lerp(p.humanRatio, w, inf * w) + jitter(rng, 0.15, 1), 0, 1);

  // jaw split: 0.15 + w·0.7, pulled by the species' wrongnessInfluence
  const jawBias = 0.15 + w * 0.7;
  p.jawSplit = clamp(lerp(p.jawSplit, jawBias, inf * w), 0, 1);
}

export interface GenerateOptions {
  zone?: number; // 1..5 wrongness depth (Shallows = 1)
  rarity?: Rarity; // override the preset rarity → its jitter window
}

// species preset → jittered, zone-biased FishParams. Deterministic per rng.
export function generateFishParams(
  base: SpeciesBase,
  rng: Rng,
  opts: GenerateOptions = {},
): FishParams {
  const mult = RARITY_JITTER_MULT[opts.rarity ?? base.rarity];
  const zone = opts.zone ?? 1;

  const spineSegments = clamp(base.spineSegments + jitterInt(rng, 2, mult), 6, 14);
  const finCount = clamp(base.finCount + jitterInt(rng, 1, mult), 2, 9);
  const eyeCount = clamp(base.eyeCount + jitterInt(rng, 1, mult), 0, 3);
  const limbBudget = clamp(base.limbBudget + jitterInt(rng, 1, mult), 0, 4);

  // mutable fields wrongness may push past the jittered anchor
  const p: FishParams = {
    speciesId: base.id,
    name: base.name,
    rarity: opts.rarity ?? base.rarity,
    eligibility: base.eligibility,
    category: base.category,
    spineSegments,
    spineLengths: [],
    girthCurve: [],
    finCount,
    finPlacement: [],
    eyeCount,
    eyeSize: clamp(base.eyeSize + jitter(rng, 0.04, mult), 0.05, 0.6),
    jawSplit: clamp(base.jawSplit + jitter(rng, 0.08, mult), 0, 1),
    limbBudget,
    humanRatio: clamp(base.humanRatio + jitter(rng, 0.08, mult), 0, 1),
    swimFreq: Math.max(0.5, base.swimFreq + jitter(rng, 0.35, mult)),
    swimAmp: clamp(base.swimAmp + jitter(rng, 0.07, mult), 0.12, 1.4),
    palette: base.palette,
    ...(base.banding ? { banding: base.banding } : {}),
    ...(base.glow ? { glow: true } : {}),
    ...(base.attachment ? { attachment: base.attachment } : {}),
    mass: Math.max(0.3, base.stats.mass * (1 + jitter(rng, 0.06, mult))),
    stamina: Math.max(30, Math.round(base.stats.stamina * (1 + jitter(rng, 0.06, mult)))),
    pullForce: Math.max(1.5, base.stats.pullForce * (1 + jitter(rng, 0.06, mult))),
    swimSpeed: Math.max(2, base.stats.swimSpeed * (1 + jitter(rng, 0.06, mult))),
    hp: Math.max(20, Math.round(base.stats.hp * (1 + jitter(rng, 0.06, mult)))),
    tier: base.tier,
    totalLength: 0,
    weightKg: 0,
    patterns: { ...base.patterns },
    wrongnessInfluence: base.wrongnessInfluence,
    lungeCooldown: base.lungeCooldown ?? 3,
    lungeStaminaCost: base.lungeStaminaCost ?? 20,
    dragSpeed: base.dragSpeed ?? 4,
    dragStaminaCostPerM: base.dragStaminaCostPerM ?? 2,
    routedDrag: base.routedDrag ?? true,
  };

  applyWrongness(p, base, rng, zone);

  p.girthCurve = resample(base.girthCurve, p.spineSegments).map((g) =>
    clamp(g * (1 + jitter(rng, 0.08, mult)), 0.1, 1),
  );
  const { lengths, total } = buildSpineLengths(base, rng, mult, p.spineSegments);
  p.spineLengths = lengths;
  p.totalLength = Math.round(total * 100) / 100;
  p.weightKg = weightFromLength(p.totalLength);

  // finPlacement is generated LAST so it always matches the final finCount.
  p.finPlacement = buildFinPlacement(base, rng, mult, p.finCount);

  return p;
}