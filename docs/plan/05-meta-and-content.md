# UNDERTOW — M5–M10: Meta, World & Content Implementation Plan

*Worker: t5 (plan-meta). Owns the hub, town restoration, zones 2–5 + bosses, endings, narrative delivery plumbing, procedural audio, content budget, and the balance pass.*

---

## 0. Scope, lane, and interfaces

**This plan owns:** the lighthouse hub & rig-up (M5), all zone content and bosses for Kelp Graves / Township / Choir / Mouth (M6–M9), both endings + Maren breadcrumbs + Wedding Band + NG+ (M10), the bestiary/note/environmental-text delivery plumbing, all procedural audio (spec §11), content-budget tracking (§9), and the balance pass (§13.2–13.5).

**Explicitly NOT planned here** (owned by other workers — I only note interfaces): tether physics & line render (t2, plan 02), procedural surface maps & the spawn director & Dread/night-clock internals & saves (t3, plan 03), the fish mesh generator & item/loot/affix data & bestiary UI & Keeper's License internals (t4, plan 04), and the ECS-lite scaffold/renderer (t1, plan 01).

### 0.1 Interfaces I consume (from other workers)

| Source | Interface needed | Used for |
|---|---|---|
| t1 (foundation) | ECS world/shape, system signature + update order slot for a `meta` system; scene/light handles; HTML-overlay UI convention (this plan assumes crisp HTML overlays over canvas for all UI, per spec's zero-texture rule); post pipeline hook that already scales vignette/CA with Dread tier | Hub scene, restoration, rig-up screen, barks, note viewer, environmental text, ending scenes |
| t2 (tether) | `TetherState` (for tension/snap/cut/land **events**), drag-event stream (displacement > 1.5 m), LAND/CUT/release events, water-phase events | Kelp drag-blocking, boss fights, audio hooks (tension→string), Bottled Light tension-reset |
| t2 (tether) | **Reverse-tether capability** — a mode where the non-player entity owns the line and reels (Postmaster, Whistler). Must not fight the player movement system | M7/M8 bosses |
| t3 (runloop) | `DreadState` + `dread.tierChanged`; `clockPhaseChanged`; `extract`/`death` events; `runSeed`; a hook to set **starting Dread base** (the +2/restoration cap +30); spawn-director directives for zone-specific spawns (Snatchers, Whistler, Congregation, Bagman floor); map micro-event placement hook for bottle notes & breadcrumbs; save-schema extension point for a `meta` slice | Restoration Dread twist, note scheduling, breadcrumb placement, audio, retention spine |
| t4 (fish/loot) | Species table + `FishParams` presets; bestiary unlock flags (fought/clean/willing); license grade + tackle grade (for the rig-up greyout `RESTRICTED. NICE TRY.`); rod stat blocks (Dredger/Longliner/Choirmaster data); Drowned-item definitions; loot-roller events | Bestiary text pipeline, rig-up gating, rod-unlock rewards, Ending B wedding-band survival |

### 0.2 Interfaces I expose (for other workers)

- **`MetaState`** (save slice): `{ buildings: Record<BuildingId, RestoredState>, memories: number, notesRead: string[], decants: number, damKeyUsed: boolean, breadcrumbs: string[], endingsSeen: {haul?: boolean, cut?: boolean}, nplus: boolean }`. zod-schema'd, merged into the t3 save schema.
- **`runMetaStart` / `runMetaEnd`** hooks: called by t3 at run start/end; the run start sets `DreadSystem.startingValue = 2 × restoredCount (cap 30)`; the run end feeds `contentTracker`.
- **Events I emit** for audio + UI: `building.restored`, `note.read`, `bark.queued`, `bottledLight.decanted`, `bottledLight.used`, `breadcrumb.looted`, `boss.started`, `ending.a`, `ending.b`.

---

## 1. M5 — The Lighthouse Hub ("The Town")

The hub is the tension between the office and the ocean: cheerful, damp, in denial, and slowly getting brighter while the lake gets angrier.

### 1.1 Hub scene (`src/meta/hubScene.ts`)

- Shore scene: the lighthouse, the bell buoy dock, a row of building foundations arranged along the shore in "memory of the street that was" (Hollow's main street, dry-laid). Restoring a building instantiates its low-poly mesh (shared instancing, vertex colours) into the slot + its NPC stands at the door.
- Hub is not a 3D-arena: it is an ambient walking scene with the existing M1 controller; the rig-up and restoration are HTML overlays triggered by proximity/interaction with the lighthouse door and each building.
- **The hub light**: a beam + point light on the lighthouse, `intensity`, `color`, and `sweepFrequency` all driven by `1 − f(totalDecants)` (see §1.7). The beam sweep is the meta-clock display carried into runs (spec §3.2) — bottling visibly slows and dims it, permanently, across all future runs.
- The water lapping at the shore gets a redder, more liquid look with each restoration — a *subtle* palette lerp the player is not supposed to name. Nobody comments.

### 1.2 Rig-up screen (`src/meta/rigUp.ts`, `src/ui/rigUpScreen.ts`)

- Loadout slots: **rod (1), line (1), lure (3), trinket (2), consumables (bait + Bottled Light + food)**. Shape: `RigLoadout { rodId, lineId, lureIds[3], trinketIds[2], consumables[] }`, stored in the save, validated at run start by t3.
- All item IDs and stat blocks come from t4. Rig-up *only* renders and validates.
- **License gating UI**: any tackle with `grade > license.grade` is greyed with the Office sticker *"RESTRICTED. NICE TRY."*; the rod list shows un-restored-unlock rods as silhouette lockups (Smokehouse → Dredger, Chandlery → Longliner).
- Reads/writes `MetaState`; emits `rig.loadoutSaved`.

### 1.3 Town restoration (`src/meta/restoration.ts`, `src/ui/restorationUI.ts`)

- **~20 restorable buildings/NPCs** (see §1.4). Restoration = pay `cost` Memories, building appears, NPC barks, benefit activates, starting Dread +2 (cap +30).
- UI: a restoration ledger ("The Office of Public Works, Greywater Hollow" — a dry municipal register). Shows: affordable now (highlighted), locked-by-condition (reason shown in Office-speak), and a live **"The lake stirs: +N starting Dread"** readout so the +2 twist is *telegraphed, not hidden* — the difficulty is diegetic, and the player should be able to see exactly what their philanthropy is buying.
- Restore confirm plays a cheer bark + the diegetic bell patch (§5.5). First restoration of a run ends with the standard "One fish's worth of town returned. The lake is quiet, the way water is quiet before it decides."
- Spending Memories is the only spend in the hub; vendor transactions for consumables also draw from Memories (Apothecary/Bakery items are Memory-priced, keeping one currency and the "tribute" fantasy).

### 1.4 The twenty restorable buildings/NPCs

Order gating via a `unlockedBy: RunCondition` field. Conditions: `start`, `restored:[id]`, `zoneReached:n`, `bossDefeated:postmaster`, `forwardingAddress:true`, `noteRead:marensNote`, `zoneReached:choir`. All raise starting Dread +2 (cap +30).

| # | Building | Proprietor NPC | Cost band | Benefit / unlock | Story beat |
|---|---|---|---|---|---|
| 1 | **Smokehouse** | The Smokehouse Keeper | 40 | **Dredger rod unlock**; bait crafting (fish-meat → bait, spec §6.5) | "Smoked meat. There's no fish in the lake. There are no fish in the lake." |
| 2 | **Chandlery** | The Chandler | 45 | **Longliner rod unlock**; boat upgrades (hull plating, winch gearing, bow lantern, Bell Keel, spec §3.3) | Sells rope. Lots of rope. Does not explain. |
| 3 | **Post Office** | The Postmistress | 50 | Bottle-note delivery hub; unlocks "forwarding address" thread after Township | The Office's letters now arrive *addressed to you*, in her handwriting. |
| 4 | **Bell Tower** | The Bell-Ringer | 40 | Extraction buoy bells ring the game's leitmotif; +1 extract reward whisper ("she counted you out") | "I ring for every soul that comes home. I rang for four hundred in one night. I don't ring that one anymore." |
| 5 | **Chapel** | The Sexton | 60 | **Chapel blessings**: pick one per run (Dread vent, stamina, breath timer); Hymnal line of trinkets becomes obtainable | Blessings in a town with no god left, but the *water* listens politely. |
| 6 | **Apothecary** | The Apothecary | 110 | Consumable vendor (Bottled Light refill via Memories, tinctures, status cure) | "It's just water, mostly. You'd be surprised how far just water gets you." |
| 7 | **Bakery** | The Baker | 110 | Run-start meal buff (pick one of 3 small passives) | Bread. It floats. They're very proud. |
| 8 | **Tavern — The Drowned Pint** | The Innkeeper | 130 | Rumor system (hints this run's micro-event / Bagman / Whistler); barks hub | Cheapest liquor in town. The lake has better hours. |
| 9 | **Foundry** | The Foundryman | 140 | Trinket reforge/reroll (pay Memories) | Forges on a lake. "The water keeps it cool." |
| 10 | **Loom** | The Weaver | 140 | Line crafting from the §6.2 pool (Waxed Linen… Widow's Hair later) | Weaves *with* the lake's own "thread". One loom, no comments. |
| 11 | **Greenhouse** | The Gardener | 150 | Lure crafting (Chum Knot, Lantern Grub); bait quality tiers | "You grow bait here. In soil. From seeds. Nothing about this is strange." |
| 12 | **Sawmill** | The Foreman | 160 | Boat hull repairs between runs; planking currency for the Chandlery | Mills wood. The wood arrived by itself. They've stopped asking. |
| 13 | **Fish Market** | The Fishwife | 160 | Daily "featured species" Memories price bump (ties to the daily lake seed) | Prices in Memories. The lake is the wholesaler. Nobody thinks about it. |
| 14 | **Schoolhouse** | The Schoolteacher | 180 | Reveals one un-caught species per run ("a lesson about what's in the lake") | Attendance is odd. The roll-call has names the register doesn't. |
| 15 | **Town Hall** | The Clerk | 200 | License renewal paperwork UI (Keeper's License lives here, spec §6.6); +1 Office Contract slot at Grade 5+ | The paperwork is now a *building*. The Office is delighted to be administered. |
| 16 | **Lyceum Cinema** | The Projectionist | 240 | Story beat: the film that played that night; rewatchable "memory scene" | The marquee says *SOMETHING IN THE WATER*. It played that night too. |
| 17 | **Dam Office** | The Dam Keeper | 300 | The spillway; the flood confession; deepens light-dimming silence | You tell the story. He tells you which lever. Neither of you discusses the arithmetic. |
| 18 | **Maren's House** | *no NPC* | 400 | The light; the final breadcrumb thread; context for the note | A light on in a dry house. No one says whose. |
| 19 | **Memorial Garden** | The Undertaker | 450 | Ledger of names; tracks restored souls who "go home" again (spec §2.4) | "They come back to me, you know. It's not a complaint. It's a compliment." |
| 20 | **The Lighthouse** | *the hub* | 600 | Capstone: light returns to full; unlocks the final push / Ending A state | The last restoration. The one it was always about. |

Phase gates for readability: Phase 0 = #1–5 (start). Phase 1 = #6–13 (after any 5 restored). Phase 2 = #14–17 (after Township / forwarding address). Phase 3 = #18–20 (after Choir / Maren's Echo). Player-facing order is enforced by `unlockedBy`, not just cost — the ledger lists everything so the player can *read* the town's order of return.

### 1.5 NPC bark system (`src/content/barks.ts`, `src/meta/barks.ts`, `src/ui/barkOverlay.ts`)

- Data: `BarkTable { id, npc, lines: string[3..5], swapLines?: string[3..5] }`. Tone rule per spec §2.6: 3–5 lines each, cheerfully wrong. Two style anchors to hold the tone across all writers:
  - "Lovely weather. Shame about the everything."
  - (Bell-Ringer, idle) "The fish here are all volunteers, you know. I checked."
- Scheduler: on hub interactions and triggers, queue 1–2 barks max, no repeats within a session rotation, bubble overlay (HTML, positioned near the NPC). Triggers: idle-visit, own building restored (cheer), after a Maren breadcrumb is looted, after a restoration run returns empty.
- **Dam Key swap** (`src/meta/damKey.ts` flag `damKeyUsed` in `MetaState`): when the *Dam Key, Spare* trinket procs in-run (t4 data, death-cheat, Dread +25), set the flag; **for the rest of the session** every NPC's `swapLines` replace their barks. The swap lines never mention it — they're just *quieter*, shorter, and they check the water. Nobody comments.

### 1.6 Bottle notes delivery (`src/content/notes.ts`, `src/meta/notes.ts`, `src/ui/noteViewer.ts`)

- 25 notes (spec §9), each `{ id, trigger, tone, body }`. Triggers: run count, buildings restored, zone reached, license grade, or specific events (Bottle Light decant, Baby Shoe equipped, Bagman killed, Wedding Band equipped → *no note*, the Office says nothing).
- **Escalation ladder**: the Office's tone is a monotone index that only climbs — polite notice → passive-aggressive → concerned → resentful → final invoice. Text seeded by spec §2.2's *NOTICE OF ELIGIBILITY*. Example escalation anchors:
  1. *"The Office thanks you for your continued custodianship. Do not stop fishing."*
  2. *"The Office notes you have not fished. This is not a complaint. This is a notice of noticing."*
  3. *"The Office reminds you that the light is not yours to bottle. The light is the town's. The town is the Office's."*
  4. *(after the Wedding Band)* *"RE: RETURNS. There is no record of this item. The Office has no record of this item. The Office has no record of you having obtained a record of this item."*
- Delivery: 1–2 per run — one washes up at the hub shore on return, one is a lake micro-event (t3 placement hook). Read notes persist in `MetaState.notesRead` and are viewable in the Post Office ledger. No duplicates; escalation respected.

### 1.7 Bottled Light (`src/meta/bottledLight.ts`)

- Decant station at the lighthouse: converts light into a **Bottled Light** consumable (rare; full stamina + tension reset in-run — fires the t2/t1 reset hooks). Finite global pool of **9 decants total** (~1 per run across the campaign); each decant permanently dims the hub light: `intensity −=`, `sweepFrequency −=`, colour cools. The dimming is cumulative across runs and the only reaction is the light's. *"Nobody comments. The light comments, by dimming."*
- Also purchasable rarely at the Apothecary (Memory-priced) as an alternative source that does **not** dim the light — the dimming source is always the player's own hand.
- Story hinge: the beam sweep is the meta-clock (§3.2) and the Ending A return — the light that comes back at the end is the light you didn't bottle.

### 1.8 First-rod unlocks

- **Dredger** (Smokehouse, #1): Heavy, short 9 m line, brutal reel, gaff builds bonus exhaustion. Rod stat block owned by t4; the *unlock* is this plan's `building.restored` event → rig-up availability.
- **Longliner** (Chandlery, #2): up to 3 anchored trap-lines, multi-tether juggling. Requires t2's tether to support >1 live constraint in later milestones; M5 ships the rod data + rig slot + a single-trap placeholder that hard-errors if more than one constraint is active, with the interface stubbed for t2.

---

## 2. Zone content plan (M6–M9)

Each zone is a **config + pressure system + boss** on top of the t3 surface map / t2 tether / t4 fish rigs. Format per zone: look (spec §7 + §8.1 palette rules), new pressure, boss implementation sketch, species-text notes.

### 2.1 M6 — Kelp Graves

- **Look**: bone-teal fog denser than Shallows (`FogExp2` density up), **vertical kelp columns as instanced line-of-sight blockers** (perf-budgeted ≤150 draws — kelp is one instanced mesh), drifting silt particle layer, wrecked gill-nets as hazards.
- **Pressure — kelp LOS & drag-blocking**: kelp columns are world colliders (t1 collision layer). Effects:
  - They block lantern light and the player's sight-line to the tethered fish (tension state still shown, but lunge telegraphs are *partially* read — you learn to read the line, not the fish).
  - They **block drag routes**: a drag that would pull you through a kelp column instead snags you at the column edge (t2 drag-event stream + a kelp-snag resolver). Braced players use kelp to *arrest* drags; unbraced players get whipped around the column. The pressure mechanic is terrain-tethered fighting — this is the "use terrain against lunges" milestone.
- **Boss — The Congregation** (`src/bosses/congregation.ts`):
  - *Design*: a school that fights as one mass on one hook; landing it lands dozens. Comedy-as-horror: the invoice itemises every soul.
  - *Sketch*: **one** `TetherState` whose "fish" is a swarm centre; the swarm is 20–40 small members orbiting the tether point (all instances from t4's shared mesh pool). A `massPool` stat decays as members are torn off by gaffs/exhaustion; the mass pool scales `pullForce` so the fight starts heavy and lightens. When `massPool` exhausts → LAND → the cluster bursts into 12–18 individual landed catches (loot shower + guaranteed bestiary credits) and the **Invoice overlay** plays: ledger rows "1× Greywater Snook — ledgered. Account 1 of 47." descending into silence. The laughter stops at row 47.
  - *Hooks*: uses t2 constraint at a single constraint; uses t3 spawn director to seed the members; uses t4 bestiary credit machinery.

### 2.2 M7 — The Township

- **Look**: the drowned Hollow — **walkable rooftops** over flooded streets, sodium-lamp amber palette (spec §8.1 "Township adds sodium-lamp amber"), the cinema marquee lit underwater, church steeple. Interiors are enterable.
- **Pressure — Snatchers + interiors**: Snatchers (spec §4.4, t4 rigs) spawn actively and try to steal your hooked catch — a second mouth on the line; kill it or lose the catch (t2 must allow a third entity on the line — interface flagged). **Interiors** add vertical/room traversal: small arenas inside buildings where drag routes die at walls (safe-ish, but no exit while tethered unless you cut) and where environmental text lives. Rooftop running gets you *above* Snatcher ground pressure but makes you a better drag target (you get yanked off roofs into the streets).
- **Environmental text** (`src/content/envText.ts`, overlay renderer, §4.3): shop signs, the marquee still advertising *SOMETHING IN THE WATER* — the film that played that night.
- **Maren's note** — see §3.2.
- **Boss — The Postmaster** (`src/bosses/postmaster.ts`):
  - *Design*: hooks **YOU** with delivery lines — a reverse-tether fight. Drops the Office's forwarding address.
  - *Sketch*: fight start inverts the constraint (interface with t2's reverse-tether mode): the boss owns the line, reels, drags you by route; you cannot reel, only move, gaff, and reach. The boss's verbs are *delivery lines* — speech-bubble telegraphs ("SPECIAL DELIVERY.", "RETURN TO SENDER.", "SIGN HERE.") each preceding a route-drag to a hazard (sorting shelf, drain grate, flooded doorway = water-phase risk). Victory: close-range contextual action **cuts the boss's line** (distinct from the player's F-cut which costs a lure — flagged as a t2 interface requirement) → boss drops the **forwarding address** (story item: `forwardingAddress=true`), which unlocks the Post Office's deep function (§1.4 #3) and the Office-correspondence escalation tier. The fight's comedy is the boss's courtesy; its horror is that it's *glad* to finally deliver.

### 2.3 M8 — The Choir

- **Look**: bioluminescent void — geometry only where light touches; black palette with emissive points (spec §8.1 "Choir is emissive points on black"); fog near-total.
- **Pressure — darkness fog-of-war + roaming Whistler**: a darkness system replaces normal rendering in this zone: the player's **lantern radius** is the visible disc (light radius is upgradeable — Chandlery bow lantern / trinkets); geometry, disturbances, and the line's far end exist but are *not drawn* beyond the disc. Fog-of-war drives navigation dread: you fish what you can't fully see. The **Whistler** (tier-4 elite, spec §5 "roaming elite that hooks YOU") roams *outside* your light — it is never visible until it's close enough to hook; a whistle motif (audio §5.8) is your only cue. Deep-night spawns allowed (t3 clock hook).
- **Boss — Maren's Echo** (`src/bosses/marensEcho.ts`):
  - *Design*: not her; the town's memory of her, wearing the flood. **Refuses to lunge. The fight is you deciding to reel.**
  - *Sketch*: the boss has **no hostile verbs** — no lunge, no drag, no attack state. It holds at max line length, swaying gently, mirrored by your own silhouette. Reeling shortens the line; **tension rises with proximity and drains your stamina directly** (it mirrors your exhaustion). If tension hits 100 → snap (the catch "goes home"). There is no damage; the pressure is entirely the decision and the drain. Full reel → LAND → guaranteed clean catch, the truth scene (spec §2.4: the Mouth is a warden, the restored are the shocked, the "gone home" go willingly), and a Drowned-tier trophy (e.g. *The Echo's Scale*) + a bestiary entry that is worse in the willing version. The "fight" runs zero hostile-AI code — it's a state machine of hold / sway / mirror plus the reel-advance loop. This is the tonal pivot of the whole game, so acceptance includes a no-combat check (no HP to zero) and a scene checklist.

### 2.4 M9 — The Mouth

- **Look**: red. The only red in the game. Palette swizzle to a single near-black/red ladder; the fog goes thin and the geometry goes architectural — you are inside the thing that accepts tribute.
- **Pressure — everything, at once, politely**: a short gauntlet corridor (not a surface map) that stacks every prior system in micro-dose: kelp-snag obstructions, a Snatcher pair, darkness pockets, one Caller, a final room with all three active during the boss. The point is not novelty — it is *recognition*. The player has all the tools; the lake is just using them at once, politely.
- **Boss — The Office of Returns** (`src/bosses/officeOfReturns.ts`):
  - *Design*: final boss and final choice — HAUL or CUT (§2.5).
  - *Sketch*: a dedicated orchestrator, not a generic boss AI. Phase 1 is a final full-tether fight (deliberate drags through every hazard, adds spawn). Phase 2, the **final hook-set**: the boss is on the line and the LAND prompt appears *alongside* a live CUT prompt (hold F). 
    - **HAUL** → land it → Ending A (§3.1).
    - **CUT** → the standard F-cut is overridden here: it costs the whole run, not a lure → Ending B (§3.1), but **only if `noteRead:marensNote`**; without the note the CUT prompt doesn't appear — the line *holds*, and the game gives the "a second ending exists" signal (the Office's last invoice is *different*: it lists a "missing item: one (1) note, in her hand").

---

## 3. M10 — Endings, breadcrumbs, Wedding Band, NG+

### 3.1 Ending flows (`src/meta/endings.ts`, `src/content/endings.ts`)

- **Ending A — HAUL**: land the final catch → Maren is the catch → she comes back. Town restored, sunlit, complete; every restored soul shares her expression (the one you can't name until the final shot — the face of someone holding water back until morning). Credits. **Post-credits: the lake begins to rise** — the last shot, no text. `endingsSeen.haul = true`.
- **Ending B — CUT**: at the final hook-set, cut the line — sacrificing the entire run, every upgrade, the rod itself. Then walk into the lake. The Mouth's last invoice: *"TRIBUTE ACCEPTED: one (1) keeper, by weight, memory content, and struggle. Account closed."* The Hollow stays drowned and whole. **The final bestiary entry is yours, written in Maren's hand, and it is kind.** `endingsSeen.cut = true`.
- **Orchestration**: a `runEnding(scene)` module drives the transition (UI → credits → post-credits → NG+ decision). Both flows share the final arena; the branch is a single `finalChoice: "haul" | "cut"` resolved in the boss orchestrator.
- **The second-ending signal** (spec §2.5): players who mainline to Ending A get a clear signal one more exists — the Ending A post-credit lake-rise is the *first* time the game shows water rising over the town; plus the Office's missing-note invoice (§2.4) only appears if the note was never read. Both are diegetic, neither is a menu prompt.

### 3.2 Maren's note — the missable Ending B key

- Placement: **Township, 14 Willow St.** — Maren's house, the one with a light on *underwater*. Nothing else is lit; the anomaly is the hook.
- **Telegraphing (gentle, multi-layered)**:
  1. The light itself — anomalous in a drowned zone.
  2. An Office bottle note that draws attention: *"RE: OCCUPANT, 14 WILLOW ST. The property is currently tenanted. The Office advises against entering. The Office advises."*
  3. **Breadcrumb chain** (§3.3) — four artifacts whose text increasingly names the house.
  4. Re-offer: if the player reaches M9 without the note, the breadcrumb trail re-surfaces (a final breadcrumb at the Mouth's threshold).
- Reading it sets `noteRead:marensNote`, plays its own quiet scene (*"Stop."* — her hand, one word), and is the gate for Ending B. Bestiary §2.3 anchor: *"Pale Carp — its scales spell a name you refuse to read."*

### 3.3 Maren breadcrumb artifacts (one per zone)

Each is a lootable artifact (t3 micro-event placement), **+15 Dread** on loot (spec §5), a story text, and a step in the note-telegraph chain:

| Zone | Artifact | Text anchor |
|---|---|---|
| Shallows | **The Tin Locket** | Halved by the flood; the other half not found. |
| Kelp Graves | **The Midwife's Satchel** | "It was a girl. Born at 3:12 the morning the water came. They both made it." |
| Township | **The Flood Ledger (page 3)** | A name struck out, then written again in a steadier hand. |
| Choir | **The Music Box** | It plays the landing chime. It plays the landing chime *before* the wrong notes. |

`breadcrumbs: string[]` in `MetaState`; the four together gate the note's full scene (the note is always readable; the breadcrumbs make you *look*).

### 3.4 The Wedding Band (`src/content/weddingBand.ts`)

Per spec §6.4 + §12.4, implemented exactly, no embellishment:
- Drowned-tier trinket (t4 drop). **No stats. Does nothing.** Equip is irreversible (unequip UI returns nothing — no error, no tooltip; the cursor just can't pick it up). Vendor interaction returns *"the vendor will not buy it"* (`unbuyable: true, unmarketable: true` in the item def).
- **Ending B survival**: the only item that survives CUT. On Ending B, if equipped, `MetaState` carries `weddingBand=true` into NG+.
- **Final bestiary page**: the keeper's own entry (Ending B) has, sketched in the margin "in her hand," the band — a small canvas scribble. No achievement, no tooltip, no notification. If a player notices, they notice.
- Behavior test (acceptance): equip → unequip attempt → vendor → Ending B → check final page. Each step must *silently* do its nothing.

### 3.5 New Game+ framing

- `nplus=true` after either ending. **Carryover: Keeper's License grade (spec §6.6 — meta, survives) + Wedding Band (if equipped).** Restoration resets — the town drowns again, the loop continues — but the *light* remembers: the decant-dimming is permanent, and the hub's shoreline has a sunlit, restored-town *ghost* laid out in foundation lines you've seen before. The difficulty reca is diegetic: the lake knows you. (Starting-Dread base = the restoration +2 as before, so NG+ naturally starts hotter once you re-restore.)
- The loop IS the framing: no "New Game+" menu flourish; the credits end on the lake rising and the game quietly restarts at the lighthouse with the beam you didn't bottle.

---

## 4. Narrative delivery plumbing

### 4.1 Bestiary text pipeline (`src/content/bestiaryText.ts`)

- Data shape: `Entry { id, speciesId, tier: { silhouette?, fought, clean, willing? } }` — ~60 species (12/zone, t4 owns the species table; this plan owns the text slots and the unlock rules wiring). Tiers: **silhouette** (not yet caught — one ominous line), **fought** (HP-kill credit), **clean** (clean-catch credit), **willing** (landed via Maren's Thimble — *different and worse*). Unlock flags come from t4; `bestiaryText.ts` renders the right slot.
- The comedy engine and the horror engine are the same organ (spec §2.6): early zones funny, late zones unreadable. §2.3's *"Pale Carp — its scales spell a name you refuse to read"* is the pivot anchor; the pipeline must keep a writer's table of 3-per-species "comedic → unreadable" gradients.
- **Entry #61**: the keeper's own entry, injected by Ending B, written in Maren's hand. Empty slot reserved in the table from the start.
- Bestiary UI render itself is t4's; this plan provides the text source and the #61 injection hook.

### 4.2 Bottle note scheduling/escalation (§1.6)

Scheduler rules recap as a pipeline: `eligible(notes, MetaState, runState) → priority sort (tone index, trigger specificity) → pick 1–2 → deliver (hub-shore on return / lake micro-event) → record in notesRead`. The escalation ladder is a single monotone `toneIndex` that unlocks later-tier notes; no note fires before its predecessor tier.

### 4.3 Environmental text in the Township (`src/content/envText.ts`, `src/ui/envTextOverlay.ts`)

- HTML-overlay approach (crisp, zero textures, matches the hub UI convention): a `ProjectedLabel` list for the drowned zone — shop signs ("MERCER & SONS, DRY GOODS"), street markers, and the cinema marquee (animated, still advertising *SOMETHING IN THE WATER*, the film that played that night). Approach-to-read; text persists per-run; a handful trigger bestiary-adjacent unlocks (reading the marquee unlocks the Lyceum's story beat when the town is restored).
- Perf: overlays are DOM, not canvas — no draw-call cost; marquee animates on a CSS/`requestAnimationFrame` timer.

---

## 5. Procedural audio (spec §11, Tone.js)

### 5.1 Architecture (`src/audio/audioSystem.ts`)

- **One `AudioSystem`** with: master bus (gain + soft compressor), a `DreadBus`, a `DroneBus`, an `FXBus`; a `start()` that must be called from the first user gesture (autoplay policy); a global `setMuted`/volume (UI).
- **Event hook points** — a thin subscriber map over the game-event stream (some events from t1/t2/t3/t4, some from this plan's own `MetaState` events). Hooks:

| Event | Audio response |
|---|---|
| `zone.entered` | drone crossfade (§5.2) |
| `dread.tierChanged` | heartbeat BPM + pulse width; tier 4 enables phase-drift (§5.3) |
| `tension.changed` | bowed-string pitch bend / creak (§5.4) |
| `line.snap` / `line.cut` | noise burst + snap sting (§5.7) |
| `catch.landed(zoneDepth)` | music-box phrase with `zoneDepth` wrong notes (§5.6) |
| `buoyBell` / `bellKeel` / `churchBell` / `building.restored` | one bell patch, parameterised size (§5.5) |
| `extract` / `death` | buoy bell fanfare / drowned swell + filter sweep |
| `bottledLight.used` | light chime (bell patch, smallest size) |
| `whistler.spawn` / `whistler.near` | whistle motif — the only cue you get outside the light (§2.3) |
| `hymnal.venting` | Choir drone resolves to a consonant chord (§5.2) |
| `boss.started` | boss drone + heartbeat spike |
| `note.read` / `breadcrumb.looted` | paper + water swell |
| `ending.a` / `ending.b` | HAUL: full music-box phrase, all right notes, once; CUT: the drone stops. Silence is the reward. |

### 5.2 Zone drones (`src/audio/drones.ts`)

- One drone per zone: layered detuned oscillators + filtered noise, defined in the zone config (`drone: { root, detune, filterType, noiseAmount, gain }`). **Choir's drone is an actual choir patch** — stacked formant-filtered saws — that only resolves to a consonant chord while the Hymnal vents Dread (event `hymnal.venting`); otherwise it hovers a semitone off forever. **Mouth**: the drone is the *Office's* drone — the Shallows drone, re-tuned into the red. Recognition is the reward.
- Crossfade ~2 s on `zone.entered`, mono-stable, no audible clicks (ramp curves on all gains).

### 5.3 Dread heartbeat (`src/audio/heartbeat.ts`)

- Sub-bass pulse (two short sine thumps per beat, ~40–55 Hz, gain envelope). **BPM maps Dread 0–100 → ~60–160 BPM.** At tier 4 (Beheld) the heartbeat **phase-drifts** against the drone (a small LFO on the beat interval that the player feels as "the rhythm is wrong" before they hear it). Accessibility: this is the *feel* layer, eyes-free.

### 5.4 Tension → bowed-string (`src/audio/tensionString.ts`)

- Line tension (0–100, from t2's `TensionState`) maps to a bowed-string synth: pitch bend up + bow-pressure (noise) + gain. At 100 the note *creaks* and the attack edge grits — the line is audibly about to snap. Eyes-free tension read (spec §11 accessibility intent). Ducked under the DreadBus so the heartbeat always wins.

### 5.5 The single bell patch (`src/audio/bells.ts`)

- One parameterised FM/percussive bell patch: `bell(freq, size, decay, brightness)` → instanced for the buoy bells (extraction), the Bell Keel, the church bell in the Township, `building.restored`, and the Bottled Light chime. The game's leitmotif is a bell, because of course it is (spec §11).

### 5.6 Music-box landing chime (`src/audio/musicBox.ts`)

- A small music-box phrase (5–8 tuned notes, plucked/sine partials + a ticking mechanism layer). **Wrong-note ladder**: 0 wrong notes at Shallows, +1 per zone of depth (Kelp 1, Township 2, Choir 3, Mouth 4). By the Choir it's the same phrase *in minor*. Nobody comments. Data: `phrase = [note, accidentalChance]` per zone; landing at the Mouth plays a phrase that is almost *not* a phrase.
- This is also the Maren breadcrumb §3.3's "The Music Box" artifact's payload — the artifact's song is this phrase before the wrong notes.

### 5.7 Noise-burst SFX (`src/audio/noiseFx.ts`)

- Gaff hit, splash, snap, cut, loot shower: envelope-shaped noise bursts (bandpassed white noise, short ADSR), one generator, parameterised by pitch/band/decay. Cheap, consistent, fits the flat-shaded look (spec §11).

### 5.8 Whistler motif

- A whistled 2-note call (sine + vibrato, a "human" whistle), volume/DIRECTED audio cues only — the sole tell of the Choir's roaming elite outside the lantern radius. `whistler.near` sharpens the stereo pan.

---

## 6. Content budget tracking (§9) & retention spine

### 6.1 Budget ledger

`src/meta/contentTracker.ts` records delivered content per run and compares to the §9 table:

| Content | Spec target | This plan delivers | Tracked in |
|---|---|---|---|
| Zones | 5 | configs + pressure for zones 2–5 | `zones.ts` |
| Bosses | 5 + Whistler | 4 bosses + Whistler (Zones 2–5) | per-boss files |
| Bestiary species | ~60 (12/zone) | text slots for 60 + #61 | `bestiaryText.ts` |
| Restorable buildings/NPCs | ~20 | 20 (table §1.4) | `buildings.ts` |
| Rods | 4 | Dredger/Longliner unlock hooks (M5), Choirmaster (M8, clean-catch 10 Choir — via t4) | `rigUp.ts` |
| Bottle notes | ~25 | 25 scheduled (§1.6) | `notes.ts` |
| Endings | 2 | HAUL + CUT | `endings.ts` |
| NPC barks | 3–5 lines each | per-NPC tables + Dam Key swap | `barks.ts` |
| Drowned items | 6 uniques | Wedding Band, Echo's Scale + breadcrumbs; rest owned by t4 | `weddingBand.ts` |

### 6.2 Retention spine guarantee

Every run must end with ≥1 of: **new bestiary entry, new building affordable, new zone reached, Drowned item dropped**. Implementation:
- `contentTracker.runEnd(runSummary)` classifies the run's gains and stamps `MetaState`/the hub.
- **Hub surfacing**: the restoration ledger highlights newly-affordable buildings (`NEW: You can afford the Apothecary.`); the bestiary icon pings on new entries; the map/zone list pings a new zone.
- **Director hook (interface to t3)**: if a run returns none of the four, the next surface map's spawn director must guarantee an un-caught species (spec §9) — this plan only requests and consumes the guarantee, t3 owns the spawn logic.

---

## 7. Balance pass plan (§13.2–13.5)

A dedicated M10 work-stream with telemetry first, tuning second.

### 7.1 Butcher vs Angler telemetry (§13.2)
- `RunSummary` gains `{ butcherKills, anglerKills, bothProfilesUsed, cleanCatchCount }` (t2 already computes kill profiles). Session log: per-run rows to IndexedDB + a debug dump.
- Pass criteria: same-player-both-profiles in one run observed; if always-butcher → raise the −1 loot tier sting / surface clean-catch bestiary rewards earlier; if always-angler → speed up butcher or let it skip fights a build can't win cleanly. Dial exposure lives in t2's debug panel (§13.1 six dials).

### 7.2 Pressure-stack simplification order (§13.3)
- The three systems (License, Night Clock, Dread) must be **collapsible in the declared order** behind config flags so playtests can shed systems cheaply:
  1. `LICENSE_SIMPLIFIED = true` → collapse to 4 grades, drop bite-eligibility (spec §13.3.1) — rig-up greyout and eligibility become shop-gate only.
  2. `CLOCK_SIMPLIFIED = true` → night clock reduces to 2 phases (day/night) — audio + UI must adapt from a flag, not a code path.
  3. **Dread never simplifies.**
- Acceptance: flipping each flag compiles and runs; the game remains coherent (this is a *test* lever, not a shipped mode).

### 7.3 Overlap-fight readability (§13.4)
- Priority rule from spec: **the line render wins every priority fight.** Per-zone readability pass with a fixed checklist: tension colour vs zone palette contrast (Kelp teal, Township amber, Choir black, Mouth red all tested against green→white→red), drag telegraphs visually distinct from Snatcher approach, the Whistler's audio-only presence verified, the LAND/CUT prompts never occluded by a speech bubble. One task per zone (M6–M9) plus a consolidated pass in M10.

### 7.4 Pacing checkpoints (§13.5)
Instrumented gates, measured in session logs:
1. First **Bagman** within a new save's first 3 runs (spawn-floor guarantee requested from t3).
2. A player who dies every run still feels forward motion by run 3 (30% condolence + contract XP must buy *something* at the hub — the §1.4 Phase-0 buildings are the cheapest and must be affordable by run 3; verified by log).
3. Median time-to-first-clean-catch ≤ run 2 (exhaustion telegraph read — logs the t2 exhaustion counters).
4. **Maren's-note read-rate ≥ 50%** in un-prompted play (spec §13.5.4). This gates Ending B reach; if read-rate falls below, escalate the telegraph ladder (§3.2) before touching the note itself.

---

## 8. Ordered task breakdown (~1–3 h each)

### M5 — The Town (target: ~45-min vertical slice; ~10–12 tasks)
1. **Hub scene scaffold** — `src/meta/hubScene.ts`, `src/content/zones.ts` hub entry. Instanced building foundations, shoreline, lighthouse with parameterised beam (`intensity`/`sweepFrequency` from decants). *Accept:* screenshot reads as the game; restore instantiates a building. *Risk:* hub scope-creep — keep it ambient, not a full world.
2. **Buildings data + restoration logic** — `src/content/buildings.ts` (20 rows, `unlockedBy`, cost, benefit), `src/meta/restoration.ts` (pay Memories, activate benefit, +2 Dread base calc → `DreadSystem.startingValue`, cap 30). *Accept:* order gates enforced; Dread base updates; no negative Memories.
3. **Restoration ledger UI** — `src/ui/restorationUI.ts`. *Accept:* affordable highlighted; locked reasons in Office-speak; "The lake stirs: +N" readout live.
4. **Rig-up screen** — `src/meta/rigUp.ts`, `src/ui/rigUpScreen.ts` (slots, license greyout, rod lockups). *Accept:* valid loadout enforced at run start; `RESTRICTED. NICE TRY.` shows for over-grade tackle. *Dep:* t4 item data + t3 run-start hook.
5. **Bark system** — `src/content/barks.ts`, `src/meta/barks.ts`, `src/ui/barkOverlay.ts` (scheduler, rotation, queue cap 2, Dam Key `swapLines` flag). *Accept:* 3–5 lines/NPC, no repeats in a rotation; `damKeyUsed` swaps all barks session-wide; none mention the key.
6. **Bottle notes core** — `src/content/notes.ts` (first ~10 notes: notices tier), `src/meta/notes.ts`, `src/ui/noteViewer.ts`. *Accept:* 1–2/run, escalation order, no dupes, persisted. (Remaining 15 notes land across M6–M10 as triggers appear.)
7. **Bottled Light** — `src/meta/bottledLight.ts` (9 global decants, dim math, in-run stamina/tension reset hooks). *Accept:* light visibly dims + beam slows permanently per decant; consumable works in-run; nothing comments.
8. **Rod unlock wiring** — Dredger (Smokehouse) + Longliner (Chandlery) appear in rig-up when restored. *Accept:* unlock → equip → run starts. Longliner trap-line stub hard-errors on >1 constraint (interface to t2).
9. **Phase-0 NPC full bark set + smokehouse/chandlery/chapel/tavern/p.o. personalities** — content task.
10. **M5 vertical-slice playtest** — ~45 min Shallows + Old Pike + restore 2 buildings + 2 notes + 1 bark. *Accept:* slice is coherent; retention spine fires (entry/building/zone).

### M6 — Kelp Graves (8 tasks)
1. **Zone config** — `zones.ts` kelp entry (fog, palette, drone params) + `src/zones/kelpGraves.ts` instanced kelp columns + silt. *Accept:* ≤150 draws with kelp; fog reads denser.
2. **Kelp drag-blocking** — kelp-snag resolver over t2 drag events. *Accept:* braced players arrest at columns; unbraced whip around; no through-column drags.
3. **Kelp LOS** — lantern light blocked; lunge telegraphs partially hidden. *Accept:* tension state remains readable; line render beats all.
4. **Congregation boss** — `src/bosses/congregation.ts` swarm + mass pool + burst landing + Invoice overlay. *Accept:* one TetherState; 12–18 landed; invoice itemises to silence.
5. **12 Kelp species text** — `bestiaryText.ts` fills; eligibility tiers with t4.
6. **Notes 11–14 (concern tier)** + escalation ladder bump.
7. **Kelp readability pass** (§7.3 checklist).
8. **M6 playtest** — Congregation fun-or-scary balance; drag-blocking feel.

### M7 — Township (10 tasks)
1. **Zone config** — amber palette, rooftops, marquee, church. `src/zones/township.ts`.
2. **Interior system** — enterable buildings as small arenas, drag-dead walls, roof traversal + roof-drag risk. *Accept:* drag routes die at walls; roofs yank you off.
3. **Snatcher pressure** — third-entity-on-line (t2 interface) + spawn directives to t3 director.
4. **Environmental text** — `src/content/envText.ts`, `src/ui/envTextOverlay.ts` (signs, marquee animated). *Accept:* readable, DOM, zero draw cost.
5. **Maren's note** — placement (14 Willow St.), note data, scene, telegraphs #1–#3, `noteRead` flag. *Accept:* discoverable; read-rate instrumentation wired.
6. **Postmaster boss** — `src/bosses/postmaster.ts` reverse-tether (t2 interface), delivery-line telegraphs, cut-boss-line action, forwarding-address drop. *Accept:* reverse constraint doesn't fight movement; boss-line cut ≠ F-cut.
7. **Post Office deep function** + forwarding-address thread (notes 15–18, resentful tier).
8. **12 Township species text** (the comedy→horror pivot, §4.1 anchors).
9. **Township readability pass** (§7.3).
10. **M7 playtest** — Snatcher readability; Postmaster as comedy-horror; note read-rate check.

### M8 — Choir (9 tasks)
1. **Zone config + darkness fog-of-war** — lantern-radius renderer, geometry culling outside disc, `src/zones/choir.ts`. *Accept:* nothing drawn beyond radius; line's far end unread; no perf cliff.
2. **Whistler** — roaming elite, audio-only cue, hooks YOU (t2 reverse-tether), deep-night eligibility (t3 clock). *Accept:* never visible until close; whistle is the only tell; spawn respects tier-4.
3. **Choir drone patch** — formant-filtered saws + Hymnal resolution (§5.2).
4. **Maren's Echo boss** — `src/bosses/marensEcho.ts` hold/sway/mirror + reel-advance + tension/proximity drain + truth scene + Echo's Scale. *Accept:* zero hostile-AI code; guaranteed clean catch; scene checklist passes.
5. **Choirmaster rod unlock** (clean-catch 10 Choir — with t4) + rig-up slot.
6. **12 Choir species text** (the "unreadable" tier, §4.1).
7. **Notes 19–21** (the Office's resentment crests).
8. **Choir readability pass** (§7.3 — line vs black).
9. **M8 playtest** — Echo's emotional register; Whistler fairness.

### M9 — Mouth (7 tasks)
1. **Zone config + gauntlet** — red-only palette; corridor stacking every pressure in micro-dose.
2. **Final arena** — `src/bosses/officeOfReturns.ts` phase 1 (full-tether + all adds) and phase 2 (final hook-set with HAUL/CUT orchestration, `noteRead` gate, second-ending invoice). *Accept:* both branches reachable; no softlock; CUT gated correctly.
3. **12 Mouth species text** (the red bestiary) + #61 slot reserved.
4. **Notes 22–25** (final-invoice tier) + `forwardingAddress`/`ending` triggers.
5. **Mouth readability pass** (§7.3 — the line is red-on-red; verify).
6. **M9 playtest** — everything-at-once readability; final-fight tension.
7. **Ending smoke test** — HAUL path playable to credits.

### M10 — The End + audio + balance (12 tasks)
1. **Ending A flow** — `src/meta/endings.ts` HAUL: landing, sunlit town, shared-expression shot, credits, post-credits lake rise.
2. **Ending B flow** — CUT: sacrifice, final invoice, walk-in, #61 entry in Maren's hand, Wedding Band margin sketch (with `weddingBand`).
3. **Breadcrumbs** — `src/content/breadcrumbs.ts` 4 artifacts + placement hooks + +15 Dread + note-telegraph chain.
4. **Wedding Band** — `src/content/weddingBand.ts` unequippable/unbuyable/silent; Ending B + NG+ carry; final-page sketch. *Accept:* the §3.4 behavior test.
5. **NG+** — `nplus` state, license + band carryover, ghost-town hub, light-remembers.
6. **Audio: AudioSystem + event wiring** (`src/audio/audioSystem.ts`).
7. **Audio: drones + heartbeat + drift** (`drones.ts`, `heartbeat.ts`).
8. **Audio: tension string + bells + music-box wrong-notes + noise SFX** (`tensionString.ts`, `bells.ts`, `musicBox.ts`, `noiseFx.ts`).
9. **Balance: telemetry** (§7.1) + pressure flags (§7.2).
10. **Balance: pacing gate verification** (§7.4) — first 3 runs, forward-motion, clean-catch median, note read-rate.
11. **Consolidated readability + final balance pass** across all zones (§7.3 full sweep).
12. **Full-campaign playtest** — 12–15 runs to credits, both endings, retention-spine log audit, perf budget re-check.

---

## 9. Risks & open questions

1. **Reverse-tether** (Postmaster, Whistler) is the largest cross-worker dependency — if t2 can't invert constraint polarity cleanly, both bosses and the Whistler need a redesign (fallback: boss "holds" the line and the player fights a normal tether while the boss reels via a reeling-impulse emulation). Flagged early to t2.
2. **Snatcher as a third entity on the line** requires t2's tether to support >1 connected body; if refused, Snatchers steal via proximity + timer instead (fallback).
3. **Hub scope creep** — the hub is ambient, not a second game; the biggest budget risk is polishing the town over the lake. Mitigated by the §8 task list keeping M5 tight and the 45-min slice criterion.
4. **Bottle-note volume** (25) is a writing load, not a code load; scheduling keeps them gated so late-game notes never surface early. Mitigation: notes land in 4 batches (M5 core, M6–M9 tier bumps, M10 finale).
5. **The dimming light vs the meta-clock** — the beam sweep doubles as the run clock UI (spec §3.2); bottling slows it. Need t3's clock-render to read the beam's current sweep from `MetaState` (interface consumed). If they'd rather own the beam, we expose the decant count and they consume it.
6. **Ending B read-rate gate** is the single most mission-critical content metric (spec §13.5.4) — telegraph escalation must be data-driven, not reactive code.
7. **Open question:** does the Wedding Band drop at a *specific* place (story-fixed) or roll into the Drowned pool? Design leans story-fixed (a drowned house in the Township) for its "if a player notices" impact; deferred to content review with t4.
8. **Audio autoplay** — the first-gesture resume is a hard browser constraint; audio must be off until then and must not "start late" jarringly (staggered crossfade).

---

## 5-line summary

The hub (M5) ships as an ambient restoration scene: 20 buildings/NPCs with gated order and a telegraphed +2 starting-Dread twist, the rig-up loadout with license-greyout, barks with the Dam Key swap, 25 escalating bottle notes, and a Bottled Light economy that permanently dims the hub light. Zones 2–5 each pair one pressure system (kelp LOS/drag-blocking, Snatchers+interiors, darkness-with-Whistler, everything-at-once) with a signature boss — Congregation swarm, Postmaster reverse-tether, Echo's no-lunge reel, and the HAUL/CUT final office. M10 wires both endings, the missable-note-gated Ending B, four Maren breadcrumbs, the silent Wedding Band, and a diegetic NG+ loop. Audio is a single Tone.js AudioSystem — zone drones, Dread-tracked heartbeat with tier-4 drift, tension-to-bowed-string, one parameterised bell, a music-box that adds a wrong note per zone, and noise-burst SFX. Delivery relies on three hard interfaces to t2 (reverse-tether, third-entity-on-line) and t3 (starting-Dread base, spawn-director guarantees), all flagged for the orchestrator.
