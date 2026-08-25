# 04 — Fish & Loot (Milestone M4 "The Fish")

*Implementation plan for the procedural creature generator, enemy categories, bestiary, loot/affix roller, Keeper's License, and Office Contracts.*

**Owner slice:** FISH & LOOT (M4). Read against `plan.md` §4.4, §6, §8.2, M4 in §10.

---

## 1. Scope & ownership

**Owned here:**
- `FishParams` generator → Three.js mesh pipeline (shared geometry pool, per-instance skinning) per §8.2.
- CPU sine-spine animation + Crawler limb-wave reuse ("awful gait").
- Wrongness curve (zone-depth lerp), species presets + jitter, rarity = wider jitter.
- Enemy categories parameterized from one rig: Catches, Crawlers, Callers, Snatchers, Draggers, the Bagman + zone variants.
- 12 Shallows species as concrete preset data + eligibility tiers.
- Bestiary UI (unlock rules, pedestal render, Drowned-tier idle behaviours).
- Loot/affix roller: rarity ladder, trinket prefix/suffix pools, lines/lures/rods as data, Drowned uniques.
- Keeper's License meta-levelling (Tribute XP, Grades 1–7, bite-eligibility gating).
- Office Contracts (work orders, generation, rewards).

**NOT owned (interfaces only):** tether physics/combat states (§4.3, worker t2), procedural maps/spawns/Dread/night clock/boat combat (t3), Vite+Three scaffold & ECS-lite shapes (t1), hub town restoration (other). Where this slice touches those, only the data contracts are specified here.

---

## 2. Interfaces with other workers

