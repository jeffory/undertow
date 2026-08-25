# 02 — The Tether (M2 "The Line")

Owner: TETHER slice. Scope: milestone M2 from spec §10 — the distance
constraint that makes fishing *combat*, plus everything bolted to it (reel,
brace, snap, cut, exhaustion, LAND, fish AI, water phase, line render, debug
dials, playtest instrumentation). **This is the fun-or-dead gate** (spec §13.1);
the whole plan is organised around making that gate legible.

Depends on: **01-foundation.md** (M0/M1) — ECS-lite core, on-foot controller,
dodge, stamina, gaff combat, one hardcoded capsule fish. Assumed present.

Out of scope (owned by other workers, do NOT build here): render scaffold
(01), procedural maps (03), FishParams generator (04), meta/save/UI/audio
systems (05+). I only *reserve* the seams they will attach to (and consume a
few 01 seams).

---

## 1. How it slots into the ECS-lite order

`01-foundation.md` already reserves the slot in `core/systems.ts`:

```ts
const UPDATE_ORDER: SystemFn[] = [
  input,            // devices → InputState
  intent,           // InputState → Intent (player) — 02 also runs fishAI here
  tetherConstraint, // ★ 02: distance constraint — AFTER intent, BEFORE movement
  movement,
  collision,
  combat,           // gaff damage; 02 hooks exhaustion here
  dread,
  spawn,
  animation,        // sine-spine; 02 sets exhausted telegraph here
  render,
  ui,
];
```

`SystemFn = (world: WorldState, dt: number) => void` — pure-ish, mutate only
your owned slice, fixed `DT = 1/60`.

### The per-frame contract (why it sits between intent and movement)

Every system assumes earlier systems have run. `tetherConstraint` therefore
sees: this frame's *intents* (player movement/actions, fish lunge impulses on
`fish.vel`) overlaid on *positions as of the end of last frame's movement*.
That is exactly the spec §4.3 sketch ("per frame, after intents applied"). The
constraint corrects positions directly; `movement` then integrates velocities
on top; `collision` resolves terrain afterwards. Net effect: an overshoot is
corrected one frame after it is created — 16ms at the fixed 60Hz step,
imperceptible, and deterministic. A lunge's impulse lands as a pull one frame
after the lunge starts.

**Rule: `tetherConstraint` is the only system that mutates `L`, `tension`,
`player.pos`/`fish.pos` in a pull sense, or fires tether events. `movement`
and `collision` never fight it.**

### New systems this plan adds to the order

| System | File | Position | Notes |
|---|---|---|---|
| `fishAI` (tethered-fight AI) | `game/fishAI.ts` | end of intent phase (just before `tetherConstraint`) | sets lunge impulses, telegraphs, drag routing. **Separate from M1's land AI** in `game/fish.ts` (per 01 §7 risk). |
| `tetherConstraint` | `game/tetherConstraint.ts` | reserved slot | this plan. |
| `waterPhase` | `game/waterPhase.ts` | end of `collision`, before `combat` | needs collision's shoreline answer; runs the 15s breath timer, restricted verbs. |
| line render | `render/lines.ts` | inside `render` | the reserved 01 module. |

New `WorldState` fields (additions to 01's shape, all defaulted in
`createWorld()`):

```ts
interface WorldState {
  // ...01 fields (entities, input, intent, player, combat, fish, dread, ui, time, seed)
  tether: TetherState;        // 02
  line: LineStats;            // 02 — equipped line
  water: WaterPhaseState;     // 02
  tuning: TetherTuning;       // 02 — the six dials
  tetherEvents: TetherEvent[]; // 02 — cleared by ui/audio each frame
  collision: CollisionQuery;  // 02 — shoreline/hazard queries (see §9 seam)
}
```

---

## 2. Data shapes

### 2.1 `game/tether.ts` — the tether component

```ts
// Positions/velocities live in 01's flat EntityStore (SoA float arrays) for
// movement/collision; the tether keeps a compact per-fight state struct.

interface TetherState {
  active: boolean;            // a fish is hooked
  L: number;                  // current line length (m); only ever shrinks via reel
  tension: number;            // 0..line.tensionCeiling
  reel: ReelState;
  cut: CutState;
  land: LandState;
  snap: SnapState;            // resolved this frame, consumed by combat/animation
  drag: DragState;            // sliding window accumulator
}

interface ReelState {
  hold: boolean;              // RMB held this frame (from intent)
  active: boolean;            // hold && player.stamina > 0 && !water.restricted
  speedMult: number;          // 0.5 while active (movement reads this)
  drain: number;              // 10 stamina/s (spec 4.1)
  exhaustedMult: number;      // ×2 reelRate while the fish is exhausted
}

interface CutState {
  held: number;               // seconds F has been held (0..0.5)
  progress: number;           // held / 0.5 → UI ring 0..1
  fired: boolean;             // true the frame the cut completes
}

interface LandState {
  eligible: boolean;          // |d| < 2m && fish exhausted (spec 4.2)
  accepted: boolean;          // player pressed the contextual prompt → clean catch
}

interface SnapState {
  fired: boolean;
  cause: 'reel' | 'lunge' | 'greed';  // diagnosis for 13.1 legibility
}

interface DragState {
  windowStart: number;        // world.time the current window opened
  accumulated: number;        // Σ|pull correction| over the window (m)
  lastDir: Vec2;              // dominant pull direction
  cooldown: number;           // s until the next drag event may fire
}
```

`TetherState` lives in `WorldState`, not the EntityStore: there is exactly one
active tether in M2 (one capsule fish). The Longliner's multiple tethers (spec
§6.1) are a later refactor into a component array — the system loop stays the
same. `Vec2 = { x, y }` (top-down plane; y is screen-up, z-depth is used only
by the dive visual).

### 2.2 Fish stats — `game/fish.ts` (extends 01's `FishState`)

01 owns the M1 capsule fish. Tether adds a stats block on it:

```ts
// on FishState (01), added by 02:
interface FishTetherStats {
  mass: number;               // mass ratio vs player (=1.0); heavy → yanks the player
  maxStamina: number;         // exhaustion pool (tuned via dial 6)
  stamina: number;            // 0..maxStamina; 0 = exhausted
  pullForce: number;          // impulse magnitude per lunge (m/s added to fish.vel) — dial 1
  lungeCooldown: number;      // s between lunges
  lungeStaminaCost: number;   // stamina per lunge (× line.exhaustMult for Braided Sinew)
  dragSpeed: number;          // m/s while in drag state
  dragStaminaCostPerM: number;
  routedDrag: boolean;        // bosses + deliberately-routing species drag toward hazards
  patterns: PatternWeights;   // species bias over orbit/lunge/dive/drag
  exhausted: boolean;         // stamina === 0 — animation system reads this
  hp: number;                 // 01 combat already has this — Butcher check reads it
}

interface PatternWeights { orbit: number; lunge: number; dive: number; drag: number }
```

