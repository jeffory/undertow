# UNDERTOW — Design & Technical Specification

*A fishing roguelite ARPG about catching what you drowned.*

**Version 0.2 — Working draft** *(adds: night clock & boat combat, Keeper's License levelling, lure grades, the Bagman, Office Contracts, procedural audio)*
**Platform:** Browser (Three.js, TypeScript, no backend)
**Target playtime:** 5–10 hours to credits, 12+ for completion
**Tone:** Dark with gallows humour. The lake is horrifying. The paperwork is worse.

---

## 1. High Concept

You are the last keeper of a drowned lighthouse on a black lake with no bottom. Something at the bottom accepts tribute: for every catch you deliver, it returns a piece of the town that drowned — a building, a bell, a person. You fish to rebuild. You fish to get *her* back.

The catch: the fish **are** the townsfolk. And the thing at the bottom isn't imprisoning them.

**One-line pitch:** Hades' combat, Dredge's dread, and a fishing line that works both ways.

**Signature mechanic:** Fishing IS combat. Hooking a catch tethers it to you — a physical line constraint neither of you can break for free. Every fight is a leash fight.

---

## 2. Story

### 2.1 Backstory (revealed in fragments)

Thirty years ago, the town of **Greywater Hollow** sat in a valley below the dam you operated. The lighthouse — absurd, inland, a folly built by a founder who insisted the lake "would come" — was your home and your joke of a job: keeper of a light with no ships.

The night of the storm, you had a choice: open the spillway and flood the Hollow, or let the dam fail and flood the valley towns downstream — ten thousand people. You opened the spillway. The Hollow had four hundred souls. The arithmetic was correct. It has never once helped.

Your wife, **Maren**, was in the Hollow that night, delivering the founder's granddaughter's baby. You told her you'd hold the water until morning. You did not hold the water until morning.

The valley towns never knew. The official record says the dam failed. You kept the light on out of habit, then out of penance, then because one night, thirty years later, the light reflected off the water and **something reflected back.**

### 2.2 The Deal

The thing at the bottom — the townsfolk's bestiary entries call it **the Mouth**; it signs its correspondence "**The Office of Returns**" — communicates via notes in bottles, water-stained and formatted like municipal paperwork.

> *NOTICE OF ELIGIBILITY: The below-signed resident(s) of Greywater Hollow have been assessed and may be RETURNED upon receipt of equivalent tribute. Tribute is assessed by weight, memory content, and struggle. The Office thanks you for your continued custodianship. Do not stop fishing.*

Deliver catches to the bell buoy; the Office converts them to **Memories** (meta-currency). Spend Memories at the shore to restore buildings and, eventually, people. The restored are cheerful, damp, and profoundly in denial. None of them will discuss the flood. All of them remember you fondly. This is worse.

### 2.3 The Turn (mid-game, Township zone)

Descending into the drowned Hollow itself, you find it *inhabited*. The fish-things wear the town like a habit — schooling through the church, queuing at the flooded post office. They are not suffering. They are not waiting to be rescued. The deeper entries in your bestiary stop being funny:

> *Pale Carp — its scales spell a name you refuse to read.*

Maren's house has a light on. Underwater. She has left you a note in her own hand: ***"Stop."***

### 2.4 The Truth (late game, the Choir)

The Mouth is not a predator. It is a **warden** — the accumulated will of the drowned, grown vast, keeping the Hollow's dead together, below, *away from you*. Every "return" you purchase tears someone out of that communion and staples them back into a body that remembers drowning. The restored NPCs' cheer is shock. The ones who "disappear again" when you neglect the town aren't being taken — they're going *home*, walking back into the water at night.

The tribute system exists because the Mouth cannot refuse you. You opened the water; you are, by the oldest law it knows, its keeper too. The Office of Returns is the sound of something enormous being scrupulously, resentfully *fair*.

### 2.5 Endings

**Ending A — HAUL (the correct arithmetic, again):** Fight the Mouth, land Maren as the final catch. She comes back. The town is restored, sunlit, complete, and every restored soul now shares her expression — the one you can't quite name until the final shot: it's the face of someone holding water back until morning. Post-credits: the lake begins to rise. New Game+ is framed as the loop continuing.

**Ending B — CUT (true ending):** At the final hook-set, cut the line — sacrificing your entire run, every upgrade, the rod itself. Then walk into the lake. The Mouth's last invoice: *"TRIBUTE ACCEPTED: one (1) keeper, by weight, memory content, and struggle. Account closed."* The Hollow stays drowned and whole. The final bestiary entry is yours, written in Maren's hand, and it is kind.

Ending B requires having read Maren's note (missable, gently telegraphed). Players who mainline to Ending A get a clear signal a second ending exists.

### 2.6 Narrative delivery (no cutscenes)

- **Bestiary entries** (~60): the comedy engine and the horror engine, same organ.
- **Bottle notes** from the Office: tone-setting, escalating passive aggression.
- **Restored NPC barks:** 3–5 lines each, cheerfully wrong. ("Lovely weather. Shame about the everything.")
- **Environmental text** in the Township: shop signs, a cinema marquee still advertising the film that played that night.
- **Maren breadcrumbs:** one artifact per zone.

---

## 3. Core Loop

```
LIGHTHOUSE (hub)                    THE LAKE (run)
┌─────────────────┐    row out    ┌──────────────────────────┐
│ spend Memories  │ ────────────▶ │ explore surface (top-down)│
│ restore town    │               │ cast at disturbances      │
│ craft/socket    │               │ HOOK ─▶ tether fight      │
│ story beats     │ ◀──────────── │ land / cut / get pulled in│
└─────────────────┘  extract or   │ Dread rises ─▶ ambushes   │
                     die          │ sinkhole ─▶ next zone down │
                                  │ bell buoy ─▶ extract       │
                                  └──────────────────────────┘
```

**Run length target:** 25–40 minutes. **Runs to credits:** 12–15.

### 3.1 A run, beat by beat

1. **Rig up** at the lighthouse: rod class, line, 3 lure slots, 2 trinkets, consumables.
2. **Row out.** The lake surface is a procedurally generated graph of islets, wrecks, and fishing disturbances. Boat = fast travel between islets; combat happens on foot (islets, wrecks, shallows you can wade).
3. **Cast** at a disturbance. Telegraph shows catch tier (ripple size) but not species. Split-second choice on the bite: **SET** (fight begins, tethered) or **RELEASE** (no loot, no Dread, disturbance consumed).
4. **Fight on the line** (see §4). Land it → loot + Dread. Cut it → lose the equipped lure. Get dragged in → water phase (see §4.5).
5. **Dread thresholds** trigger land ambushes — things climb out. Same combat verbs, no tether.
6. **Sinkholes** (1–2 per surface map) descend a zone. Descending is one-way within a run.
7. **Extract** at a bell buoy (keep 100% of haul) or **die** (keep 30%, rounded down, the Office's condolence rate).

### 3.2 The Night Clock

Each run spans **dusk → night → deep night → false dawn**, a real-time phase clock (~8–10 min per phase, visible as the sky/fog gradient and the lighthouse beam sweep frequency).

| Phase | Surface behaviour | Boat |
|---|---|---|
| **Dusk** | Tutorial-calm. Common disturbances, no ambushes below Dread 40. | Safe traversal. |
| **Night** | Dread gains +25%. Rare disturbance bias. **Boat combat enabled** — things can hook the boat. | Contested. |
| **Deep night** | Whistler eligible. Bagman night-variant eligible. Callers scream further. | Actively hunted. |
| **False dawn** | Spawns thin out, but extraction buoys start *submerging* one by one. Overstay pressure. | Safe again, if it still floats. |

Descending a zone does **not** reset the clock — deep zones at deep night are the endgame risk stack. The clock replaces the old "linger" Dread tax (§5) and gives runs a natural arc: greedy players fish the surface into the night for boat-tier loot; efficient players dive early and race the dawn buoys.

### 3.3 Boat combat (night phases only)

At night, large hostiles — **Draggers** — can hook **the boat**. The tether system runs at boat scale:

- You fight **from the deck**: gaff and lures work normally; the deck is a small moving arena that tilts with tension.
- The boat has **hull HP** and a **winch** (boat-scale reel — hold at the winch post to reel, exposed while doing it). Dragger lunges yaw the boat toward hazards (rocks, wrecks, other disturbances, which *wake up*).
- **Cut the line** at the cleat: costs a **hull segment** instead of a lure — the Dragger takes a bite of boat on the way out.
- Hull reaches 0 → boat swamps → extended water phase with your whole haul sinking around you; grab what you can (each pickup costs breath seconds).
- Chandlery boat upgrades: hull plating, winch gearing (reel rate), bow lantern (night vision radius), and the **Bell Keel** (once per night, ring to force every Dragger in range to disengage — and every Caller to answer).
- Landing a Dragger yields boat-tier loot: guaranteed Rare+, hull repair materials, and the only source of **Dragger Teeth** (crafting mat for Drowned-adjacent gear).

Daytime/dusk boats are strictly traversal — the lake observes business hours. The bestiary is explicit: *"Draggers do not hunt before dark. Nobody has explained this to them. It appears to be a courtesy."*

---

## 4. Combat & The Tether

### 4.1 Player verbs (identical on land and on the line)

| Verb | Input | Notes |
|---|---|---|
| Move | WASD | 8-dir, top-down |
| Dodge roll | Space | i-frames 0.25s, 0.6s cooldown, costs 25 stamina |
| Gaff light | LMB | 3-hit combo, short reach |
| Gaff heavy | Hold LMB | Wind-up, knockback, stagger damage |
| Lure ability | 1/2/3 | Cooldown "spells" (see §6.3) |
| Reel stance | Hold RMB | Tether fights only — see below |
| Cut line | Hold F (0.5s) | Always available, always costs the equipped lure |

**Stamina:** 100, regen 40/s after 0.8s delay. Dodge 25, heavy gaff 30. Reel stance drains 10/s.

### 4.2 The tether (the whole game, mechanically)

The hooked catch and the player are joined by a **distance constraint with spring slack**:

- **Line length L** starts at rod's max (e.g. 14 m). The fish cannot exceed L from the player; the *player* cannot exceed L from the fish. You are both on the leash.
- **Reel stance (hold RMB):** shortens L at `reelRate` (rod stat), locks dodge, slows move speed 50%. Fish inside ~2 m and **exhausted** → contextual **LAND** prompt: clean catch.
- **Fish lunges:** when the fish lunges away and hits max L, the impulse transfers — you get yanked `pullForce × (1 − brace)` in its direction. Brace by moving *against* the pull (reduces displacement 60%) or eat the drag and get hauled across the arena, through hazards, into other spawns. Boss fish route their drags *deliberately*.
- **Line tension** (0–100, UI = line colour green→white→red): rises while reeling against a lunging fish, falls on slack. At 100 the line **snaps**: lose lure, catch escapes, brief stagger. Tension management ≈ Monster Hunter's clash mini-game, continuous.
- **Exhaustion:** fish stamina drains from lunging, gaff hits, and being reeled at low tension. Exhausted fish (visible: slower sine-spine, belly-tilt) can be reeled fast and landed. Killing a fish outright (HP → 0 before exhaustion) still yields loot at −1 quality tier and no clean-catch bestiary credit.
- **Two kill profiles:** *Butcher* (burst it down, worse loot, faster) vs *Angler* (exhaust and land, better loot, riskier). Both fully valid; the bestiary's clean-catch checkmarks bait completionists toward Angler.

### 4.3 Tether math (implementation sketch)

Plain semi-implicit Euler, no physics engine:

```
// per frame, after intents applied
d   = fish.pos - player.pos
len = |d|
if len > L:
    n = d / len
    excess = len - L
    // split correction by mass ratio; fish "mass" is a stat
    player.pos += n * excess * (fishMass / (fishMass + playerMass))
    fish.pos   -= n * excess * (playerMass / (fishMass + playerMass))
    tension    += excess * k_tension * dt
else:
    tension    -= slackDecay * dt
tension = clamp(tension, 0, 100)
```

Lunges are just impulses on `fish.vel`; drag events fire when correction displaces the player > 1.5 m in a frame window. The catenary line render is a quadratic Bézier sagging by `(1 − tension/100)`.

### 4.4 Enemy design

All enemies are **the same procedural fish rig, parameterised wrong** (see §8.2). Categories:

- **Catches** (tethered): the loot. Behaviour = orbit / lunge / dive / drag patterns per species.
- **Crawlers** (land ambush): fish on fin-legs. Melee chasers, get faster and more person-proportioned by zone.
- **Callers:** stationary, scream to raise local Dread until killed. Priority targets.
- **Snatchers:** attempt to steal your *hooked catch* mid-fight — a second mouth on your line. Kill it or lose the catch.
- **Draggers** (night, boat-scale): leviathan silhouettes that hook the boat. See §3.3.
- **The Bagman** (rare spawn — the cash cow): a bloated courier fish in the remains of a waistcoat, hauling one of the Office's strongboxes. It does not fight. It **runs** — directly for the nearest sinkhole, dragging you behind it if hooked (you are, briefly, waterskiing). Land it before it reaches the hole or it's gone with everything. Escalating loot table: Memories jackpot + guaranteed Rare, small chance of Drowned. ~6% spawn chance per surface map, +Dread-tier bonus. Zone variants: **Purse Minnow** (Shallows, teaches the chase), **The Bagman** (standard), and the deep-night-only **Auditor's Courier**, which carries an Epic and *also screams for help* — landing it is a fight against everything that answers. Its bestiary entry: *"Embezzlement, technically. The Office has never pressed charges. The Office prefers to handle these things internally, which is why the Courier screams."*
- **Bosses:** one per zone (§7). All boss fights use the tether — sometimes theirs.

### 4.5 The water phase (getting pulled in)

Dragged past a shoreline while tethered → you go under. Screen inverts to dark; 15-second **breath timer**; movement is slow and drifty; you cannot attack, only reel, cut, or struggle to shore. At Dread tier 3+, *other things approach while you're under*. Being in the water is never fatal by drowning alone — it's fatal because of what notices you. (Gallows-humour bestiary confirms: "The lake has never drowned anyone who didn't have it coming. This is not the comfort the lake thinks it is.")

---

## 5. The Dread Economy

Dread is per-run heat (0–100), the risk/reward dial and pacing engine.

**Gains:** land a catch +4–12 (by tier) · kill a Caller too late +5 · loot a Maren artifact +15 · descend a zone: floor rises to zone minimum · night-clock multiplier (+25% gains at night and later, §3.2).

**Effects by tier:**

| Tier | Dread | Effects |
|---|---|---|
| 0 Calm | 0–19 | Base spawns, common catches |
| 1 Noticed | 20–39 | +1 rarity die on catches, occasional Crawler pairs |
| 2 Watched | 40–59 | Uncommon+ disturbance bias, Callers spawn, ambushes on landing a catch |
| 3 Hunted | 60–79 | Rare disturbances appear, Snatchers active, water phase is *occupied* |
| 4 Beheld | 80–100 | Guaranteed rare/epic disturbances, continuous pressure, **the Whistler** may spawn (roaming elite that hooks YOU) |

**Reductions:** extraction resets it; the *Hymnal* trinket line and chapel blessings vent it; releasing a bite at the SET prompt is the only free valve (skill expression: farm bites you don't take).

**Design intent:** Dread converts greed into difficulty smoothly. The optimal-loot line is riding tier 3 — deliberately uncomfortable.

**Meta twist:** every restored building permanently raises the run's *starting* Dread by +2 (cap +30). The town's return is an escalating provocation. The lake resents being emptied, and the difficulty curve is diegetic.

---

## 6. Items & Loot

ARPG affix loot, kept tight: 4 slots (rod, line, lure ×3, trinket ×2). Rarity: Common / Uncommon / Rare / Epic / **Drowned** (unique, named, story-flavoured).

### 6.1 Rod classes (unlockable playstyles)

| Rod | Unlock | Identity |
|---|---|---|
| **The Keeper's Rod** | start | Balanced. L=14m, medium reel, no gimmick. |
| **Dredger** | restore the Smokehouse | Heavy. Short line (9m), brutal reel rate, gaff hits build bonus exhaustion. Grappling with fish, basically. |
| **Longliner** | restore the Chandlery | Set up to 3 anchored trap-lines that auto-hook passers-by; you juggle multiple tethers. Chaos class. |
| **Choirmaster** | clean-catch 10 Choir species | Long line (20m), weak gaff, lures cost no cooldown while a fish is tethered. Caster class. |

### 6.2 Lines (the "armour" slot)

Affects L, tension ceiling, snap behaviour. Examples:
- **Waxed Linen** (C): +10 max tension.
- **Braided Sinew** (U): lunges drain 15% more fish stamina.
- **Bellwire** (R): line snap stuns the fish instead of freeing it — once per fight.
- **Widow's Hair** (Drowned): line cannot snap; instead, at 100 tension **you** take the damage. "She always held on. Look where that got everyone."

### 6.3 Lures (spell slots — 3 equipped; cutting the line sinks the active one)

Every lure carries a **License Grade** (§6.6). You cannot buy, craft, or *use* tackle above your grade — an over-grade lure in your box is greyed out with an Office sticker: *RESTRICTED. NICE TRY.* Grade also gates **who bites**: high-tier species simply ignore ungraded tackle (see §6.6), so the deep bestiary is locked behind licensing, not just geography.

| Lure | Rarity | Grade | Effect |
|---|---|---|---|
| Chum Knot | C | 1 | Taunt all nearby crawlers to a point, 4s. |
| Lantern Grub | C | 1 | Blind cone; blinded fish can't route drags. |
| Wailing Spoon | U | 2 | Fear burst around you; Callers are silenced 6s. |
| Leaded Prayer | U | 3 | Next lunge transfers zero pull. One charge. |
| Sounding Bell | U | 3 | Pings all disturbances on the map; Bagman spawns are marked. Dread +5. |
| St. Elmo's Fly | R | 4 | Line becomes conductive 8s: reeling deals shock damage per metre reeled. |
| Mirror Minnow | R | 4 | Decoy clone; Snatchers steal *it*. It screams when eaten. It's fine. |
| Gravedigger's Jig | R | 5 | Attracts **Eligible-V** species (Choir tier) to your cast for 12s. |
| The Baby Shoe | Drowned | 6 | All fish in the zone become **eligible** (rare-tier table) for 20s. Dread +20. The Office attaches a note: *"Where did you find this."* |
| Maren's Thimble | Drowned | 7 | The next catch does not fight. It comes willingly. You will wish it hadn't. (Guaranteed clean catch; the bestiary entry it unlocks is different from the fought version's, and worse.) |

### 6.4 Trinkets (passives, prefix/suffix rolled)

Prefix pool (examples): *Barnacled* (+HP), *Punctual* (+reel rate), *Spiteful* (+gaff damage at high tension), *Damp* (stamina regen), *Municipal* (+Memories on extraction).
Suffix pool: *of the Spillway* (dodge through drag events), *of Held Water* (brace efficacy +25%), *of the Congregation* (Callers give loot), *of Morning* (breath timer +6s).

Named Drowned trinkets:
- **The Founder's Barometer** — always reads STORM. While at Dread tier 3+, +1 loot quality. "He built a lighthouse on a lake that didn't exist yet. Everyone laughed. Everyone."
- **Dam Key, Spare** — once per run, cheat death by "opening the spillway": massive AoE knockback, survive at 1 HP, Dread +25, and every restored NPC's barks change for the rest of the session. They don't mention why.
- **The Hymnal (Waterlogged)** — standing still 3s vents Dread 2/s. Fish will not bite while you are singing. Neither will anything else. It's the only quiet in the game.
- **Wedding Band (Yours)** — +1 line slot? No. It does nothing. It has no stats. It cannot be unequipped once equipped. Sell value: everything the vendor has. The vendor will not buy it.

### 6.5 Consumables & currency

- **Memories** (meta): from extracted catches; weight × rarity × struggle multiplier (clean catch ×1.5).
- **Bait** (run): tiers bias the catch table. Crafted at Smokehouse from fish meat — the loop of feeding fish to fish goes exactly as unremarked-upon as you'd hope.
- **Bottled Light** (rare consumable): full stamina + tension reset. The lighthouse's actual light, decanted. Finite per run; the light dims visibly at the hub the more you bottle. Nobody comments. The light comments, by dimming.

### 6.6 The Keeper's License (levelling)

Meta-progression levelling, framed as Office bureaucracy. **Tribute XP** accrues from delivered catches (weight × rarity × struggle, same formula as Memories, separate pool — dying still banks 30%). Levels are **License Grades 1–7**, each arriving as a stamped renewal in a bottle, with a passive perk and a tackle unlock:

| Grade | Title (per the Office) | Passive | Unlocks |
|---|---|---|---|
| 1 | Probationary Keeper | — | Grade-1 tackle |
| 2 | Keeper (Provisional) | +10 max stamina | Grade-2 tackle, Uncommon shop stock |
| 3 | Keeper, Licensed | +1 consumable slot | Grade-3 tackle, **Eligible-III species bite** |
| 4 | Senior Keeper | Brace efficacy +10% | Grade-4 tackle, Rare shop stock, boat winch Mk II |
| 5 | Warden-Adjacent | +5% Memories | Grade-5 tackle, **Eligible-V species bite** |
| 6 | Custodian, First Class | One free line-snap per run | Grade-6 tackle, Drowned items may drop |
| 7 | *[title redacted; the stamp is just a wet ring]* | Dread tier-4 loot bonus applies at tier 3 | Grade-7 tackle. The renewal letter is not signed by the Office. |

**Eligibility gating (the enemy lock):** each species has an Eligibility tier. Ungraded players can *see* deep species (silhouettes under the surface, disturbances that don't respond to your cast) but can't hook them — the fish assess your paperwork and decline. This is the level-gate on high-end enemies: geography gets you to the Choir, but only a Grade-5 license gets the Choir to *acknowledge* you. XP curve is tuned so Grade ≈ zone+1 arrives on-pace for a player doing 2–3 runs per zone; rushing ahead means fishing a zone where most of the bestiary won't take your calls.

Design note: levelling lives entirely in the meta layer (like Hades' mirror), not in-run — in-run power comes from loot and Dread-riding, which keeps runs swingy and keeps the license feeling like standing with the lake rather than stat inflation.

### 6.7 Office Contracts (directed goals)

Each run, the bell buoy posts up to two **work orders**: "land a clean catch in Kelp Graves," "deliver 3 Eligible-III specimens," "retrieve the item in the marked wreck," "the Bagman has been embezzling; handle it." Rewards: Tribute XP bonus, rare bait, occasionally a specific item you're missing. Contracts are the retention connective tissue — a reason to point tonight's run somewhere — and a delivery channel for story ("SPECIAL ORDER: one [1] brass thimble. The Office declines to explain.").

---

## 7. Zones & Bosses

| # | Zone | Look (procedural) | New pressure | Boss |
|---|---|---|---|---|
| 1 | **The Shallows** | Bone-teal fog, reed instancing, wrecked jetties | Tutorializes tether | **Old Pike** — the town's fishing legend, now literal. Teaches lunge/brace. Bestiary: "Uncle Aldous swore he'd catch it or die trying. Both, as it turns out." |
| 2 | **Kelp Graves** | Vertical kelp columns (line-of-sight), drifting silt | Callers; kelp blocks drag routes — use terrain against lunges | **The Congregation** — a school that fights as one mass on one hook; landing it lands *dozens*. First real horror beat played as farce: the invoice itemises every soul. |
| 3 | **The Township** | Drowned Hollow: walkable rooftops, streets between buildings, marquee lights | Snatchers; interiors; Maren's note (Ending B key) | **The Postmaster** — hooks YOU with delivery lines, reverse-tether fight. Drops the Office's forwarding address. |
| 4 | **The Choir** | Bioluminescent void, geometry only where light touches | Darkness = fog-of-war; your lantern is your radius; Whistler roams | **Maren's Echo** — not her; the town's memory of her, wearing the flood. Refuses to lunge. The fight is you deciding to reel. |
| 5 | **The Mouth** | Red. The only red in the game. | Everything, at once, politely | **The Office of Returns** — final boss and final choice. HAUL or CUT (§2.5). |

Surface maps are seeded per run: islet graph via Poisson-disc + Delaunay pathing; disturbances, sinkholes, and one micro-event (wreck, shrine, bottle note) placed per map.

---

## 8. Art & Tech Spec (no sprites, no assets)

### 8.1 Look

- Flat-shaded low-poly (`MeshLambertMaterial`/custom), vertex-colour only, zero textures.
- Palette per zone: near-black water base; bone/teal accents; Township adds sodium-lamp amber; Choir is emissive points on black; Mouth is red.
- One directional "moon" light + player point lantern; fog does 80% of the atmosphere (`FogExp2`, per-zone density).
- Post: cheap vignette + slight chromatic aberration scaling with Dread tier. Screen tilts 0.5° at tier 4. Nobody will consciously notice. Good.

### 8.2 Procedural fish generator (the crown jewel)

One rig, all creatures. A fish = parameter struct → mesh:

```
FishParams {
  spineSegments  int      // 6–14
  spineLengths   []float  // per-segment
  girthCurve     []float  // radial profile → lathed capsule
  finCount       int      // 2–9 (odd numbers read as "wrong")
  finPlacement   []t      // param along spine
  eyeCount       int      // 2… or not 2
  eyeSize        float
  jawSplit       float    // 0 = fish, 1 = it can smile
  limbBudget     int      // 0 surface … 4 by Township ("those are arms")
  humanRatio     float    // 0–1: segment proportions ease toward human ulna/femur ratios
  swimFreq/Amp   float    // sine-spine animation params
  palette        idx
}
```

- **Animation:** CPU sine wave along spine bones (`sin(t·freq + segIndex·phase)`), amplitude scaled by exhaustion. Crawlers reuse the same wave on limb bones = correctly *awful* gait for free.
- **Wrongness curve:** zone depth biases `finCount` parity, `limbBudget`, `humanRatio`, `jawSplit`. The horror escalation is literally a lerp. Species = named param presets + jitter; rarity = wider jitter.
- **Bestiary render:** same mesh on a pedestal, front-lit. The Drowned-tier entries get a slow idle turn. Some of them turn to face the camera. One waves.

### 8.3 Architecture

- **Stack:** TypeScript + Three.js + Vite. Static bundle → S3/CloudFront. No backend, ever.
- **ECS-lite, Go-brained:** plain data structs in flat arrays, systems as pure functions over them, explicit update order. No class hierarchies, no framework, no `extends`. `zod` for save-schema validation, and that's roughly the whole dependency list beyond three.
- **Systems (update order):** input → intent → tetherConstraint → movement → collision (circle vs islet polygons) → combat → dread → spawn → animation(sine) → render → ui.
- **Determinism:** seeded PCG32 per run (split streams: layout / loot / AI). Seed shown on death screen; shareable "daily lake" is a free feature later.
- **Saves:** IndexedDB, versioned, schema-validated; export/import as JSON blob for backup.
- **Perf budget:** ≤ 150 draw calls (instanced kelp/reeds/barnacles), ≤ 60k tris typical scene, 60 fps on integrated graphics. All fish share one geometry pool, differentiated by bone params + vertex colour.

---

## 9. Content Budget & Pacing

| Content | Count | Hours coverage |
|---|---|---|
| Zones | 5 | h0–9 unlock cadence: 0 / 1 / 2.5 / 5 / 7.5 |
| Bosses | 5 + Whistler elite | — |
| Bestiary species | ~60 (12/zone) | completion driver past h10 |
| Restorable buildings/NPCs | ~20 | 1–2 per successful run |
| Rods | 4 | h0 / 2 / 4 / 7 |
| Lines / Lures / Trinkets | 8 / 14 / 20 + 6 Drowned uniques | — |
| Bottle notes | ~25 | 1–2 per run |
| Endings | 2 | — |

**Retention spine:** every run should end with at least one of: new bestiary entry, new building affordable, new zone reached, or Drowned item dropped. The spawn director guarantees one un-caught species per surface map when possible.

---

## 10. Milestone Plan (weekend-sized)

| M | Deliverable | Scope |
|---|---|---|
| **M0** | *The Look* | Vite + TS + Three scaffold, water shader (Gerstner + depth gradient), fog, lantern, boat you can row. Ship criterion: a screenshot that already feels like the game. |
| **M1** | *The Fight* | Top-down on-foot controller, dodge, gaff combo, one hardcoded fish with sine-spine, land combat. |
| **M2** | *The Line* | Tether constraint, reel stance, tension, lunges/drag, cut, land prompt, water phase. **This is the fun-or-dead checkpoint — playtest hard here.** |
| **M3** | *The Loop* | Procedural surface map, disturbances, Dread tiers, extraction, death, Memories, IndexedDB save. |
| **M4** | *The Fish* | Full FishParams generator, 12 Shallows species, bestiary UI, loot/affix roller. |
| **M5** | *The Town* | Hub, 6 buildings, first rod unlock, bottle notes, NPC barks. **Vertical slice complete: Shallows + Old Pike, ~45 min of game.** |
| **M6–M9** | Zones 2–5, one per milestone, each adding its pressure mechanic + boss. |
| **M10** | *The End* | Both endings, Maren breadcrumbs, Drowned items, balance pass, daily-lake seed share. |

Fun-or-dead gate at M2 is the honest one: if the tether fight isn't compelling with a single grey capsule fish, no amount of content fixes it. If it is, everything after is production.

---

## 11. Audio (procedural, Tone.js)

No audio assets, same as visuals. Web Audio via Tone.js:

- **Zone drones:** layered detuned oscillators + filtered noise per zone; the Choir's drone is an actual choir patch (stacked formant-filtered saws) that only resolves to a consonant chord while the Hymnal trinket is venting Dread.
- **Dread heartbeat:** sub-bass pulse whose BPM tracks the Dread value; at tier 4 it phase-drifts against the drone. Players will feel this before they notice it.
- **Tension sonification:** line tension maps to a bowed-string synth pitch bend — the line audibly *creaks* toward snap. This doubles as accessibility (tension readable eyes-free).
- **Diegetic bells:** buoy bells (extraction), the Bell Keel, church bell in the Township — all one synthesized bell patch at different sizes. The game's leitmotif is a bell, because of course it is.
- **Catches:** landing chime = a small music-box phrase; it gains one wrong note per zone of depth. By the Choir it's the same phrase in minor. Nobody comments.
- SFX (gaff, splash, snap) = envelope-shaped noise bursts. Cheap, consistent, fits the flat-shaded look.

## 12. Resolved Decisions

1. **Boat combat:** yes, night phases only (§3.3). The lake observes business hours.
2. **Post-credits difficulty:** Office **Audit Levels** (Hades heat-style), deferred to post-1.0 — cheap to build on the Dread system when wanted.
3. **Audio:** fully procedural (§11).
4. **The Wedding Band:** confirmed. It is the only item that survives Ending B — it's on the final bestiary page, sketched in the margin of your own entry, in her hand. No achievement, no tooltip, no notification. If a player notices, they notice.

## 13. Playtesting Notes

### 13.1 The M2 fun-or-dead gate (tether feel)

The tether fight must be compelling with **one grey capsule fish, an empty arena, and zero content** — no loot, no Dread, no story. If dragging a player across an arena by a glowing line isn't inherently fun at that fidelity, the design needs surgery before any content is built. Concrete pass criteria:

- A first-time tester, unprompted, describes a moment from the fight afterwards ("it dragged me into the—"). Emergent-story generation is the whole bet.
- Testers can articulate *why* they lost a fish (tension mismanaged vs lunge mistimed vs greed). Illegible failure = tuning problem in impulse transfer or tension gain rates.
- Reel stance is used voluntarily. If testers only reel exhausted fish, the risk/reward on mid-fight reeling is dead — buff exhaustion gain at low tension.
- Brace is discoverable without a tutorial (moving against the pull is instinctive; verify it actually is).
- The cut feels like a *decision* at least once per session, not a panic button or a never-press.

Tuning dials to expose in a debug panel from day one: `pullForce`, `k_tension`, `slackDecay`, brace efficacy, lunge telegraph duration, fish stamina pool. These six numbers are the game.

### 13.2 Butcher vs Angler balance

Both kill profiles (§4.2) must survive contact with players. Watch for: if testers always burst-kill, the −1 loot tier isn't stinging (raise it, or make clean-catch bestiary rewards more visible earlier). If testers always exhaust-and-land, butchering has no niche — speed it up or let it skip fights the player's build can't win cleanly. Target: session logs show both profiles used by the same player in one run.

### 13.3 Pressure-system stacking

Night clock + Dread + License gates is **three pressure systems layered**. Watch for over-managed play (testers describing runs as admin rather than tension). Simplification order if needed:

1. **License** simplifies first — collapse to 4 grades or make it purely a shop gate (drop bite-eligibility). Most skippable of the three.
2. **Night clock** simplifies second — reduce to two phases (day/night).
3. **Dread** never simplifies. It is the game's economy.

### 13.4 Overlap fights & readability

The best moments are overlaps (tethered + ambushed + dragged). The risk is visual noise in flat-shaded top-down: verify the line, tension colour, drag telegraphs, and Snatcher approach are all readable at once. If not, the line render wins every priority fight — it's the protagonist.

### 13.5 Pacing checkpoints

- First Bagman encounter should happen within a tester's first 3 runs (spawn floor guarantee for new saves) — the chase sells the tether's comedy range early.
- A tester who dies every run must still feel forward motion by run 3 (30% condolence rate + contract XP must afford *something* at the hub).
- Log time-to-first-clean-catch; if median exceeds run 2, the exhaustion telegraph (slack sine, belly-tilt) isn't reading.
- Watch a tester encounter Maren's note without prompting. If fewer than half stop to reread it, Ending B's key is buried too deep.