| Who | What they give us | What we give them |
|---|---|---|
| **t1 foundation** | `System` signature, world access, `GameClock`/`dt`, seeded `RNG` (PCG32 stream `'loot'`), shared `MeshLambertMaterial` convention, scene lights (moon + lantern), perf instrumentation | `FishRig` build/skin API used by the M1 hardcoded fish; animation system conforming to the update order (slot: `animation`, before `render`) |
| **t2 tether** | per-frame `exhaustionRatio ∈ [0,1]` on the hooked fish entity (animator reads it to scale sine amplitude/freq + belly-tilt); reads our `FishStats` (mass/stamina/pullForce) for tension/lunge math; drag events for Bagman waterskiing | `FishStats` on every catch/crawler/dragger; swim profile fields (`burstSpeed`, lunge telegraph feel) consumed by tether AI states; Bagman `runSpeed` + sinkhole target vector for waterski drag impulses |
| **t3 run loop** | Dread value (rarity rolls), night clock phase (Auditor's Courier eligibility), sinkhole positions (Bagman chase target), spawn director call sites, extraction applies the Memories/XP formula, save-schema merge (IndexedDB) | `speciesForZone(zone, dreadTier, nightPhase, rng)` spawn table; `canBite(species, licenseGrade)` gate consulted at cast/SET; zone-depth + dread weights for disturbance tier; zod slices for license/bestiary/locked-items/contracts to merge into the run/save schema |
| **hub/town** | bestiary + license UI hosted in hub screens | bestiary entry state model + pedestal render component; license state + grade passive hooks; contract display component |

Key contract guarantees: everything this slice rolls/decides is **pure and seeded** — same seed + same inputs = same fish, same loot. No backend, no `extends`, no class hierarchies (§8.3).

---

## 3. FishParams & the rig (spec §8.2)

### 3.1 Data types (`src/fish/types.ts`)

```ts
export type FinKind = 'dorsal' | 'pectoral' | 'caudal' | 'ventral' | 'ridge';
export interface FinPlacement { at: number; kind: FinKind; scale: number } // at = param along spine 0..1

export interface FishParams {
  spineSegments: number;       // 6–14
  spineLengths: number[];      // world units per segment (sum = totalLength)
  girthCurve: number[];        // radius factor per segment, 0..1 → lathed capsule profile
  finCount: number;            // 2–9; odd counts read as "wrong"
  finPlacement: FinPlacement[]; // length === finCount
  eyeCount: number;            // 0–3; 2 is normal, anything else is the joke
  eyeSize: number;             // 0..1 relative to head ring radius
  jawSplit: number;            // 0 = fish mouth … 1 = it can smile
  limbBudget: number;          // 0 (surface) … 4 (Township "those are arms")
  humanRatio: number;          // 0..1: segment proportions ease toward human ulna/femur ratios
  swimFreq: number;            // rad/s
  swimAmp: number;             // radians of lateral wave
  palette: number;             // index into zone palette registry
  banding?: { colorIdx: number; period: number }; // stripes/rings (ladder scales, waistcoat band)
  glow?: boolean;              // biolum: rendered with a MeshBasicMaterial pass
  attachment?: 'bottle' | 'bell' | 'strongbox';   // child-object hook (Bottle Post, Bell Carp, Bagman)
}

// Combat-facing stats consumed by the tether worker (t2) and the loot roller.
export interface FishStats {
  mass: number;        // kg — drives tether mass-ratio pull (§4.3)
  stamina: number;     // exhaustion pool (tether drains it)
  pullForce: number;   // lunge impulse strength
  swimSpeed: number;   // base speed (m/s)
  tier: number;        // loot tier 1..5 (drives Dread gain & rarity weights)
  totalLength: number; // sum(spineLengths)
  weightKg: number;    // ~ k·totalLength³ → Memories/Tribute-XP formula input
}
```

Defaulting: `makeParams()` fills every field with a "fish-normal" baseline (spineSegments 8, finCount 3, eyeCount 2, jawSplit 0.1, limbBudget 0, humanRatio 0). Presets are partial overrides merged on top, then jitter, then wrongness-curve biasing.

### 3.2 Shared geometry pool (`src/fish/mesh.ts`)

One canonical template, max-sized so **every instance has identical topology** → exactly one draw call per fish, zero per-frame allocation:

- **Body tube:** `MAX_SEGMENTS = 14` rings × `R = 12` radial vertices + nose/tail cap rings. Lathed capsule: each ring's cross-section sits in the vertical plane (top-down fish), radius from interpolated `girthCurve`, giving a spindle that reads as fish from above and flat-shaded low-poly from any angle.
- **Parts preallocated in the same buffers** (collapsed to radius 0 when unused):
  - fins: `MAX_FINS = 9` quads (4 verts, 6 idx each) — thin triangular plates.
  - limbs: `MAX_LIMBS = 4` × 3-segment × 8-radial mini-tubes (fin-legs / arms).
  - eyes: `MAX_EYES = 3` tiny octahedra.
  - jaw: no extra topology — the head rings are split into upper/lower halves and displaced by `jawSplit` at skin time.
- **Pool:** a fixed array of `N = 64` slots, each with preallocated `Float32Array` position/color buffers + shared index, plus `acquire()/release()`. `FishSlotPool` is the §8.3 "one shared geometry pool"; the template's `segIndex`/`theta` attributes are static and shared.
- Per-instance `Mesh` + one shared `MeshLambertMaterial({ vertexColors: true })`. `glow` species get a second additive `MeshBasicMaterial` pass on the same geometry (cheap, same draw count).

Buffer layout per slot (fixed stride, unused ranges write zeros):
```
position: rings(16 × 12) ∪ fins(9 × 4) ∪ limbs(4 × 24) ∪ eyes(3 × 8)  verts
```

### 3.3 Skinning pipeline (CPU, per frame)

Runs in the `animation` system slot (before `render`). For each live fish:

1. **Spine pose** — integrate yaw along the spine:
   ```
   angle_i = sin(t·swimFreq + i·phaseOffset) · swimAmp · exhaustionScale
   ```
   `phaseOffset = 0.6·π` (travels head→tail). Accumulate segment positions and store a quaternion per segment. This is the §8.3 sine-spine exactly.
2. **Skin body** — each template vertex at `(segIndex i, theta θ)`:
   `pos = center_i + q_i · (radius_i(θ) cross-section offset)`. `exhaustionScale = 1 − exhaustionRatio·0.85`; when exhausted also scale `swimFreq·(1 − exhaustionRatio·0.6)` and add a slow roll term `roll = exhaustionRatio·0.5·sin(t·0.5)` — the **belly-tilt** exhaustion telegraph (§4.2), written on the top-down roll axis.
3. **Parts** — fins attach to their `finPlacement.at` segment anchor, oriented by `q_i`; eyes at the head ring, radius `eyeSize`, count `eyeCount`; limbs at ventral belly rings (spacing distributed by `limbBudget`).
4. **Vertex colors** — palette lookup + per-segment shading ramp; `banding` paints `segIndex % period` bands with `colorIdx` (ladder scales, waistcoat); `glow` marks the emissive pass.
5. `geometry.attributes.position.needsUpdate = true` (+ color), upload.

### 3.4 Animation: sine spine + Crawler gait (`src/fish/animate.ts`)

- **Swimming (all categories):** the §3.3 wave. Amplitude/frequency come from `FishParams.swimFreq/swimAmp`, scaled by exhaustion (above) and by the tether's fish-stamina model.
- **Crawler limb-wave ("awful gait"):** the *same* sine, evaluated in limb-local space: each limb bone gets `angle = sin(t·swimFreq + limbIndex·phase)·swimAmp`, alternating stance/swing — a wading-animal walk that is correctly wrong for a fish. The Catches' `humanRatio` eases limb segment length ratios toward ulna/femur proportions, so deeper Crawlers stop scuttling and start *striding* (limbBudget → 4 at Township).
- **Category anims:** Callers keep `swimFreq ≈ 0` with a jaw-oscillation "scream" (jawSplit lerps open + gill ring flare) triggered by their AI; Draggers get a slow, heavy, low-frequency wave; the Bagman's run is the crawler gait at high speed; the Drowned bestiary pedestal reuses the same anims for idle turn / face-camera / wave (see §6.3).

### 3.5 Wrongness curve (`src/fish/params.ts`)

```
wrongness w(z) = clamp((zoneIndex − 1) / 4, 0, 1)   // z1 Shallows 0 … z5 Mouth 1
```

Zone-depth lerp biases, applied after species jitter:

| Field | Bias as w → 1 |
|---|---|
| `finCount` | parity drifts odd: +15%/unit w chance to round up to odd; **always odd at w ≥ 0.75** |
| `limbBudget` | mean = `floor(w·4)`, ±1 jitter (capped 4) |
| `humanRatio` | lerp 0 → 1, ±0.15 |
| `jawSplit` | `0.15 + w·0.7`, ±0.2 |

**Species = named preset + jitter; rarity = wider jitter.** A species' `baseParams` is the anchor; individual catches sample jitter windows around it. The wrongness fields are pulled from the species anchor toward the zone bias by a per-species `wrongnessInfluence ∈ [0.4, 0.9]` (some species resist the curve — the "clean" ones keep odd fins off longer, which reads as precious/rare). Higher rarity multiplies the jitter window by `×1 / ×1.6 / ×2.2 / ×3 / ×4` for C/U/R/E/Drowned — a Rare at depth is *both* itself and deeply wrong. All draws use the seeded `'loot'` stream → deterministic per run.

Palettes per §8.1: registry of 4-color palettes per zone (near-black water base, bone/teal, sodium amber, biolum points, Mouth red); `palette` indexes it; `banding.colorIdx` indexes the same.

---

## 4. Enemy categories from one rig (§4.4)

Category = rig params overlay + behaviour component + stat scaling. Everything is the same `FishRig`; the category only changes params and which behaviours the AI/combat worker reads.

| Category | Rig deltas (over base preset) | Behaviour hook | Stats bias |
|---|---|---|---|
| **Catch** (tethered loot) | near-normal fish params, per-species | orbit/lunge/dive/drag patterns (owned by tether t2; we supply `swimProfile`) | mass/stamina by tier |
| **Crawler** (land ambush) | `limbBudget ≥ 2`, `humanRatio 0.4→1`, odd `finCount`, `jawSplit ≥ 0.5` | limb-wave walk (ours) + chase (combat AI) | fast, low stamina |
| **Caller** | `swimFreq 0`, `jawSplit 0.9` (open), stationary anchor | scream = jaw osc + gill flare (ours); raises Dread (t3) | fragile, priority tag |
| **Snatcher** | small, `finCount 3`, fast `swimFreq`, duplicated jaw set at mid-spine (`jawSetCount 2`) | second mouth steals hooked catch (t2 reads this) | fast, weak |
| **Dragger** (night boat-scale) | scale ×8–20, `finCount 5–9`, dark palette, `jawSplit 0.6` | hooks boat (t3 boat combat owns the fight) | huge mass → huge yaw |
| **Bagman** (+variants) | bloated `girthCurve` mid-bulge, `jawSplit 0.4`, `limbBudget 2`, waistcoat `banding`, `attachment:'strongbox'` | chase + waterski (§4.1 below) | runs, doesn't fight |

### 4.1 The Bagman chase (`src/fish/bagman.ts`)

- **Spawn:** ~6% per surface map (+Dread-tier bonus), with a **first-3-runs floor** for new saves (§13.5) — the spawn director (t3) owns the floor; we expose the weighted entry in `speciesForZone`.
- **Chase:** runs directly at the nearest sinkhole (positions from t3 map interface). Never engages — moves at `runSpeed` (Purse Minnow slow / standard mid / Courier fast).
- **Waterskiing drag:** if hooked, it keeps running; the tether's drag events (t2) fire continuously along the Bagman's heading vector and tow the player across the water surface. We publish `heading + runSpeed` as the drag target. Reach the sinkhole → gone with everything.
- **Loot:** Memories jackpot (5× normal) + guaranteed Rare, small Drowned chance (grade-6 gate applies).
- **Variants:**
  - **Purse Minnow** (Shallows): small, slow, low HP — teaches the chase.
  - **The Bagman** (standard).
  - **Auditor's Courier** (deep-night only, t3 night clock gate): carries an Epic, and *screams for help* — spawns pressure (Dread spike + spawn budget spent on answers). Bestiary line from §4.4.

### 4.2 Boss data hooks

One rig for bosses too — bosses are species entries with boss-grade stats + a behaviour flag (e.g. Old Pike = Catch params + lunge-heavy `swimProfile`). M4 ships the param presets; the fights are t2's.

---

## 5. 12 Shallows species (`src/fish/species.ts`)

Concrete preset data. `eligibility` = License grade required to bite (§8). Rarity C/U/R/E. Category notes where a species doubles as an ambush spawn.

| # | id | Name | Rarity | Elig | Cat | Param sketch | Bestiary one-liner slot |
|---|---|---|---|---|---|---|---|
| 1 | silt-pikelet | Silt Pikelet | C | 1 | catch | segs 10, girth `[.5,.6,.65,.6,.5,.45,.4,.35,.3,.2]`, fins 3, eyes 2·.25, jaw .15, limbs 0, hr .05, freq 2.5, amp .55, pal silt/teal | "All the fight of its legend, at one-tenth the paperwork." |
| 2 | glass-minnow | Glass Minnow | C | 1 | catch | segs 8, slender, fins 3, eyes 2·.18, jaw .1, freq 3.2, amp .5, pal biolum, glow | "None of them is alone. None of them will tell you how many they are." |
| 3 | toady-office | Toady of the Office | C | 1 | catch | segs 7, girth bulge `[.5,.85,1,.9,.6,.4,.3]`, eyes 2·.3 (judging), jaw .35, banding collar, freq 2.2 | "It swallows the forms it fails to file." |
| 4 | damp-roller | Damp Roller | C | 1 | **crawler** | segs 6, round barrel, fins 2, jaw .15, limbs 2, hr .2, freq 1.8, amp .7 | "A barrel that remembered how to be a fish, and resents it." |
| 5 | bottle-post | Bottle Post | U | 1 | catch | segs 8 moderate, fins 3, eyes 2·.2, jaw .2, `attachment:'bottle'`, freq 2.6 | "It has been carrying the same letter for thirty years. The Office says delivery is pending." |
| 6 | rungfish | Rungfish | U | 2 | catch | segs 9, banding ladder-rungs (period .2), fins 3, eyes 2·.2, jaw .2, pal bone/teal | "Its scales read like ladder rungs. Something at the bottom has been counting." |
| 7 | grave-shad | Grave Shad | U | 2 | catch | segs 12, slender dark, fins 3, eyes 2·.15, jaw .3, pal deep-dark, freq 2.0, amp .6 | "It schools through the drowned graveyard taking roll. It is never short a name." |
| 8 | hollow-shiner | Hollow Shiner | R | 2 | catch | segs 8, pal biolum strong, glow, eyes 2·.22, jaw .25, freq 2.8 | "The light in it does not come from it. It does not know what to do with the dark." |
| 9 | spoonworm | Spoonworm | R | 2 | catch | segs 14, low girth, fins 2 (long dorsal ridge), eyes 2·.25, jaw .4, freq 1.5, amp 1.1 | "Longer than it has any right to be. It is not using the extra length. It is holding it in reserve." |
| 10 | whetstone-bream | Whetstone Bream | R | 2 | catch | segs 7, flat-topped girth, fins 3, jaw .45 (grin), pal grey + top-ring edge highlight, freq 2.4 | "Sharp as a rumour, dull as a grievance. It bites only when asked, and the Office does not ask." |
| 11 | bell-carp | Bell Carp | R | 3 | catch | segs 8 fat, `attachment:'bell'`, fins 3, eyes 2·.2, jaw .2, freq 1.6, idle chime anim hook | "It rings when struck. It does not appear to mind. This is the part where you stop touching it." |
| 12 | marens-fox | Maren's Fox | E | 3 | catch | segs 11 slender, red banding (only red in Shallows), eyes 2·.28, jaw .3, hr .2, freq 4.0, amp .4, fast | "She kept one. It kept her. You are not to know this yet." |

Spread: 4 C / 3 U / 4 R / 1 E; eligibility 1–3 (two Grade-3 teases: see the silhouette, it declines your tackle — teaches the §6.6 gate). Enemy-type entries (Crawler/Caller/Snatcher/Dragger/Bagman presets, plus per-zone variants and bosses) are additional bestiary records parameterized per zone rather than per-species data.

---

## 6. Bestiary UI (`src/bestiary/`)

### 6.1 Entry state model (`bestiary.ts`)

```ts
export interface BestiaryEntryState {
  speciesId: string;
  seen: boolean;       // silhouette observed (disturbance spawned, not hooked)
  fought: boolean;     // hooked & entered the fight
  cleanCatch: boolean; // exhausted-and-landed (checkmark)
  willing: boolean;    // came willingly (Maren's Thimble) — different, worse text
  kills: number;
  catches: number;
}
```

**Unlock rules:** `seen` on any disturbance spawn of that species (silhouette entry, param sketch hidden). Full entry (name + one-liner + stats) on `fought`. Checkmark on `cleanCatch`. Butcher-kills (HP→0) grant the entry but never the checkmark (§4.2 Angler bait). `willing` is a distinct variant record — its text differs from the fought version and is worse (§6.3 The Baby Shoe / Maren's Thimble). Save slice is a zod schema merged into the t3 IndexedDB schema.

### 6.2 Pedestal render

Reuses the exact `FishRig`: an acquired pool slot, front-lit (fixed warm key light, not the run's moon), slow turntable rotation, spec-§8.2 flat-shaded look. Full-screen overlay = left list (species, status glyphs: silhouette / fought / ✓ clean / ❀ willing), right = live rig. Animation on the pedestal uses the standard sine-spine at low amplitude so entries are visibly "alive" but still.

### 6.3 Drowned-tier idle turns (§8.2)

Drowned/unlocked-rare entries get:
- slow idle turn (turntable), plus
- a per-entry behaviour flag: `faceCamera` (pedestal yaws to track the camera when idle) or `wave` (one limb triggers the crawler limb-wave — "One waves."), and
- the retrigger of the exhauastion belly-tilt for the entries that are "wrong" in a specific way (data flag, reused anim).

Hosted in the hub screen; we supply the component + state, the hub worker places it.

---

## 7. Loot & affix roller (`src/loot/`)

### 7.1 Rarity ladder (`roller.ts`)

```ts
type Rarity = 'C' | 'U' | 'R' | 'E' | 'Drowned';

// ctx built from t3 (dreadTier, nightPhase) + this slice (zoneDepth, licenseGrade) + quality bonuses
interface RollCtx {
  zoneDepth: number;        // 1..5
  dreadTier: number;        // 0..4
  licenseGrade: number;     // 1..7
  qualityBonus: number;     // cleanCatch +1, butcher −1, Founder's Barometer +1 (tier≥3)
}
```

Base rarity weights per zone depth shift with `dreadTier` (tier 3+ pulls weights up) and `qualityBonus`. **Drowned weight is 0 until `licenseGrade ≥ 6`** (§6.6 G6: "Drowned items may drop"). Slot roll: line / lure / trinket / bait / consumable; rods are meta-only (never drop). `qualityBonus` also moves tier of the dropped item category and the catch's loot tier.

### 7.2 Item defs as data (`items.ts`)

All of §6.1–6.4 as `ItemDef` records — no logic in defs, logic in hooks:

```ts
interface ItemDef {
  id: string; slot: 'rod' | 'line' | 'lure' | 'trinket';
  name: string; rarity: Rarity; grade?: number;      // tackle license grade (§6.6)
  baseStats?: Partial<ItemStats>;
  affix?: 'prefix' | 'suffix';                        // rolled trinkets
  gimmick?: GimmickId;                                // resolved by the hook registry
  unlock?: string;                                    // rod class unlock condition (hub)
  text?: string;                                      // flavour
}
```

- **Rods (§6.1):** The Keeper's Rod (start), Dredger (Smokehouse restore), Longliner (Chandlery restore, 3 anchored trap-lines → multi-tether interface with t2), Choirmaster (10 Choir clean-catches, lures free while tethered). Each carries `L`, `reelRate`, gaff/line gimmick hook ids.
- **Lines (§6.2):** Waxed Linen (C, +10 max tension), Braided Sinew (U, lunges drain +15% fish stamina), Bellwire (R, snap stuns fish once/fight), Widow's Hair (Drowned, line can't snap — you take the damage).
- **Lures (§6.3, 10 records with grades 1–7):** Chum Knot C1, Lantern Grub C1, Wailing Spoon U2, Leaded Prayer U3, Sounding Bell U3, St. Elmo's Fly R4, Mirror Minnow R4, Gravedigger's Jig R5, The Baby Shoe D6, Maren's Thimble D7. Grade data drives the §8 tackle gate.
- **Trinket pools (§6.4):**
  - Prefixes: `barnacled` (+HP), `punctual` (+reelRate), `spiteful` (+gaff at high tension), `damp` (stamina regen), `municipal` (+Memories on extraction).
  - Suffixes: `of the Spillway` (dodge through drag), `of Held Water` (brace +25%), `of the Congregation` (Callers give loot), `of Morning` (breath +6s).
- **Drowned uniques:** The Founder's Barometer, Dam Key Spare, The Hymnal (Waterlogged), Wedding Band (Yours), plus §6.2/6.3 Drowned items — each a `gimmick` id with special-cased hook behaviour (no stats on the Band, unequippable).

### 7.3 Affix roller

`rollAffixedTrinket(rng, rarity)` → picks one prefix from the pool (rarity-weighted, higher rarity favours stronger entries) + one suffix; Drowned rolls a named unique instead of affixes. `applyItem(item, build)` is a pure function that mutates a stats accumulator; `gimmick` hooks are a flat registry (`'bellwire_snap_stun'`, `'hymnal_dread_vent'`, `'founders_quality'`, `'dam_key_rescue'`, `'wedding_band'`…) resolved by id. `canUse(item, licenseGrade)` greys over-grade tackle with the *RESTRICTED. NICE TRY.* sticker (§6.6).

---

## 8. The Keeper's License (§6.6) (`src/loot/license.ts`)

### 8.1 Tribute XP formula

```
TributeXP(catch) = round(weightKg × rarityMult × struggleMult)
rarityMult:  C 1 · U 1.5 · R 2.5 · E 4 · Drowned 6
struggleMult: base 1 · clean catch ×1.5 · landed from tension ≥ 80 ×1.25 · boss ×2
```

Same formula as Memories (§6.5), separate pool. Dying banks **30%** of the run's XP. `weightKg = k·totalLength³` (k tuned so Shallows catches weigh ~2–5 kg).

### 8.2 Grades 1–7 (data table from §6.6)

| Grade | Title | Passive hook | Unlocks |
|---|---|---|---|
| 1 | Probationary Keeper | — | Grade-1 tackle |
| 2 | Keeper (Provisional) | `stamina +10` | Grade-2 tackle, Uncommon shop stock |
| 3 | Keeper, Licensed | `consumableSlot +1` | Grade-3 tackle, Eligible-III bite |
| 4 | Senior Keeper | `brace +10%` | Grade-4 tackle, Rare shop stock, boat winch Mk II (t3) |
| 5 | Warden-Adjacent | `memories +5%` | Grade-5 tackle, Eligible-V bite |
| 6 | Custodian, First Class | one free line-snap per run | Grade-6 tackle, Drowned drops enabled |
| 7 | *[title redacted; wet ring stamp]* | tier-4 loot bonus applies at tier 3 | Grade-7 tackle; the letter isn't signed by the Office |

Passives apply via the same `applyItem`-style build accumulator; tackle gating via `canUse`; bite gating via `canBite` below. Save slice: `{ grade, xp }` zod-validated.

### 8.3 XP curve target

**Target: Grade ≈ zone+1 at 2–3 runs per zone.** Starting cumulative thresholds: G2 120 · G3 300 · G4 560 · G5 900 · G6 1350 · G7 1900. With Shallows catches averaging ~3 kg × ~1.5 rarityMult × ~1.1 struggle ≈ 5 XP/catch × ~10 catches/run ≈ 50 XP/run → G2 lands in ~2.5 runs (entering Kelp Graves = zone 2, on pace). A player rushing zones without catching falls behind: the deep bestiary won't bite (§8.4). Thresholds and `k` are exposed in the debug panel; acceptance = the pace table above.

### 8.4 Bite-eligibility gating

`canBite(species, grade) = species.eligibility ≤ grade`. Ungraded players still **see** the species (silhouette under the surface; disturbance present but doesn't respond to the cast — §6.6). The cast/SET flow (t3) consults this before a bite can land. This is the level-gate on high-end enemies: geography reaches the Choir, only a Grade-5 license makes the Choir *acknowledge* you.

---

## 9. Office Contracts (§6.7) (`src/loot/contracts.ts`)

### 9.1 Work-order data shape

```ts
type WorkOrderKind = 'cleanCatch' | 'deliverN' | 'retrieve' | 'bagman';
interface WorkOrder {
  id: string;
  kind: WorkOrderKind;
  zone: number;                          // zone the order points at
  target?: { speciesTier?: number; speciesIds?: string[]; bait?: BaitGrade };
  count?: number;                        // deliverN: how many
  reward: { xpBonus: number; bait?: ItemRef; item?: ItemRef; memories?: number };
  text: string;                          // Office-voiced work order
  note?: string;                         // e.g. "SPECIAL ORDER: one [1] brass thimble."
  requireEligibleTier?: number;          // 'deliverN Eligible-III' style
}
```

### 9.2 Generation

At the bell buoy each run, roll **up to 2** orders from a template pool filtered by run context: zone reached, license grade, missing items (the roller knows what's not yet in the box — retention connective tissue), Bagman availability. Story orders (e.g. the brass-thimble SPECIAL ORDER) are flagged `story` and slot in as delivery channels. Completion is tracked on run state; reward hooks fire on extract (xp bonus stacks with Tribute XP; bait/item dropped into the haul or box).

### 9.3 Reward hooks

`completeOrder(order, runState, save)` — awards `xpBonus`, writes bait/item, bumps `memories`. Contracts are the "reason to point tonight's run somewhere" and the Office's narrative voice in the meta layer.

---

## 10. Ordered task breakdown (~1–3h each)

All tasks assume the t1 scaffold (ECS-lite world, system signature, seeded RNG, render loop) exists.

| # | Task | Files | Est | Acceptance criteria |
|---|---|---|---|---|
| A1 | `FishParams` types, defaults, palette registry, zone-size→`FishStats` mapping | `fish/types.ts`, `fish/params.ts` | 2h | Types compile; `makeParams()` default renders one grey capsule fish identical in feel to the M1 hardcoded fish |
| A2 | Shared template geometry + `FishSlotPool` + body skinning (lathed capsule) | `fish/mesh.ts` | 3h | 1 draw call per fish; 24 fish ≤ perf budget (≤150 calls, ≤60k tris, 60fps integrated); zero allocation in update loop |
| A3 | CPU sine-spine animation + exhaustion scale + belly-tilt, wired to `animation` system slot | `fish/animate.ts` | 2h | Wave travels head→tail; exhaustionRatio=1 → near-still + slow roll; reads t2's field |
| A4 | Parts: fins (2–9), eyes (0–3), jaw split, limbs (0–4); limb-wave crawler gait | `fish/mesh.ts`, `fish/animate.ts` | 3h | Each param boundary renders sanely; odd finCount visibly "wrong"; crawler walk reads as awful |
| A5 | Wrongness curve + jitter + `speciesForZone` + `canBite`; seeded determinism | `fish/params.ts` | 2h | w(z) table matches §3.5; same seed → same fish; rarity widens jitter; grade gate works |
| A6 | Enemy category presets (Crawler/Caller/Snatcher/Dragger) + `FishStats` per category | `fish/species.ts` | 2h | Each category produces a distinct rig + stats a crawler AI / caller scream hook can consume |
| A7 | Bagman + Purse Minnow + Auditor's Courier: chase to sinkhole, waterski drag target, night-clock gate, loot table | `fish/bagman.ts` | 3h | Pursues nearest sinkhole (t3 map interface); hooked → tether drag along heading; Courier only at deep night; ~6% spawn + first-3-runs floor data |
| B1 | 12 Shallows species data (names, params, one-liners, eligibility) + bestiary text slots | `fish/species.ts`, `bestiary/texts.ts` | 2h | All 12 render distinct; rarity/eligibility spread per §5 |
| B2 | Bestiary entry state model + unlock rules + save zod slice | `bestiary/bestiary.ts` | 2h | seen/fought/cleanCatch/willing tracked; butcher never grants ✓; export/import round-trips |
| B3 | Bestiary screen: list + pedestal rig render; Drowned idle turn / faceCamera / wave | `bestiary/bestiaryScreen.ts` | 3h | 12 entries browsable; flagged entries turn/wave; pedestal reuses pool slot, front-lit |
| C1 | Item defs data (rods, lines, lures, trinket pools, Drowned uniques) + `canUse` grade gate | `loot/items.ts` | 2h | All §6.1–6.4 records present; over-grade tackle greys with sticker |
| C2 | Rarity ladder + slot roll + affix roller + `applyItem` + gimmick hook registry | `loot/roller.ts` | 3h | Drowned weight 0 until G6; qualityBonus ±1 applies; prefix+suffix rolls; hooks resolve |
| C3 | Loot drop integration: catch → drop via `rollCatchDrop`; clean +1 / butcher −1 tiers | `loot/roller.ts` (system glue) | 2h | Landing a catch yields an item matching formula + ctx; hooks land on build |
| D1 | License: XP formula, grade table, passive hooks, tackle gating | `loot/license.ts` | 2h | XP per catch correct; 30% death bank; passives apply; debug panel exposes thresholds/k |
| D2 | Bite-eligibility wired into cast/SET flow + balance pass vs pace table | `loot/license.ts` + glue | 2h | Grade ≈ zone+1 at 2–3 runs/zone (instrumented runs); silhouette-no-bite reads correctly |
| D3 | Contracts: template pool, generator (≤2/buoy, context-filtered), completion + reward hooks | `loot/contracts.ts` | 2h | Orders filter by zone/grade/missing items; rewards land on extract; story order slots in |

**Glue dependencies:** C3/D2 need the t3 disturbance/cast/SET flow and t2 land/exhaustion hooks to exist; B3 needs a hub screen slot (hub worker). Everything else is standalone against the t1 scaffold.

---

## 11. Risks & open questions

- **Per-vertex CPU skinning at scale:** 64-slot pool at full occupancy on integrated graphics. Mitigation: parts collapse to zero-radius unused, single material, reuse buffers; perf budget check is a hard acceptance criterion on A2; fallback = drop to 32 slots / reduce radial segments 12→8 for distant fish.
- **Topology-vs-topology churn:** fixed max topology wastes some verts on small fish (9 fins allocated for a 2-fin fish). Accepted — trivially cheap, buys one-draw-call-per-fish.
- **Jaw-split geometry:** splitting head rings creates open edges. Mitigation: keep the split behind the first ring (seam hidden by the nose cap); verify in A4.
- **Determinism contract:** wrongness, loot, and license XP must all be pure over the seeded RNG; any system reading unseeded values (e.g. `Date.now()`) will corrupt daily-lake reproducibility — guard in code review.
- **Balance unknowns:** rarity-weight drift by Dread, XP thresholds, Bagman spawn floor. All exposed as debug-panel dials (alongside the t2 six, §13.1) and locked behind the acceptance criteria, not guesswork.
- **Interfaces not yet final:** sinkhole positions (t3), exhaustion field name (t2), save-schema merge order (t3). Keep the contracts in §2 as the single source of truth and code to them.

---

## Summary

1. One FishParams struct drives every creature via a single shared-geometry pool: a max-topology lathed-capsule template skinned on CPU each frame into per-instance buffers (one draw call per fish, zero hot-path allocation).
2. CPU sine-spine handles swimming, exhaustion (scaled amplitude/freq + belly-tilt), and the Crawler limb-wave "awful gait" — the same wave, re-applied to limbs for free horror.
3. The wrongness curve lerps finCount parity, limbBudget, humanRatio, and jawSplit with zone depth; species = presets + jitter, rarity = wider jitter, seeded and deterministic.
4. Catches, Crawlers, Callers, Snatchers, Draggers, and the Bagman (chase to sinkhole, waterski drag, three zone variants) are all one rig plus behaviour hooks, backed by 12 concrete Shallows species, a bestiary with fought/clean/willing unlocks and Drowned pedestal turns, and a full loot/affix roller.
5. The Keeper's License (Tribute XP, Grades 1–7, bite-eligibility gating) and Office Contracts (≤2 work orders per run) close the meta loop, with ~17 ordered 1–3h tasks, acceptance criteria, and risks against the other workers' interfaces.