### 2.3 Line stats — `game/line.ts`

```ts
type SnapBehavior = 'free' | 'stun' | 'damagePlayer';  // base, Bellwire, Widow's Hair

interface LineStats {
  id: string;                 // 'waxed-linen' | 'braided-sinew' | 'bellwire' | 'widows-hair'
  baseLength: number;         // L at hook-set (14 Keeper's / 9 Dredger / 20 Choirmaster, spec 6.1)
  tensionCeiling: number;     // snap threshold (100 base; Waxed Linen +10)
  reelRate: number;           // m/s L shrinks while reeling (rod stat)
  snap: SnapBehavior;
  stunOncePerFight: boolean;  // Bellwire
  exhaustMult: number;        // 1.15 (Braided Sinew) — multiplies lunge stamina cost
}
```

Defaults for M2 (single base line): `baseLength: 14`, `tensionCeiling: 100`,
`reelRate: 2.5`, `snap: 'free'`. The other three lines are data-only additions
later; their behaviors are in the snap switch (§5.3) from day one.

### 2.4 The six tuning dials — `game/tuning.ts` (spec 13.1)

```ts
interface TetherTuning {
  pullForce: number;        // dial 1 — lunge impulse magnitude
  kTension: number;         // dial 2 — tension gain per metre of excess (per s)
  slackDecay: number;       // dial 3 — tension loss per s when slack
  braceEfficacy: number;    // dial 4 — 0..1, default 0.6 ("reduces displacement 60%")
  lungeTelegraph: number;   // dial 5 — seconds of telegraph before lunge/drag
  fishStaminaPool: number;  // dial 6 — multiplier on FishTetherStats.maxStamina
}
```

Tuning is one struct on `WorldState` so the debug panel mutates it live and
every system reads the same numbers. These six values *are the game* (spec
13.1) — no tuning constant is hardcoded anywhere else.

### 2.5 Events — `game/tether.ts`

```ts
type TetherEvent =
  | { type: 'drag';          dir: Vec2; magnitude: number; by: 'lunge' | 'dive' }
  | { type: 'telegraph';     dir: Vec2; kind: 'lunge' | 'drag' }
  | { type: 'lunge';         dir: Vec2; force: number }
  | { type: 'snap';          cause: 'reel' | 'lunge' | 'greed'; lineId: string }
  | { type: 'cut';           lineId: string }
  | { type: 'landed';        clean: true }
  | { type: 'butchered';     lineId: string }
  | { type: 'pulledUnder' }
  | { type: 'reeledMs';      ms: number }   // instrumentation: voluntary reel time
```

Pushed to `world.tetherEvents`, consumed by `ui`, `render` (camera shake),
audio (later), and the playtest logger, then cleared. `combat`/`dread` read
`landed`/`butchered`/`snap` for loot tier and Dread hooks.

---

## 3. `tetherConstraint` — the core system (spec §4.3)

`game/tetherConstraint.ts`. Ordered steps, all deterministic, all reading
`world.tuning`:

```
1. REEL   — if intent.reelHold && player.stamina > 0 && !water.restricted:
              reel.active = true
              L = max(0, L - line.reelRate * (fish.exhausted ? 2 : 1) * dt)
              player.stamina -= 10 * dt
              reel.speedMult = 0.5        // movement reads it
              dodge is suppressed (controller ignores dodge while reel.active)
            else reel.active = false, reel.speedMult = 1
            Exhaustion side-effect: if tension < 40 → fish.stamina -= 12*dt (low-tension reel)

2. CUT    — if intent.cutHold: cut.held += dt else cut.held = 0
            cut.progress = min(1, held / 0.5)
            if held >= 0.5: fire cut → lose equipped lure, fish escapes,
            tether.active = false, event {type:'cut'}

3. LAND   — if land.eligible && intent.acceptLand:
            tether.active = false, event {type:'landed', clean:true} → loot rolls Angler tier

4. CONSTRAINT (the sketch, verbatim + brace):
   d    = fish.pos - player.pos
   len  = |d|
   if len > L:
     n      = d / len
     excess = len - L
     share   = fish.mass / (fish.mass + 1)          // player mass = 1.0
     oppose  = max(0, dot(player.intent.moveDir, n))  // 0..1, brace input
     brace   = 1 - tuning.braceEfficacy * oppose
     player.pos += n * excess * share * brace        // pulled toward the fish
     fish.pos   -= n * excess * (1 - share)          // pulled toward the player
     tension   += excess * tuning.kTension * dt
     // drag detection (see §4)
   else:
     tension -= tuning.slackDecay * dt
   tension = clamp(tension, 0, line.tensionCeiling)

5. SNAP  — if tension >= line.tensionCeiling → snap (switch on line.snap, §5.3)

6. EXHAUST / LAND eligibility — §6 (reads tension & distance computed above)

7. WATER  — if a drag carried player.pos into deep water while tethered → §8
```

Notes on feel-critical choices (all tunable):

- **Brace** (`brace` above) is exactly the spec's "moving against the pull
  reduces displacement 60%": `oppose` is the player's current move direction
  dotted with the pull direction, so bracing only works while *actively*
  walking into the pull. No tutorial needed (spec 13.1 criterion 4) — and the
  dial scales the efficacy to verify discoverability.
- **Heavy fish vs light fish**: `share = fish.mass/(fish.mass+1)`. A fish with
  mass 4 yanks you 80% of the excess and barely moves; a light fish comes to
  you. This single formula gives species weight identity for free.
- **Reel is the constraint doing its job**: reeling shrinks `L` below `len`,
  so the same branch 4 correction physically drags the fish toward you. No
  separate "pull the fish in" code path — reeling *is* the distance constraint
  working. This is why reeling at high tension is dangerous (constant excess →
  tension rise) and reeling at low tension exhausts the fish.
- **Excess is real distance, not a fake gauge**: tension rises only from
  actual overshoot. That keeps tension readable ("the line is actually
  strained right now") and makes failure legible (spec 13.1 criterion 2).

Edge cases handled explicitly:
- `L` cannot shrink below the fish's hook radius (don't pull the fish into
  your feet): `L = max(fishRadius, …)`.
- If `fish.exhausted`, the fish cannot lunge and `pullForce` is ignored.
- If `tether.active` is false, the whole system is a no-op (one early return).
- Zero player mass guard: `share` is bounded `0<share<1`.

---

## 4. Lunges as impulses + drag event detection

### 4.1 Lunge

The fish AI (§7) sets, during the intent phase:

```ts
fish.vel += pullDir * tuning.pullForce;     // pullDir normalized, away from player (or routed)
fish.vel = clampMagnitude(fish.vel, fish.maxSwimSpeed);
fish.stamina -= fish.lungeStaminaCost * line.exhaustMult;
world.tetherEvents.push({ type: 'lunge', dir: pullDir, force: tuning.pullForce });
```

The impulse lives on `fish.vel` — movement integrates it next, the constraint
sees the resulting overshoot one frame later and converts it into pull
correction + tension (§3 branch 4). This is the entire lunge pipeline; there
is no second velocity system.

### 4.2 Drag detection (spec §4.3: "displacement > 1.5m in a frame window")

A **drag** is the *player* being pulled > 1.5 m by constraint corrections
within a ~0.1 s window. Implementation inside branch 4:

```
drag.accumulated += |player correction|          // metres actually moved this frame
drag.lastDir      = n (dominant pull dir, running average)
if world.time - drag.windowStart > 0.1:
    drag.windowStart = world.time; drag.accumulated = 0   // slide the window
if drag.accumulated > 1.5 && drag.cooldown <= 0:
    push { type:'drag', dir: n, magnitude: drag.accumulated, by:'lunge' }
    drag.accumulated = 0; drag.cooldown = 0.3   // 0.3s until a drag can re-fire
drag.cooldown -= dt
```

A single huge lunge (high `pullForce`, heavy fish) can exceed 1.5 m in one
frame — the window logic treats that as an immediate drag. The 0.3s cooldown
prevents event-spam while a sustained pull still re-fires every ~0.3s.

**Who consumes `drag` events:**
- `waterPhase` — shoreline crossing while tethered → pulled under (§8).
- `render` — camera shake / line thrash (feel).
- `dread` — drag through a hazard feeds Dread (05 hooks; M2 logs it).
- `combat`/trinkets — future "dodge through drag events" (spec 6.4, Spillway)
  hangs off the same event.
- `ui` — a brief "PULLED!" flash so the drag is *legible* (13.1).

---

## 5. Reel, brace, snap, cut, LAND (spec §4.1/§4.2 verbs)

### 5.1 Reel stance (hold RMB)

- Requires an active tether. While `reel.active`: dodge locked, move speed
  50% (`reel.speedMult` read by movement), stamina drains 10/s, and `L`
  shrinks at `line.reelRate` (×2 if the fish is exhausted). See §3 branch 1.
- Input wiring: `input` sets `intent.reelHold`; RMB does nothing outside a
  tether fight.
- 13.1 criterion 3 (reel used *voluntarily*): the reward for mid-fight
  reeling is exhaustion gain at low tension (§6). If playtest shows testers
  only reeling exhausted fish, the fix is *the dial* — raise low-tension
  exhaustion rate, not new code.

### 5.2 Brace (move against the pull)

- §3 branch 4, `brace = 1 - tuning.braceEfficacy * oppose`. Default efficacy
  0.6 = the spec's "reduces displacement 60%".
- Works on land and in the water phase (struggle). No separate button — it's
  just movement input; the discovery question is a playtest criterion, not a
  mechanic.

### 5.3 Snap (tension reaches the ceiling)

When `tension >= line.tensionCeiling`, switch on `line.snap`:

| Behavior | Result |
|---|---|
| `'free'` (base) | line snaps: **lose equipped lure**, catch escapes, player staggered (reuse M1 hit-stun, ~0.3s), `tether.active = false`. Event `snap` with `cause`. |
| `'stun'` (Bellwire, once/fight) | instead of snapping: fish stunned ~2s (loses lunge ability, sways), tension reset to 40. Tether stays. |
| `'damagePlayer'` (Widow's Hair) | at ceiling the player takes damage (~20, direct HP), tension resets to 0. Line never snaps. |

`cause` heuristic (diagnosis aid for 13.1): `'reel'` if `reel.active` at snap,
`'lunge'` if a lunge began within the last 0.5s, else `'greed'` (fought on a
taut line too long — the "should have cut" case). Refine in the feel pass; the
field is what telemetry keys on.

### 5.4 Cut line (hold F 0.5s)

- Always available during a tether fight (and underwater — it's one of the
  three water verbs). Always costs the equipped lure (spec 4.1).
- Hold → `cut.progress` ring on the HUD; release before 0.5s resets. On fire:
  lure lost, fish escapes, tether ends, no loot, no Dread for the catch.
- The *decision* (13.1 criterion 5) is designed, not accidental: cutting
  before a snapped lure costs the lure either way, but cutting early lets you
  re-cast; cutting late is a panic save. Telemetry records tension/time at
  cut so the panel can tell panic from strategy.

### 5.5 LAND prompt

- Eligible when `|d| < 2 && fish.exhausted`. HUD shows the contextual prompt;
  on press → clean catch (Angler profile): tether ends, loot rolls with clean
  multiplier (spec §6.5, ×1.5), bestiary clean-catch credit (04).
- Land is *only* offered to an exhausted fish — the exhaustion telegraph
  (§6) is the thing that tells the player the prompt is coming.

---

## 6. Exhaustion model & Butcher vs Angler

### 6.1 Fish stamina drain sources

| Source | Rate | Notes |
|---|---|---|
| Lunging | `lungeStaminaCost` per lunge × `line.exhaustMult` | Braided Sinew = 1.15 |
| Gaff hit | `gaffExhaustPerHit` (~8, ×2 if rod = Dredger) | hook in 01's `combat.ts` hit application |
| Reeling at low tension | 12/s while `reel.active && tension < 40` | the "reel to exhaust" reward; primary lever for 13.1 criterion 3 |

No regen during a fight — the fight is a pool burn. `fish.stamina` bottoms
out at 0 → `fish.exhausted = true`.

### 6.2 Exhausted telegraph (must READ, spec 13.5)

- `animation` system: sine-spine amplitude ×0.4 (slower, lazier wave) + the
  capsule **belly-tilts** (~20° roll toward its top side) — the "flop" tells.
- `reelRate` ×2, `pullForce` ignored, drag speed halved.
- These run off `fish.exhausted`, so the same telegraph works for the land
  AI later (04).

### 6.3 Kill profiles (spec §4.2)

- **Angler**: `LAND` an exhausted fish → `landed` event → clean loot tier +
  clean-catch bestiary credit.
- **Butcher**: `fish.hp` reaches 0 (01 gaff combat) *before* exhaustion →
  `butchered` event → loot **−1 quality tier**, no clean-catch credit, fish
  flops dead. The catch is still *yours* — you just trashed the payload.
- Both events fire through `tetherEvents`; the loot/credit application is 05's
  job. M2 only produces the events and logs the profile.
- 13.2 (balance): the telemetry tracks per-fight profile and the two must both
  be used within a single session. If Butcher dominates, the lever is the −1
  tier sting or visibility of clean-catch rewards (05); if Angler dominates,
  speed up Butcher. Design stays data-driven.

---

## 7. Fish AI — tethered-fight behavior states (`game/fishAI.ts`)

Runs at the end of the intent phase (before the constraint). FSM over
`orbit / lunge / dive / drag`, plus `exhausted` (terminal-ish). Species bias
comes from `FishTetherStats.patterns`.

| State | Behavior | Ends when |
|---|---|---|
| **orbit** | swim a circle at radius ≈ `L × 0.9` around the player, sine-spine idle; occasional direction flips | bias timer rolls a new state; player reels `L` below orbit radius → drifts closer |
| **lunge** | telegraph (visual flash + `telegraph` event) for `tuning.lungeTelegraph` s, then impulse `pullDir × tuning.pullForce` | impulse fired → cooldown `lungeCooldown` → orbit or drag |
| **dive** | descend (visual: sinks, line angles into the water); mechanically: big tension burst, small pull; costs stamina | tension cap or duration; designed as the *tension* tool, not the displacement tool |
| **drag** | commit to a straight fast swim (`dragSpeed`) for a set distance | distance or stamina budget spent; then orbit |
| **exhausted** | no lunges/drags; slow drift, flop telegraph; can still be reeled | fight ends |

**Transition sketch** (species-weighted):

```
orbit ──weight──▶ lunge | dive | drag        (roll every 1.2–2.5s, weighted by patterns)
lunge ──cooldown──▶ orbit | drag
drag ──budget spent──▶ orbit
any ──stamina 0──▶ exhausted
```

**Lunge direction** (both telegraph and impulse use the same `pullDir`):
- normal fish: mostly *away from the player* with jitter (plays the leash);
  occasionally toward a hazard if one sits in a cone ahead (simple).
- `routedDrag: true` (bosses, Old Pike at M2 debug): pick the hazard that
  maximizes danger — nearest shoreline, kelp/rock polyline, other spawns —
  and *telegraph toward it*, then drag along that route deliberately (spec
  4.2: "Boss fish route their drags deliberately"). This is where the
  "it dragged me into the—" moments come from (13.1 criterion 1).

**Hazard routing query** (interface seam, see §9):
`world.collision.queryHazards(pos, dirCone) → { dir: Vec2; type: 'shoreline' | 'polygon' | 'spawn' } | null`.
For M2 the debug arena provides a shoreline + a couple of rock polygons; the
map worker (03) fills the real queries later. If no hazard exists, drags go
straight with jitter.

**Telegraph** is a hard gate: `tuning.lungeTelegraph` (dial 5) seconds of
pre-warning, visibly telegraphed by the line flash + fish rear-up. The dial
exists because mistimed-lunge is the #1 *illegible* failure in this genre —
the panel will tune it against testers saying "it just yanked me" (13.1).

---

## 8. The water phase (spec §4.5)

`game/waterPhase.ts`. Data:

```ts
interface WaterPhaseState {
  active: boolean;            // submerged, dragged under
  breath: number;             // 15s max, drains underwater
  breathMax: number;          // 15
  drift: Vec2;                // small sinusoidal drift to add to movement
  threatsApproach: boolean;   // true when dread tier >= 3 — spawn system hook
}
```

**Trigger**: a `drag` event carries the player from non-deep into deep water
(`collision.queryShoreline(player.pos) === 'deep'`) while `tether.active` →
`active = true`, `breath = 15`, event `pulledUnder`, and `ui.underwater` set
(render inverts/darkens the screen; that's render's job, we set the flag).
Spec is explicit: wading shallows is normal; *being dragged under* is the
phase.

**Restricted verbs while under** (spec 4.5):
- Allowed: **reel** (hold RMB), **cut** (hold F, costs lure), **struggle**
  (move toward the nearest shoreline — `collision.queryShoreline` gives the
  toward-shore vector).
- Denied: attack, dodge. Movement is damped (`vel × 0.85`/frame) plus `drift`
  — slow and drifty.

**Breath**: drains 1/s from 15. At 0 → drowning HP ramp (e.g. 5/s). Not the
killer by itself (spec: "never fatal by drowning alone") — at Dread tier ≥ 3,
`threatsApproach` flips and the spawn system (03/05) approaches threats. That
is the actual lethal pressure.

**Exit**: reach shallow/land boundary → `active = false`, breath resets to
full, movement back to normal. If the line is cut or the fish is landed while
under, the water phase ends too (you surface, treading water at wade pace).
[Open question: should reeling an exhausted fish *toward* you under the
surface be a slow, deliberate grapple? Tune in feel pass.]

**Testing without maps**: the M2 debug arena defines a hardcoded shoreline
(a circle/rect of 'deep' water) so this phase is testable before 03 ships
real coastlines.

---

## 9. Line rendering (`render/lines.ts` — 01's reserved module)

Consumed by the `render` system; the only render code in this plan. Never
imports game state; takes `world` and builds/updates a `THREE.Line` + glow.

- **Geometry**: quadratic Bézier. `P0` = rod-tip attach point (offset from
  `player.pos` toward the fish), `P2` = fish hook point (offset from
  `fish.pos`). Control point `C = midpoint(P0, P2) + sag × perp`, where:
  - `sag = (1 − tension/100) × kSag` with `kSag ≈ 1.5 m`,
  - `perp` = unit vector perpendicular to the chord in the horizontal plane
    (the "catenary" reads as a sideways droop in top-down, per spec §4.3
    "sagging by (1 − tension/100)").
  - Sag falls to zero at tension 100 (taut) and hangs deepest at tension 0.
- **Colour**: 3-stop lerp by tension — `green(#22c55e) → white → red(#ef4444)`.
  Plus a faint wider under-glow in the same colour so the line stays readable
  over fog and dark water (spec 13.4: the line is the protagonist — it wins
  every priority fight; give it the most contrast in the scene).
- **Dive hook**: when the fish is in `dive`, drop `P2`'s y so the line angles
  down into the water (reads as "it's going deep").
- **Thrash**: during a `drag` event, add a small per-frame perpendicular
  jitter to `C` — cheap, sells the yank.
- Update per frame from `world.tether`/`player`/`fish`; one line + one glow
  mesh, ~2 draw calls. Zero textures, vertex-coloured (spec 8.1).

---

## 10. Debug tuning panel (`ui/debugPanel.ts`)

Exposes **exactly the six dials** from spec 13.1 — no more:

| Dial | Field | Default |
|---|---|---|
| pullForce | `tuning.pullForce` | 4.0 m/s |
| k_tension | `tuning.kTension` | 8.0 |
| slackDecay | `tuning.slackDecay` | 35 /s |
| brace efficacy | `tuning.braceEfficacy` | 0.6 |
| lunge telegraph duration | `tuning.lungeTelegraph` | 0.7 s |
| fish stamina pool | `tuning.fishStaminaPool` | 1.0 |

- Sliders mutate `world.tuning` live; systems read it every frame, so changes
  apply instantly with no restart.
- Live readouts alongside: current `tension`, `L`, fish `stamina %`,
  drag counter, snap/cut/land tallies.
- Persist to `localStorage` (per-run override + a `R` reset key to defaults)
  so playtesters can hand the exact failing dials back.
- Also a coarse FPS/tris/draw-call readout (shares 01's debug overlay).

---

## 11. Playtest instrumentation (`playtest/tetherLog.ts`)

Feeds the 13.1 gate. A per-fight + per-session log, drawn from
`world.tetherEvents` plus per-frame samples, printed to console and
downloadable as JSON (M3+ saves it into the run record).

**Metrics (each maps to a 13.1 pass criterion):**

| Criterion | Instrumented as |
|---|---|
| 1. Emergent story (dragged into the—) | drag events with `magnitude`, hazard type hit, shoreline crossings → the log can literally reconstruct "you got dragged into the kelp". |
| 2. Legible failure causes | snap `cause` breakdown (reel/lunge/greed) + tension-at-snap histogram. If "unknown" dominates, it's a tuning problem in impulse/tension rates. |
| 3. Voluntary reel usage | `reeledMs` per fight, tension-at-reel distribution, whether reels happen pre-exhaustion at low tension (the desired behavior) vs only when exhausted. |
| 4. Brace discoverability | brace factor actually applied (dot of move-dir vs pull-dir when pulled) — did the player oppose pulls without being told? |
| 5. Cut-as-decision | cuts per session, tension-at-cut, time-in-fight-at-cut. A spike at 0.4–0.5s-or-panic-tension = panic button; a spread = decision. |

Plus the 13.2 profile split (landed vs butchered per session — both must
appear for one player in one run) and a "time-to-first-clean-catch" timer
(spec 13.5). The panel prints a one-screen summary at session end that a
tester can answer the five questions against.

---

## 12. Ordered task breakdown (~1–3h each)

All paths relative to the 01 layout. Order matters: each task's acceptance
assumes the previous.

| # | Task | Files | Est | Acceptance |
|---|---|---|---|---|
| T1 | Tether state + constraint core: `TetherState`, `TetherTuning`, `LineStats` defaults, §3 branches 3–6 (constraint math, tension, slack decay, clamp), wired into the reserved slot | `game/tether.ts`, `game/tetherConstraint.ts`, `game/tuning.ts`, `game/line.ts`, `core/world.ts` | 2h | Two entities at fixed L: mass-split proportions correct (heavy fish pulls player most), tension rises on overshoot, decays on slack, clamps 0–ceiling, no oscillation at rest, no-op when inactive |
| T2 | Reel stance: RMB hold, L shrink at reelRate, dodge lock, 50% move, 10 stamina/s drain | `game/tetherConstraint.ts`, `game/controller.ts`, `game/intent.ts`, `game/stamina.ts` | 1h | Rates match spec; reeling at 0 stamina stops; dodge suppressed; L never below fish radius |
| T3 | Lunge impulses + drag detection: §4 pipeline + drag event window/cooldown | `game/fishAI.ts`, `game/tetherConstraint.ts` | 2h | Lunge impulse converts to pull correction; drag fires >1.5m/window; 0.3s cooldown; events observable |
| T4 | Brace: dot-product efficacy, dial 4 | `game/tetherConstraint.ts` | 1h | Moving into pull reduces displacement 60% at dial 0.6; dial scales it live |
| T5 | Snap + cut: snap switch (free/stun/damagePlayer), stagger, cause heuristic; hold-F 0.5s with progress ring, lure cost | `game/tetherConstraint.ts`, `game/combat.ts`, `ui/tetherHud.ts` | 2h | Snap frees catch + loses lure; Bellwire stuns once; Widow's Hair damages player; cut costs lure, progress resets on release |
| T6 | Exhaustion + LAND: §6 drain sources, exhausted telegraph via `animation` (amplitude 0.4 + belly-tilt), reel ×2, LAND prompt | `game/fish.ts`, `game/combat.ts`, `game/tetherConstraint.ts`, `game/animation.ts`, `ui/tetherHud.ts` | 2h | Exhaustion readable at a glance; exhausted fish reeled fast, can't lunge; LAND fires <2m && exhausted; clean-catch path |
| T7 | Kill profiles: `landed` vs `butchered` events, −1 tier tag on butchered | `game/tetherConstraint.ts`, `game/combat.ts` | 1h | HP-kill before exhaustion → butchered; both profiles emit distinct events with correct flags |
| T8 | Fish AI FSM: orbit/lunge/dive/drag + telegraph gate + weighted transitions + hazard routing query (debug arena shoreline/rocks) | `game/fishAI.ts`, `core/world.ts` (hazard seam) | 3h | Telegraph precedes lunge by the dial; drags route to hazards when `routedDrag`; species bias shifts behavior mix |
| T9 | Water phase: trigger on drag-into-deep, 15s breath, restricted verbs, drift, struggle-to-shore, `ui.underwater` flag, drowning ramp + `threatsApproach` hook | `game/waterPhase.ts`, `game/tetherConstraint.ts`, `game/controller.ts`, `ui/tetherHud.ts` | 3h | Dragged past shoreline while tethered → under; only reel/cut/struggle work; breath drains/resets; screen inversion flag toggles |
| T10 | Line render: §9 quadratic Bézier + sag + 3-stop colour + glow + dive/thrash hooks | `render/lines.ts` | 2h | Sag deep at 0 tension, taut at 100; colour lerp correct; readable over fog; ≤2 draw calls |
| T11 | Debug panel + instrumentation: six dials live + readouts + localStorage; per-fight/session log + summary screen | `ui/debugPanel.ts`, `playtest/tetherLog.ts` | 2h | All six dials change behavior live; log reconstructs fights; 13.1 summary screen prints |
| T12 | **M2 gate — the fun-or-dead pass**: grey capsule fish, empty arena, all dials wired; playtest hard, tune dials, verify all 13.1 criteria + 13.2 profile split + 13.5 clean-catch timer | `tuning` defaults, `playtest/tetherLog.ts` | 3h | First-time tester retells a drag moment unprompted; failure causes legible; reel used voluntarily pre-exhaustion; brace discovered; cut is a decision ≥once/session; both kill profiles in one session |
| T13 | **Generic anchor refactor (Addendum §A.2–A.3):** `Anchor`/`TetherEndpoint`/`ReelSource`/`CutCost`, `TetherState.fights[]` (single element for M2), generalized mass-split + per-endpoint brace, `startTetherFight(species, anchor, opts?)` + `enterWaterPhase({breathSec, occupied, sinkingHaul?})` APIs, fixed-point mass guard | `game/tether.ts`, `game/tetherConstraint.ts`, `core/world.ts` | 2h | Player-vs-fish is byte-identical to pre-refactor (T1–T12 acceptance passes untouched); `anchor: 'boat'`, reverse, and snatch constructions type-check and run as the §A.3 special cases; 03's boat stub can call the API against a real signature |
| T14 | **Extended event union (Addendum §A.6):** tag existing events with `fightId`/`anchor`/`side`, add the boat/reverse/snatch/water variants as data (no producers yet), `toRunKinds()` mapping for 03's run reducer | `game/tether.ts`, `core/world.ts` | 1h | Union compiles; audio (05 §5.1), Dread, UI, and 03's reducer can subscribe to the full stream from day one |

Budget: 13 implementation tasks ≈ **25h** + the T12 gate. Everything past T1
is incremental feel layers on the one constraint system; T13 is the one cheap
structural refactor (generic anchors) that unblocks the sibling plans' contracts
(03 §0 boat anchor, 05 §0 reverse-tether / third-entity) — see Addendum §A.7
for the deferral flags on T15–T17.

---

## 13. Interfaces consumed & reserved

**Consumed from 01 (assume present):** `WorldState`, `SystemFn`, the
`tetherConstraint` slot, `render/lines.ts` module, fixed `DT=1/60`, player
`stamina` pool, dodge lock, gaff hit application (for exhaustion), fish `hp`,
animation sine params, camera/lantern.

**Reserved for others (do not build, keep seams open):**
- `world.collision` query surface: `queryShoreline(pos) → 'land'|'wade'|'deep'`
  and `queryHazards(pos, dirCone) → {dir, type}` — 03 fills real coastlines
  and hazards; M2 ships a debug arena standing in.
- `ui.underwater` flag + `world.tetherEvents` — render/audio read them;
  the screen-invert/post effect is 01's render job, not here.
- `landed`/`butchered`/`snap` events — 05 applies loot tiers, Dread, and
  bestiary credit.
- `tension` value is exposed (in `tether.tension`) for the Tone.js
  tension-creak sonification (spec §11) — audio worker's, not mine.

---

## 14. Risks & open questions

- **Oscillation / stiffness at high `k_tension`**: the plain Euler sketch can
  jitter if tension gain is too high or `dt` coarse. Mitigation: the fixed 1/60
  step, the dial itself, and if it still oscillates, fold half the excess into
  `vel` (damped correction) rather than teleporting `pos`. Flag early in T1.
- **One-frame correction lag**: lunge impulses land as pulls one frame later.
  At 60Hz this is 16ms — imperceptible; but if playtest disagrees, move
  `tetherConstraint` after `movement` (a one-line order change) — decision
  owned by the T12 pass, not default.
- **Brace discoverability is not guaranteed by the mechanic** (13.1 #4): the
  dial exists precisely to test it; if testers never oppose pulls, consider a
  tiny impulse-reduction cue (screen-space pull arrow) before adding a
  tutorial.
- **Water-phase false positives**: wading is normal; only drag-into-deep while
  tethered triggers the phase. Needs the shoreline query's 'deep' test to be
  crisp — verify with the debug arena before 03 lands.
- **The line must outread everything** (13.4): if drag telegraphs + tension
  colour + water darkening collide visually, the line keeps highest contrast.
  If still muddy, reduce drag-telegraph brightness, never the line's.
- **Cut-as-decision instrumentation noise**: panic-cuts and strategy-cuts both
  log as `cut`; the tension/time features disambiguate. Revisit the heuristic
  after the first playtest batch.

---

## Summary (5 lines)

- The tether is one pure `tetherConstraint` system in the reserved slot
  (after intent, before movement) implementing the spec §4.3 sketch directly —
  mass-split position correction, tension from real overshoot, slack decay,
  all six dials read live from a single `tuning` struct.
- Lunges are velocity impulses set by a separate tethered-fight `fishAI`
  (orbit/lunge/dive/drag, telegraphed by dial 5, deliberate hazard routing);
  drags fire when constraint displacement exceeds 1.5m in a 0.1s window.
- Reel/brace/snap/cut/LAND/exhaustion and Butcher-vs-Angler hang off that one
  system, with exhaustion telegraphing via the sine-spine amplitude + belly
  tilt and clean-catch vs −1-tier loot signalling through typed tether events.
- The water phase triggers on drag-past-shoreline (15s breath, restricted
  verbs, screen inversion) and the line renders as a tension-sagged quadratic
  Bézier in green→white→red, all testable in a debug arena with a hardcoded
  shoreline before real maps exist.
- Thirteen ~1–3h tasks (T1–T12 + the Addendum's T13/T14) end in the T12
  fun-or-dead gate that checks the 13.1
  criteria against the instrumentation log — the six dials and the log are
  built from day one, so "is this fun yet" is answered with data, not vibes.

---

## Addendum: Generalized anchors, reverse tether, third parties, and the event stream

*Added after the M2 slice shipped its shape, to cover the contracts 03 and 05
declare against the tether. The whole addendum reads as one rule: the constraint
was always two endpoints and a distance; "player" and "fish" were just the first
two endpoints it met. Generalize the data, keep the math, defer every new
behavior to the milestone that owns it.*

### A.1 The three contracts this addendum serves

| Contract | Source | What it needs from the tether |
|---|---|---|
| Boat combat | 03 §0, §6 | `startTetherFight(species, anchor: 'player'\|'boat', opts?)`; the winch post is the reel source, the cleat cut costs a hull segment, `enterWaterPhase({breathSec, occupied, sinkingHaul?})`, and the same `landed/cut/pulledIn` events at boat scale |
| Reverse tether | 05 §0, zone 3 (Postmaster), Choir (Whistler) | the non-player entity owns the line and reels; the player cannot reel, and cuts via a contextual action, not the F-ring |
| Third entity on the line | 05 §0, zone 3 (Snatchers) | a second constraint sharing the catch endpoint, plus a steal timer |
| Event stream | 05 §5 (audio), 03 §3.2 (run reducer) | tension/snap/cut/land/drag as typed, anchor-tagged events |

None of these need new physics. Each needs the data shape to stop assuming the
two endpoints are "the player" and "a fish".

### A.2 The generic anchor shape

Refactor of §2.1. What §2.1 called `TetherState` (one player↔fish fight) becomes
`TetherFight`; `world.tether` becomes a container of fights. The single-fight M2
behavior is unchanged — M2 just always has `fights.length === 1`.

```ts
// game/tether.ts
type Anchor =
  | { kind: 'entity'; entityId: EntityId }  // player, catch, Snatcher, Postmaster, Whistler
  | { kind: 'boat' }                         // reads world.boat.pos/heading (t1/t3 state)
  | { kind: 'fixed'; point: Vec2 };          // Longliner trap-line, Postmaster's shelf, shore

type ReelSource =
  | { kind: 'player-stance' }   // hold RMB — the M2 default
  | { kind: 'winch-post' }      // boat fight: reel only while at the post (03 §6.1)
  | { kind: 'ai' }              // reverse/snatch: the enemy reels (05 §0)
  | { kind: 'none' };           // this end never reels

type CutCost =
  | { kind: 'lure' }            // M2 default: F-cut costs the equipped lure
  | { kind: 'hull-segment' }    // boat fight: cleat cut costs a hull segment (03 §6.1)
  | { kind: 'contextual' }      // reverse: close-range action, no item cost (05 zone 3)
  | { kind: 'none' };           // this end can never cut the line

interface TetherEndpoint {
  anchor: Anchor;
  owner: 'player' | 'enemy' | 'third' | 'world';  // drives brace, events, verb gating
  mass: number;                 // correction split (spec §4.3); player = 1.0
  radius: number;               // hook radius — L floor for this end
  reel: ReelSource;
  cut: CutCost;
}

interface TetherFight {         // was TetherState (§2.1)
  id: number;
  a: TetherEndpoint;
  b: TetherEndpoint;
  L: number;
  tension: number;
  reel: ReelState;
  cut: CutState;
  land: LandState;              // evaluated on the primary fight only (player-vs-fish)
  snap: SnapState;
  drag: DragState;
}

interface TetherState {
  fights: TetherFight[];        // [0] = the primary line; rest = Snatcher grabs /
                                // Longliner trap-lines — appended in id order, deterministic
}

// The sibling-facing API (03 §0):
function startTetherFight(
  species: SpeciesId,
  anchor: 'player' | 'boat',
  opts?: Partial<{ a: TetherEndpoint; b: TetherEndpoint; L: number }>,
): void
function enterWaterPhase(opts: { breathSec: number; occupied: boolean; sinkingHaul?: boolean }): void
```

Conventions that keep it deterministic (spec §8.3) and readable:

- `startTetherFight(species, 'player')` builds the M2 default endpoints: `a` =
  player entity (mass 1, owner `'player'`, reel `player-stance`, cut `lure`), `b`
  = the catch from `FishStats` (mass, owner `'enemy'`, reel `none`, cut `none`).
- `fights[]` is iterated in fixed id order (primary first, then secondaries) —
  the shared-endpoint case (§A.5) sums corrections in that order, so a replay
  reproduces it. This is the same array the Longliner (§2.1, spec §6.1) was
  always going to need.
- `{ kind: 'fixed' }` is `mass = ∞`: `shareA → 0`, the fixed end never moves. The
  existing §3 guard (`0 < share < 1`) already covers it.
- `render/lines.ts` (§9) renders every fight in `fights[]` — M2 one, boat one
  (winch-post attach point), reverse one (boss→player). Same Bézier, endpoints
  supplied per fight.

### A.3 The existing math is the special case

§3 branch 4 with the endpoints generalised (the brace term moves onto whichever
endpoint is the player, opposed to that end's own pull direction):

```
d    = b.pos - a.pos
len  = |d|
if len > L:
  n      = d / len                        // from a toward b
  excess = len - L
  shareA = b.mass / (a.mass + b.mass)     // fraction of the excess A absorbs
  braceA = a.owner === 'player'
         ? 1 - tuning.braceEfficacy * max(0, dot(player.intent.moveDir,  n)) : 1
  braceB = b.owner === 'player'
         ? 1 - tuning.braceEfficacy * max(0, dot(player.intent.moveDir, -n)) : 1
  a.pos += n * excess * shareA * braceA
  b.pos -= n * excess * (1 - shareA) * braceB
  tension += excess * tuning.kTension * dt
else:
  tension -= tuning.slackDecay * dt
tension = clamp(tension, 0, line.tensionCeiling)
```

| Fight | a | b | Reduces to |
|---|---|---|---|
| player-vs-fish (M2 default) | player, mass 1, owner `'player'`, reel `player-stance`, cut `lure` | catch, `mass = FishStats.mass`, owner `'enemy'`, reel `none`, cut `none` | byte-identical to §3 branch 4: `braceB = 1`, `shareA = fishMass/(fishMass+1)`, `braceA` = the original `brace` |
| boat (03) | boat, mass ~6, owner `'world'`, reel `winch-post`, cut `hull-segment` | dragger, mass ~8, owner `'enemy'` | `braceA = 1` (the boat isn't the player; deck bracing is 03's tilt), the boat absorbs the drag → yaw toward the route |
| reverse (05) | Postmaster/Whistler, mass ~4, owner `'enemy'`, reel `ai`, cut `none` | player, mass 1, owner `'player'`, reel `none`, cut `contextual` | `shareA` small → the player absorbs nearly all excess; `braceB` opposes `−n` (walking away from the reeler) |
| snatch (05) | Snatcher, mass ~0.6, owner `'third'`, reel `ai`, cut `none` | **the shared catch endpoint** | the catch accumulates this fight's correction on top of the primary's |

**Reel** (§3 branch 1) gains one resolution line before the unchanged body:

```
1. REEL — per fight, resolve the hold flag:
     hold = a.reel.kind === 'player-stance' ? intent.reelHold
          : a.reel.kind === 'winch-post'    ? world.boat.atWinchPost  // 03 fills
          : a.reel.kind === 'ai'            ? aiReelIntent(fight, world)  // 05 fills; M2 stub = false
          : false
   ... rest of the M2 branch is identical. In reverse/snatch the 'player.stamina'
   gate does not apply to an AI reel — the enemy burns its own reel budget (05 dial);
   the player's reel input is ignored while a.reel.kind === 'ai'.
```

**Cut** (§3 branch 2) resolves *cost* at fire time instead of assuming the lure:

```
2. CUT — the F-ring is unchanged; what it costs depends on the fight:
     player-vs-fish: 'lure' (M2, unchanged)
     boat:           'hull-segment' — F at the cleat (03 fills boat.atCleat)
     reverse:        F does nothing; the line is cut by a proximity action
                     emitting bossLineCut (the fight's win condition, 05 zone 3)
```

### A.4 Reverse tether — the same constraint, the AI holds the reel intent

Deferred to M7/M8 (Postmaster, Whistler); M2 only guarantees the shape.

- Constructed via `startTetherFight(species, 'player', opts)` with `b.owner =
  'player'`: the player is the *caught* endpoint and the boss owns the line. No
  polarity inversion in the constraint — polarity *is* the endpoint assignment.
- The AI's reel intent (`aiReelIntent`) is a callback the boss FSM drives (05
  owns the delivery-line telegraphs: "SPECIAL DELIVERY.", "RETURN TO SENDER.",
  "SIGN HERE."); each reel burst routes a drag toward a hazard the same way §7
  routes a `routedDrag`. The constraint, tension, and correction code are
  untouched.
- Player verbs in reverse: **move/brace** (walk away from the pull), **gaff**
  (interrupts the boss's reel — reuse M1 stun; reeling pauses for its duration),
  **dodge**, and the **contextual line-cut** at close range. Reel stance input is
  ignored — there is nothing to reel.
- Tension semantics flip: rising tension = being hauled toward the boss/route.
  A `snap` at the ceiling in reverse means **delivered** — the route completes
  (hazard impact, flooded doorway → water phase, out of the Whistler's lantern
  radius). Emitted as `delivered`, never the player's `snap`/`landed`.
- LAND is not a reverse verb: `land.eligible` is skipped when `b.owner ===
  'player'`. 05 §9's fallback ("boss reels via reeling-impulse emulation") is
  retired — polarity is now a data flip.

### A.5 The Snatcher third-entity attachment — a second constraint on the shared catch

Deferred to M7 (Snatchers active at Dread tier 3 / Township); M2 guarantees the
multi-fight array.

- When a Snatcher latches onto your hooked catch, tether appends a `TetherFight
  { a: Snatcher endpoint (owner 'third', reel 'ai', cut 'none'), b: <the SAME
  catch endpoint> }`. The shared endpoint sums both fights' corrections in fixed
  id order (primary first) — determinism preserved.
- **Steal timer**: a per-grab countdown (~4s, a 05 dial). While it runs the
  Snatcher's `ai` reel pulls the catch toward itself at a modest rate; the catch
  stays on the player's primary line until the timer completes.
- Resolution:
  - Snatcher dies → secondary fight removed, `gripBroken`, catch stays on the
    primary line (tension/L untouched).
  - Timer completes → `catchStolen`, primary fight ends, **no loot**, the
    Snatcher swims off with the catch.
- Existing content interplay: Mirror Minnow (spec §6.3) rewires the grab target
  via `tether.grab(target: EntityId)` (the clone screams when eaten). The
  Congregation (05 zone 2) stays a single primary fight — its mass pool already
  scales `pullForce`, so no third party is needed. The Longliner (spec §6.1)
  reuses `fights[]`; 05's "hard-error on >1 constraint" placeholder becomes
  "allow >1 only for snatch/longliner, else warn".

### A.6 The event stream, extended (audio / dread / UI / run reducer)

§2.5's union grows: the M2 variants gain `fightId`/`anchor`/`side` tags, and the
new variants are declared as data from day one (nothing produces them until their
milestone). One stream, many subscribers:

```ts
type TetherEvent =
  | { type: 'drag';        fightId: number; anchor: 'player' | 'boat'; dir: Vec2; magnitude: number; by: 'lunge' | 'dive' }
  | { type: 'telegraph';   fightId: number; dir: Vec2; kind: 'lunge' | 'drag' }
  | { type: 'lunge';       fightId: number; dir: Vec2; force: number }
  | { type: 'snap';        fightId: number; cause: 'reel' | 'lunge' | 'greed' | 'delivered'; lineId: string; side: 'player' | 'enemy' }
  | { type: 'cut';         fightId: number; lineId: string; cost: 'lure' | 'hull-segment' | 'contextual' }
  | { type: 'landed';      clean: true }
  | { type: 'butchered';   lineId: string }
  | { type: 'pulledUnder'; breathSec: number; occupied: boolean; sinkingHaul?: boolean }
  | { type: 'reeledMs';    ms: number }                              // instrumentation
  | { type: 'boatHooked';      draggerId: EntityId }
  | { type: 'hullHit';         segments: number; hp: number }
  | { type: 'swamped';         sinkingHaul: boolean }
  | { type: 'delivered';       by: 'postmaster' | 'whistler' | 'dragger' }
  | { type: 'bossLineCut' }
  | { type: 'snatcherAttached';  target: EntityId }
  | { type: 'gripBroken' }
  | { type: 'catchStolen';       species: SpeciesId }
  | { type: 'enterWaterPhase';   breathSec: number; occupied: boolean; sinkingHaul?: boolean };
```

| Event | Audio (05 §5) | Dread (spec §5) | UI |
|---|---|---|---|
| `drag` | tension-string creak → scratch while hauled (boat: deeper creak) | drag through hazard feeds Dread | "PULLED!" flash |
| `lunge` / `telegraph` | whoosh on telegraph; string up-bend | — | line flash / rear-up |
| `snap` | string snap (reverse `side` → reversed pitch) | log snap cause | tension HUD reset |
| `cut` | clean snip (hull-segment: wood crack + splash) | — | ring clear |
| `landed` / `butchered` | music-box phrase (+1 wrong note per zone) | +4–12 by tier | loot roll |
| `pulledUnder` / `enterWaterPhase` | drone drop + heartbeat speed | occupied flag | screen inversion |
| `boatHooked` / `hullHit` / `swamped` | low horn / hull groan / submerge | +12 (landing a Dragger) | hull bar, tilt |
| `delivered` | boss sting → silence | large + | "DELIVERED" slate |
| `snatcherAttached` / `gripBroken` / `catchStolen` | thud / rip / comedown sting | +5 if stolen | steal ring |

Run-reducer mapping for 03 §3.2 (via `toRunKinds(ev)`): `tether/landed ← landed`,
`tether/cut ← cut`, `tether/snapped ← snap`, `tether/pulledIn ← pulledUnder`.
Audio (05 §5.1) subscribes to the union directly — no per-worker re-types.

### A.7 Tasks added to the M2 breakdown, and what defers

Two cheap tasks land **in M2** (rows already added to §12): T13 (generic anchor
refactor, ~2h) and T14 (extended event union + `toRunKinds`, ~1h). They unblock
03's §12 risk #1 and 05's §9 risks #1–#2 by making the interfaces real instead
of contract prose.

Three behavior tasks are **deferred to their owning milestones** and are NOT part
of the M2 budget:

| # | Task | Consumes | Owned by |
|---|---|---|---|
| T15 | Boat-scale behaviors: `winch-post` reel source, `hull-segment` cleat cut, Dragger yaw-lunges, `swamped`/`sinkingHaul` water phase | §A.2 endpoints | 03 task 9 (boat combat core) |
| T16 | Reverse tether: `aiReelIntent` callback, contextual cut action, `delivered` snap, per-kind tension semantics | §A.2, §A.4 | 05 zone 3 (Postmaster), Choir (Whistler) |
| T17 | Snatcher third-entity: second constraint on the shared catch, steal timer, `tether.grab(target)` for Mirror Minnow | §A.2, §A.5 | 05 zone 3 (Snatcher pressure) |

Orchestrator rule of thumb: if a milestone needs a new *behavior*, it is a 05/03
task on top of the M2 API — never a change to §A.2. The shape is built now,
cheaply; the behaviors are built where the content is.

### Addendum summary (5 lines)

- The tether refactors to two generic `TetherEndpoint`s (entity | boat | fixed)
  per `TetherFight`, with per-endpoint mass, reel source, and cut cost; the
  player-vs-fish fight is the default special case and is byte-identical after
  the refactor.
- Reverse tether is the same constraint with the AI holding the reel intent
  (`reelSource: 'ai'`) and the player reduced to brace/gaff/contextual cut —
  `snap` in reverse means `delivered`, and 05's reeling-impulse fallback is
  retired.
- Snatchers are a second `TetherFight` sharing the catch endpoint plus a steal
  timer; `fights[]` doubles as the Longliner container and iterates in fixed
  deterministic order.
- The `TetherEvent` union is extended with fight/anchor/side tags and the
  boat/reverse/snatch/water variants, so audio (05), Dread, UI, and 03's run
  reducer subscribe to one stream (`toRunKinds` maps to 03's `tether/*` kinds).
- M2 grows by two cheap tasks (T13 anchors ≈2h, T14 events ≈1h → 13 tasks
  ≈25h); boat (T15), reverse (T16), and snatcher (T17) behaviors defer to 03/05,
  which now consume a shape instead of blocking on one.
