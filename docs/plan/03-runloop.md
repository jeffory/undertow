# UNDERTOW — Implementation Plan: The Run Loop (M3) + Night Clock + Boat Combat

**Owner:** t3 · **Milestone:** M3 *The Loop*, plus Night Clock (§3.2) and boat combat (§3.3).
**Base spec:** `plan.md` §3.1, §3.2, §3.3, §5, §6.5, §8.3, §9 (retention spine), §13.5.
**Companion plans:** `docs/plan/01-foundation.md` (M0/M1, t1) · `docs/plan/02-tether.md` (M2, t2).

This plan implements the *shell* of a run: a generated lake, a clock, an economy of
tension (Dread), a way in (cast/bite), a way out (extract/die), and the night that
turns the boat into a battleground. The tether fight itself, the fish meshes, and the
hub/meta town are owned by other workers; I define the interfaces I consume from them
and the contracts they must satisfy for this system to function.

---

## 0. Ownership boundaries & required interfaces

### In scope (this plan)
- Seeded determinism (PCG32, split streams, seed-on-death, daily-lake).
- Procedural surface map (islet graph, polygons, wrecks, sinkholes, micro-event, buoys).
- Cast/bite flow (disturbances, SET/RELEASE).
- Dread economy (0–100, tiers, gains/reductions, building-driven starting Dread).
- Night Clock (4 phases, phase effects, non-resetting on descent).
- Boat combat (Draggers, hull, winch, cleat-cut, swamping, upgrade hooks).
- Extraction / death / Memories conversion / run summary.
- Saves (IndexedDB, versioned, zod, JSON export/import).
- Spawn director (guarantees, budgets per tier & phase).

### Out of scope (owned by others) — interfaces I require
| System | Worker | Interface I consume |
|---|---|---|
| ECS-lite `World` container, system signature, update order, rendering, water, fog, camera, boat rowing controller, on-foot controller, collision | t1 (01-foundation) | `World` type; system `(w, dt, input) => w`; `w.lake` slot I fill; collision consumes `lake.islets[].poly`; `w.boat` (position/state) so I can attach boat combat; `w.renderHooks` for fog/beam visuals. |
| Tether constraint, reel/brace, land/cut/snap, water phase, drag events, debug dials | t2 (02-tether) | `startTetherFight(species: SpeciesId, anchor: 'player'\|'boat', opts?)`; events `{landed, cut, snapped, pulledIn}`; `enterWaterPhase({breathSec, occupied, sinkingHaul?})`; **generic anchor** so tether can attach to the *boat* as well as the player. |
| Procedural fish mesh / species content | M4 (12-fish/zone content worker) | `SpeciesDef` table (see §4.4) — I only need tier/rarity/weight/struggle/eligibility for M3; content fills out later. |
| Hub/meta town, Memories currency spend, license, buildings, rod/lure/trinket items, Bagman loot table | M5 (05-town) | `meta.state` (memories, license.xp/grade, buildings restored, `runsCompleted`, `bagmanSeen`); consumes `RunResult` (§8). |
| Procedural audio | — | Listen to `w.clock.phase`, `w.dread.tier` for drone/heartbeat; no data dependency. |

**Contract to t2 (important):** boat combat reuses the tether constraint *at boat scale*
(§3.3). The tether system must expose the anchor as a parameter — `anchor = 'player'`
for normal fights, `anchor = 'boat'` for Draggers — and fire the same `landed/cut/pulledIn`
events regardless of anchor. If t2 ships player-only anchoring, I will fall back to a
stub boat fight (winch is a timed hold on a moving target) behind the same interface.

---

## 1. Seeded determinism — PCG32 with split streams

Spec §8.3: *"seeded PCG32 per run (split streams: layout / loot / AI). Seed shown on
death screen; shareable 'daily lake' is a free feature later."*

### 1.1 RNG core — `src/rng/pcg32.ts`
- Implement **PCG-XSH-RR (pcg32)**: 64-bit internal state + 64-bit increment; output 32 bits.
  ~120 lines, no dependencies, deterministic across platforms if we never use JS floats in
  the *state* path (state arithmetic is all `Math.imul`/`>>>` on u32).
- Surface:
  ```ts
  type StreamId = 0 | 1 | 2;   // LAYOUT, LOOT, AI
  class Rng {
    nextU32(): number;
    nextF32(): number;              // [0, 1)
    range(a: number, b: number): number;   // [a, b)
    int(a: number, b: number): number;     // inclusive int
    chance(p: number): boolean;
    pick<T>(arr: T[]): T;
    shuffle<T>(arr: T[]): T[];
    fork(salt: number): Rng;        // derive a child stream without touching parent
  }
  ```

### 1.2 Stream derivation — `src/rng/streams.ts`
- `deriveState(runSeed: number, streamId: StreamId, salt = 0): [u32, u32, u32, u32]` —
  run `splitmix64(runSeed)` once, then mix in `streamId` and `salt` to produce the pcg
  state/inc. This guarantees the three streams are *independent* (a bad seed in one does
  not propagate) and reproducible from the single 32-bit run seed.
- `createRng(runSeed, streamId): Rng` — used by:
  - **layout** → surface map generation (§2). Runs once at run start.
  - **loot** → disturbance species rolls, loot rarity rolls, Memories variance, Bagman
    rolls. Player-independent.
  - **ai** → spawn director ambush choices, enemy behavior seeds (handed to t2's fish
    params), Dragger targeting, Whistler roaming. Player-independent.

### 1.3 Run seed lifecycle
```ts
interface RunSeed {
  runSeed: number;          // 32-bit
  source: 'random' | 'daily' | 'input';
  daily?: string;           // yyyy-mm-dd when source === 'daily'
}
```
- **Random:** `(Math.random() * 2**32) >>> 0` at run start (the only non-deterministic step).
- **Daily lake:** `dailySeed(dateStr) = splitmix64(crc32('undertow:' + dateStr)) & 0xffffffff`.
  The whole map + spawn schedules regenerate deterministically from this seed, so a
  shared date string reproduces the identical lake — the "free feature later" costs
  nothing at design time.
- **Seed on death screen:** death/run-summary UI shows `RunSeed` in a copyable format
  (`undertow-<seed>-<date>`); paste-as-input replays the exact same map/schedules.

### 1.4 Acceptance criteria
- [ ] Same `runSeed` + same player decisions → identical map, spawns, and loot rolls
      (verified by a headless determinism test: run lakegen + spawnDirector twice, diff outputs).
- [ ] Changing one stream's salt does not disturb the others' first 1000 outputs.
- [ ] Death screen prints a seed that, entered as input, regenerates the identical lake.

---

## 2. Procedural surface map

Spec §3.1 & §7: *"surface maps are seeded per run: islet graph via Poisson-disc + Delaunay
pathing; disturbances, sinkholes, and one micro-event placed per map."*

### 2.1 Pipeline — `src/lake/mapgen.ts`
```
runSeed
  → lakeBounds (fixed: 2200 × 2200 world units, generous margin outside play area)
  → STEP 1 poissonDisc(seed=layout): islet centers  (§2.2)
  → STEP 2 delaunay(centers): graph edges             (§2.3)
  → STEP 3 isletPolygon(center): walkable polys       (§2.4)
  → STEP 4 placements(layout): wrecks / sinkholes / micro-event / buoys  (§2.5)
  → STEP 5 disturbanceSpawns: initial disturbance list (§9)
  → LakeMap
```

### 2.2 Poisson-disc sampling — `src/lake/poisson.ts`
- Grid-based fast Poisson-disc (Bridson): cell size `r/√2`, radius `r = 130` world units,
  `k = 30` candidates per point. Bounded to `lakeBounds`, min distance enforced to the
  edge. Target **9–14 islets** (tune `r`; the map should read as an archipelago, not a city).
- Start islet: force one point near a fixed anchor edge (the lighthouse side) so the
  first row-out is always short; `lake.startIslet = that index`.
- Sinkhole islets: the 1–2 samples *furthest* (graph distance, not euclidean) from the
  start get tagged `hasSinkhole` — descending should feel like a journey to the edge.

### 2.3 Delaunay pathing — `src/lake/delaunay.ts`
- Bowyer–Watson incremental Delaunay (~180 lines). Four **super-triangle** points placed
  outside `lakeBounds` so every islet center is inside the convex hull; drop super-triangle
  edges at the end. Output: triangle list → dedupe to edge set.
- **Graph pruning:** keep the Delaunay edge set but drop edges longer than `maxEdge =
  420` units. The result is a sparse, connected, planar path graph (boat fast-travel
  follows it). Delaunay guarantees the graph is connected over the convex hull; with
  super-triangle points at the bounds this always holds.
- Boat fast-travel (`§3.1` "boat = fast travel between islets"): the boat moves along a
  BFS path over `graph.edges` to the selected islet, arriving in 4–8s. Held by t1's
  boat controller; I supply the path and the travel waypoints.

### 2.4 Islet polygons — `src/lake/isletgen.ts`
- Each islet: `n = int(6, 12)` vertices, base radius `range(16, 34)`, per-vertex radius
  jitter `×range(0.75, 1.3)`, vertices ordered by angle, then one smoothing pass
  (average adjacent radii). Result is a simple, near-convex polygon (collision uses the
  convex hull approximation for stability — t1 collision consumes `Islet.poly`).
- Mark `walkable` islets (most) vs `rock` islets (1–2 pure obstacles, no disturbance
  anchors, still graph nodes so routes route around them).
- Zone flavor: `elevation`/fog density per zone is M4's render concern; I only emit
  `islet.zone = 0` for M3 (Shallows-only surface). The generator takes `zone` as an input
  so zones 2–5 reuse it unchanged.

### 2.5 Placements — `src/lake/placements.ts`
```ts
interface LakeMap {
  seed: number;
  bounds: { w: number; h: number };
  startIslet: number;
  islets: Islet[];                        // index = id
  graph: { edges: Array<[number, number]> };
  wrecks: Wreck[];
  sinkholes: Sinkhole[];
  microEvent: MicroEvent;
  buoys: Buoy[];
  disturbanceSpawns: DisturbanceSpawn[];  // initial; director refills during play
}
interface Islet {
  id: number; center: Vec2; poly: Vec2[];
  baseRadius: number; kind: 'walkable' | 'rock';
  zone: number; features: IsletFeature[]; // rock/reeds/barnacle clusters (env, M4 renders)
}
interface Wreck  { id: number; pos: Vec2; kind: 'hull' | 'jetty' | 'steamer';
                   zone: number; anchorIslet?: number; }
interface Sinkhole { id: number; pos: Vec2; zoneFrom: number; zoneTo: number; }
interface Buoy     { id: number; pos: Vec2; primary: boolean; submerged: boolean; }
type MicroEvent = { kind: 'wreck';   wreck: Wreck }
               | { kind: 'shrine';   pos: Vec2; buff: ShrineBuff }   // +stamina, +breath, tension gift
               | { kind: 'bottle';   pos: Vec2; text: string; isMarenBreadcrumb: boolean };
```
- **Wrecks:** 2–3. Anchored just off an islet's shore (or mid-water for the 'steamer').
  Each carries a `lootTier`; some are pre-tagged as the **marked wreck** for a future
  Office Contract (§6.7 — slot now, contract system later).
- **Sinkholes:** 1 (Shallows), 2 in later zones. Positioned at the far islets from §2.2,
  each stores `zoneTo = zoneFrom + 1`. **Descending sets `dread.zoneFloor` (§5) and does
  NOT touch the Night Clock (§3.3).**
- **Micro-event (exactly one per map):** pick `wreck | shrine | bottleNote` via layout
  stream; if `bottleNote`, roll from the bottle-note table (content worker owns the table;
  I own placement). Chance of a Maren breadcrumb artifact per zone rules (M4/M5 owns the
  artifact list; I just place a flagged container).
- **Buoys:** 2. `primary` near start (submerges *last* at false dawn — §3.3); `secondary`
  mid-map (submerges *first*). Extraction = interact with a non-submerged buoy.

### 2.6 Acceptance criteria
- [ ] `lakegen(runSeed)` is deterministic (diff test, §1.4).
- [ ] Islet graph is connected, planar-looking, and boat-pathable start→any islet.
- [ ] Collision (t1) reports no overlaps between islet polys and no islet outside bounds.
- [ ] Exactly 1 sinkhole, 1 micro-event, 2 buoys, 2–3 wrecks, 9–14 islets per map.

---

## 3. Cast / bite flow

Spec §3.1: *"Telegraph shows catch tier (ripple size) but not species. Split-second
choice on the bite: SET (fight begins, tethered) or RELEASE (no loot, no Dread,
disturbance consumed)."*

### 3.1 Disturbance lifecycle — `src/run/disturbance.ts`
```
spawn (director) → idle (ripple telegraph, size = tier) → cast (player rows near, presses cast)
  → bite (prompt) → SET → species rolled → startTetherFight(species, 'player')   [t2 interface]
                → RELEASE → disturbance consumed (sinks), no loot, no Dread gain
```
- `Disturbance.tier` → ripple animation: small/medium/large rings + color tint by
  rarity *bucket* (Common / Uncommon+ / Rare+). **Never the species.**
- **Castable** only from the boat or a walkable shore within `castRange` (t1 supplies
  the boat controller + the line/cast input; the tether's line-length is M2 — for M3 the
  cast is just "press X within range", the fight starts at the tether's default L).
- **Bite:** after `biteDelay = range(1.5, 4)`s (bias down if the player reels/teases the
  lure — hook *feels* reactive, is still seeded). On bite → **SET/RELEASE prompt**:
  LMB = SET, RMB = RELEASE, window **1.2 s** (a real decision, but forgiving). On SET,
  roll species from the current catch table *at that moment* (so Dread tier / clock /
  lure can shift the table before you commit — this is the `Sounding Bell`/`Baby Shoe`
  hook). On RELEASE: disturbance consumed, nothing else.
- **Release is the free Dread valve** (§5): one of the few ways to *lose* heat pressure
  without paying. It costs the bait (consumable, M4) and the disturbance slot — the tax
  is time, not risk.

### 3.2 Events the run system consumes
```ts
type CastEvent =
  | { kind: 'bite';        d: Disturbance; tier: CatchTier }
  | { kind: 'set';         d: Disturbance; species: SpeciesId }
  | { kind: 'release';     d: Disturbance };
// tether emits into the same run reducer:
//   { kind: 'tether/landed', species, clean, weight, struggle }
//   { kind: 'tether/cut', ... } { kind: 'tether/snapped', ... } { kind: 'tether/pulledIn', ... }
```

### 3.3 Acceptance criteria
- [ ] Ripple size encodes tier only; species is unobservable pre-SET (checked via a test
      that stubs the species table).
- [ ] SET always spawns a tether fight; RELEASE always consumes with no Dread gain.
- [ ] Release feeds the spawn director's refill budget (§9) so "farming bites you don't
      take" is viable play.

---

## 4. Dread economy (spec §5)

Per-run heat 0–100; the risk/reward dial and pacing engine.

### 4.1 State & gains — `src/dread/dread.ts`
```ts
interface DreadState {
  value: number;          // 0–100, float, clamped
  tier: 0 | 1 | 2 | 3 | 4;
  zoneFloor: number;      // set on descent (see below)
  nightMult: number;      // 1.0 dusk, 1.25 night+, from NightClock
  startingBonus: number;  // meta: +2 per restored building, cap +30 (read from meta save)
  startedAt: number;      // value at run start = startingBonus
}
```
**Gain table (all values × `nightMult` when phase ≥ night):**
| Source | Gain |
|---|---|
| Land a catch | +4 / +6 / +9 / +12 by tier (C/U/R/E) |
| Kill a Caller too late (post-first-scream) | +5 |
| Loot a Maren artifact (micro-event bottle) | +15 |
| Descend a zone | `value = max(value, zoneFloor)` — *floor rises* (Shallows→Kelp 0→25, Kelp→Township 25→50, Township→Choir 50→75, Choir→Mouth 75→90). This is a clamp, not a gain, so `nightMult` never applies. |
| Use Sounding Bell / Baby Shoe lures | +5 / +20 (interface: lures call `dread.add(source, amt)`) |
| Survive via Dam Key, Spare | +25 (meta item; interface only) |

### 4.2 Tier effects — `src/dread/tiers.ts`
| Tier | Dread | Spawn / rarity effects | Pressure effects |
|---|---|---|---|
| 0 Calm | 0–19 | Base spawns, common catches | None |
| 1 Noticed | 20–39 | +1 rarity die on catches; occasional Crawler **pairs** | — |
| 2 Watched | 40–59 | Uncommon+ disturbance bias; **Callers spawn** | Ambush on landing a catch (30%) |
| 3 Hunted | 60–79 | Rare disturbances appear; **Snatchers active** | Water phase becomes *occupied* (t2 flag) |
| 4 Beheld | 80–100 | Guaranteed rare/epic disturbances; continuous pressure | **Whistler** may spawn (roaming elite that hooks YOU); ambush timer 20–30s |

Rarity/ambush budgets live in `src/spawn/budgets.ts` (§9) keyed by `(tier, phase)`.

### 4.3 Reductions
- Extraction resets to 0 (run over).
- **Release a bite** = only free in-run valve (no Dread *gain*, slot refunded). Skill expression: "farm bites you don't take."
- Interfaces reserved for others: Hymnal trinket (vent 2/s while standing still), chapel blessings (meta) — both call `dread.add(source, -amt)`.

### 4.4 Meta twist — starting Dread from restored buildings
- Read `meta.buildings.length` at run start → `startingBonus = min(2 × count, 30)`.
- This is *provocation, not punishment*: tier 0→1 threshold is 20, so 10 buildings still
  leave a calm early game; 15 buildings (max) force a run that opens already-Watched.
- Wire-through: M5 owns buildings; I read the count and expose `dread.startedAt` to the
  UI (the run summary shows "Opened the water at Dread X").

### 4.5 Dread heartbeat audio hook
`dread.value` → sub-bass BPM (spec §11). I only expose a pure `heartbeatBpm(value)` fn;
audio worker binds it.

### 4.6 Acceptance criteria
- [ ] Tier boundaries fire exactly at 20/40/60/80 (clamp + floor logic unit-tested).
- [ ] Descend sets a floor, never resets, and is unaffected by nightMult.
- [ ] `startingBonus` = `min(2·buildings, 30)` verified with a fake meta state.
- [ ] Releasing a bite never changes Dread; landing always does (by the gain table).

---

## 5. Night Clock (spec §3.2)

### 5.1 State — `src/clock/nightclock.ts`
```ts
type ClockPhase = 'dusk' | 'night' | 'deepNight' | 'falseDawn';
interface NightClock {
  runStartMs: number;
  phaseLengthMs: number;   // 8–10 min; tune to 9:00 default, expose in debug
  phase(): ClockPhase;               // pure fn of elapsedMs
  phaseProgress(): number;           // 0..1 within phase
  beamSweepHz(): number;             // lighthouse beam UI: 0.05 dusk → 0.25 false dawn
  totalRunMs(): number;
}
```
- **`phase()` is a pure function of `elapsed = now - runStartMs`** — no event queue, no
  mutation, trivially testable and trivially serializable. Phase transitions are derived
  (systems compare previous vs new phase and fire one-shot effects like "buoys begin
  submerging").
- **Descent does not reset the clock.** `runStartMs` is set once per run. Deep zones at
  deep night = the intended endgame risk stack. (Old "linger Dread tax" is removed; the
  clock *replaces* it.)

### 5.2 Clock as UI
- Sky/fog gradient lerps across the 4-phase palette (render side, t1): dusk bone-teal →
  night near-black → deep night +blue fog → false dawn first-light desaturation.
- Lighthouse beam sweep `beamSweepHz()`: slow arc (0.05 Hz) in dusk, urgent (0.25 Hz) at
  false dawn — *the clock is diegetic*; no numeric clock on screen.
- Debug panel shows the real elapsed/phase numbers.

### 5.3 Phase effects table — `src/clock/phaseeffects.ts`
| Phase | ~duration | Surface / spawn | Boat | Dread |
|---|---|---|---|---|
| **Dusk** | 9 min | Tutorial-calm; common disturbance bias; **no ambushes below Dread 40** | Safe traversal (no Draggers) | ×1.0 |
| **Night** | 9 min | Rare disturbance bias | **Boat combat enabled** (Draggers); contested | ×1.25 |
| **Deep night** | 9 min | **Whistler eligible**; **Auditor's Courier eligible**; Callers scream further (aggro radius ×2) | Actively hunted (Dragger rate ×1.5) | ×1.25 |
| **False dawn** | 9 min | Spawns thin out (refill halts ~60% through phase) | Safe again, if it still floats | ×1.25 |

- **Buoy submerging at false dawn:** at `falseDawn` start, `secondary` buoy submerges
  over 45s; `primary` submerges 90s later. If *both* submerge you cannot extract — you
  ride to the end (descend forever or die). This is the overstay pressure.
- **Callers scream further** = their local-Dread radius ×2 in deep night (effect applied
  in dread/ambush code, not the clock).

### 5.4 Acceptance criteria
- [ ] 4 phases, each 8–10 min, pure-function phase derivation unit-tested at boundaries.
- [ ] Descending changes nothing about the clock (test: elapsed monotonic across descent).
- [ ] Dragger eligibility is `false` before `night`; Auditor's Courier/Whistler only
      during `deepNight`.
- [ ] Buoys submerge in order (secondary → primary) and extraction fails after both.

---

## 6. Boat combat (spec §3.3, night only)

### 6.1 State — `src/boat/boatcombat.ts`
```ts
interface BoatCombatState {
  active: boolean;
  dragger: DraggerInstance | null;   // hull-anchored tether (anchor: 'boat')
  hull: { hp: number; maxHp: number; segments: number; };   // segments = visual+mechanical
  winch: { rate: number };           // base reel rate at the winch post
  tilt: number;                      // deck tilt (tension → yaw), pure visual + small offset
  atWinchPost: boolean;              // hold at post to reel (exposed while doing it)
  cleatCutReady: boolean;            // hold F at cleat → costs a hull segment, not a lure
  bellKeel: { uses: number; maxUses: number };  // 1/night
}
interface DraggerInstance {
  species: 'dragger';
  tetherId: number;                  // t2 tether at anchor 'boat'
  yawTarget: Vec2 | null;            // hazard it is dragging the boat toward
}
```
- **Trigger:** during `night`+ phases, the spawn director may spawn a Dragger
  (budget §9). It surfaces near the boat and **hooks the boat** → `startTetherFight('dragger', 'boat')`.
- **Deck-as-arena:** the on-foot controller (t1) runs constrained to the boat bounds;
  the boat position/heading is driven by tether drag. Dragger lunges `yawTarget` the boat
  toward hazards (rocks, wrecks, other disturbances) — hazards *wake up* (a hooked
  disturbance becomes a second threat). Tile offset from `tilt` for feel.
- **Winch post:** hold interact at the post → reel at `winch.rate` (boat-scale reel
  stance). Exposed while at the post: Dragger drags are *stronger* when you're reeling
  (it's the bait). Moving away from the post cancels reeling.
- **Cleat cut:** hold F at the cleat → tether cut. Instead of losing the lure, **lose a
  hull segment** (`segments--`, `hp -= maxHp/segments`). Dragger takes a bite of boat on
  the way out.
- **Hull 0 → swamp:** `enterWaterPhase({ breathSec: 25, occupied: dread.tier >= 3, sinkingHaul: haul[] })` —
  the *extended* water phase: your whole haul sinks around you; each pickup costs
  breath seconds. Haul items not recovered by shore/breath-end are lost from the run haul
  (extraction yields what you actually carried out).
- **Landing a Dragger:** guaranteed Rare+ loot, hull repair materials (`+2 segments`),
  and **Dragger Teeth** (crafting mat — M5 consumes the count). This is the *only* Teeth
  source. Dread gain as tier E (+12).

### 6.2 Upgrade hooks (Chandlery, M5 owns unlock/purchase)
```ts
interface BoatUpgrades {
  hullPlating: number;   // +2 maxHp / segment per level → +hull.maxHp
  winchGearing: number;  // +winch.rate per level
  bowLantern: number;    // +night vision radius (t1 lantern radius multiplier)
  bellKeel: boolean;     // once per night: ring → every Dragger in range disengages,
}                        //   and every Caller "answers" (spawns/aggros) — the double edge.
```
- The boat-combat system only *reads* these values; purchase UI is M5. Bell Keel's
  "every Caller answers" effect is a spawn-director hook (`forceCallerResponse()`).

### 6.3 Acceptance criteria
- [ ] No Dragger spawns, hooks, or boat damage before `night` phase.
- [ ] Cleat cut removes a hull segment and frees the boat; never touches the lure.
- [ ] Hull 0 transitions to the extended water phase with `sinkingHaul` populated.
- [ ] Landing a Dragger yields Rare+, repair materials, and Teeth (once per kill).

---

## 7. Extraction, death, Memories (spec §3.1.7, §6.5)

### 7.1 Conversion — `src/extract/memories.ts`
```
memories = weight × rarityMult × struggleMult     (clean catch ×1.5)
xp       = same formula, separate pool             (drops 30% on death, never 0)
```
| Rarity | Mult |
|---|---|
| Common | 1 |
| Uncommon | 2 |
| Rare | 3.5 |
| Epic | 6 |
| Drowned | 10 |

- `weight` (kg, per catch roll), `struggleMult` (fight quality: clean-exhaustion land =
  base; HP kill −1 tier and no clean-catch credit — computed by t2 on `landed`), `clean`
  flag → `×1.5`.
- `CatchRecord` is produced by the run reducer on `tether/landed` and stored in `haul[]`.

### 7.2 Termination paths — `src/extract/extract.ts`
- **Extraction (bell buoy):** interact with a non-submerged buoy → `RunResult.extracted =
  true`, keep **100%** of haul.
- **Death:** hull-swamp-with-haul-lost, water-phase timer out, or HP 0 on land → `extracted =
  false`, keep **30%, rounded down** (Office's condolence rate) of both memories and XP.
  - 30%-rounding is applied *per CatchRecord* (`floor(rec.memories × 0.3)`) then summed —
    a tester who dies every run still banks *something* (§13.5).
- **Seed on death screen** (§1.3) is printed here.
```ts
interface CatchRecord { species: SpeciesId; weight: number; rarity: Rarity;
                        clean: boolean; struggleMult: number; memories: number; xp: number; }
interface RunResult {
  seed: RunSeed; clockPhaseEnd: ClockPhase;
  haul: CatchRecord[]; extracted: boolean;
  memoriesTotal: number; xpTotal: number;   // already converted (100% or 30%)
  dreadPeak: number; startedAtDread: number;
  draggersLand: number; bagmanCaught: boolean; sinkholesDescended: number;
}
```

### 7.3 Run summary UI
Extraction **or** death routes to the same summary screen: haul list (species, weight,
rarity, clean checkmark), Memories gained, XP gained, phase the run ended on, peak
Dread, and the seed. Summary data is passed to M5's hub (spend Memories, license grade
up). A **retention check** fires here: did this run yield at least one of
new bestiary entry / new building affordable / new zone / Drowned item? (log only, §9/§13.5).

### 7.4 Acceptance criteria
- [ ] Extraction keeps 100%; death keeps floor(30%) per record, summed.
- [ ] Clean catch ×1.5 verified; HP-kill yields −1 rarity tier and no clean flag.
- [ ] RunResult delivered to meta on both paths; seed printed on death.

---

## 8. Saves (spec §8.3)

### 8.1 Storage — `src/save/storage.ts`
- IndexedDB wrapper (~80 lines, no dep): DB `undertow`, store `meta` (single row), store
  `runs` (append-only run results, capped 200).
- **Versioned:** `SAVE_VERSION = 1`. `migrate(raw): SaveGame` switch on `raw.version`,
  stepwise up-migration; unknown newer version → refuse with a friendly error (never
  destroy forward data).
- **zod schema:** `src/save/schemas.ts`
  ```ts
  const MetaSchema = z.object({
    version: z.literal(1),
    session: z.object({
      memories: z.number(), license: z.object({ xp: z.number(), grade: z.number().int().min(1).max(7) }),
      buildings: z.array(z.string()), runsCompleted: z.number().int().min(0),
      bagmanSeen: z.boolean(), settings: z.object({ ... }).partial(),
    }),
  });
  const RunResultSchema = RunResultZod;      // mirrors §7.2
  const SaveGameSchema = z.object({ version: z.literal(1), meta: MetaSchema, lastRun: RunResultZod.optional() });
  ```
  Save path: `runResult` → validate `RunResultSchema` → append to `runs` → update `meta`.
  `meta` is the canonical hub state M5 reads; I own the *write* path and the schemas.
- **JSON export/import:** `export()` serializes the whole SaveGame to a download blob;
  `import(blob)` validates, migrates, writes. Backup story per spec.

### 8.2 In-run save
Roguelite runs are single-session; `lastRun` is written only at extraction/death.
Mid-run persistence is intentionally out of scope for M3 (a crash loses the run but the
meta is safe) — flagged as a post-M3 nicety since determinism makes it cheap later.

### 8.3 Acceptance criteria
- [ ] Fresh session saves, reloads, and migrates from version 0→1 stubs.
- [ ] Corrupt/foreign JSON import is rejected by zod without clobbering existing data.
- [ ] `runsCompleted`/`bagmanSeen` counters feed the Bagman spawn floor (§9).

---

## 9. Spawn director — `src/spawn/`

### 9.1 Guarantees
1. **One un-caught species per surface map when possible** (§9 retention spine): from
   the bestiary metadata (M4) + `meta` caught-set, pick a species not yet clean-caught,
   tier-appropriate to the zone, and force one disturbance to that species (ripple still
   shows *tier only* — the guarantee is invisible).
2. **Bagman spawn floor (first 3 runs):** if `meta.runsCompleted < 3` and `bagmanSeen`
   is false, force a Bagman spawn on run 1 (Purse Minnow in Shallows) or run 2/3 (standard
   Bagman). After the floor, normal 6%-per-map rate + Dread-tier bonus (`+2%/tier`).
3. **Night variants:** Auditor's Courier only during `deepNight`; Whistler only at
   `dread.tier === 4` ∧ `deepNight` (and Whistler hooks *you* — tether reverse-anchor,
   t2 interface).

### 9.2 Budgets — `src/spawn/budgets.ts`
Pure tables `(dreadTier, clockPhase) → budget`. Refill: the director holds `remaining`
and a timer (per phase: dusk 90s, night 60s, deep night 45s, false dawn 120s and **halts
60% through the phase**).

| Tier | Common | Uncommon | Rare | Epic | Ambush cadence |
|---|---|---|---|---|---|
| 0 | 80% | 15% | 5% | 0 | none |
| 1 | 65% | 25% | 10% | 0 | Crawler pair every ~2 catches / 90s |
| 2 | 45% | 35% | 15% | 5% | Callers 1–2/area; ambush on landing a catch 30% |
| 3 | 30% | 40% | 25% | 5% | Snatchers eligible in tether fights; water occupied |
| 4 | 20% | 35% | 35% | 10% | continuous: ambush timer 20–30s; Whistler roll |

Clock mods: `night` → −10% common, +10% rare (and Draggers join the schedule);
`deepNight` → Caller aggro ×2, Dragger rate ×1.5; `falseDawn` → total spawn pool decays,
no new spawns past 60%.

```ts
interface SpawnSchedule {
  disturbances: DisturbanceSpawn[];   // { pos, tier, speciesRoll? }
  ambushes: AmbushSpawn[];            // { kind: 'crawlers'|'callers'|'snatchers', at, n }
  bagman?: BagmanSpawn;
  draggers: DraggerSpawn[];           // night+ only
}
```
The director consumes `dread`, `clock.phase`, `lake`, and `meta`; it writes new
disturbances/ambushes via pure functions. Ambush *behavior* is t2's enemies; the
director only decides *when/where/what-kind*.

### 9.3 Acceptance criteria
- [ ] Un-caught guarantee fires once per map when the caught-set permits.
- [ ] Bagman floor: exactly one Bagman encounter inside the first 3 runs on a fresh save.
- [ ] No ambush spawns below Dread 40 during dusk.
- [ ] Budgets obey the `(tier, phase)` tables (property test: sample all 5×4 combos).

---

## 10. System wiring (update order)

The M0/M1 world update order is `input → intent → tetherConstraint → movement →
collision → combat → dread → spawn → animation → render → ui`. M3 adds these systems:

| Slot (after) | System | File |
|---|---|---|
| after `intent` | `castFlow` | `src/systems/castFlow.ts` (bite timers, SET/RELEASE, emits CastEvent) |
| after `tetherConstraint` | `boatCombat` | `src/systems/boatCombat.ts` (hull/winch/cleat/tilt/swamp) |
| after `collision` | `boatSwamp` (sub-state of boatCombat) | same file |
| after `combat` | `dreadSystem` | `src/systems/dreadSystem.ts` (gains, tier transitions, ambush triggers) |
| `dread` (existing) | `spawnDirector` | `src/systems/spawnDirector.ts` (refills, ambushes, guarantees) |
| after `spawn` | `nightClock` (advance one-shot phase effects) | `src/systems/nightClockSystem.ts` |
| end, before `ui` | `runTerminal` (extract/death/runsummary) | `src/systems/runTerminal.ts` |

All are pure functions of `(world, dt, input)` returning the world; `World` gains the
slots: `w.lake`, `w.runSeed`, `w.dread`, `w.clock`, `w.boatCombat`, `w.disturbances`,
`w.spawn`, `w.haul`. The run reducer (`src/run/reducer.ts`) is a single pure fold over
events (`CastEvent`, tether events, drain events) so the run can be replayed for
determinism tests and the "cheap later" daily-lake / replay features.

---

## 11. Ordered task breakdown (~1–3 h each)

| # | Task | Files | ~h | Acceptance criteria | Risks |
|---|---|---|---|---|---|
| 1 | **PCG32 + streams** | `src/rng/pcg32.ts`, `src/rng/streams.ts` | 2 | U32/f32/range determinism across 2 runs; stream independence (salt test §1.4) | JS float pitfalls in state math — keep state u32-only |
| 2 | **Poisson-disc islets** | `src/lake/poisson.ts` | 2 | 9–14 non-overlapping centers, edge-margin enforced, start-islet pinned | Point-starved seeds → fallback: relax `r` once, retry with different `k` |
| 3 | **Delaunay + graph prune** | `src/lake/delaunay.ts` | 3 | Connected planar graph; maxEdge prune; boat path start→far islet | Bowyer–Watson degeneracy (collinear/cocircular): jitter seeds; add super-triangle far outside bounds |
| 4 | **Islet polygons** | `src/lake/isletgen.ts` | 2 | Simple convex-approx polys; rock vs walkable split | Self-intersection from jitter — clamp radius ratio ≤1.3, one smoothing pass |
| 5 | **Mapgen pipeline + placements** | `src/lake/mapgen.ts`, `src/lake/placements.ts` | 3 | Deterministic `LakeMap`; 1 sinkhole, 1 micro-event, 2 buoys, 2–3 wrecks; t1 collision consumes `poly` cleanly | Wreck/buoy overlap with islet polys → snap-to-shore check after placement |
| 6 | **Disturbance + cast/bite** | `src/run/disturbance.ts`, `src/systems/castFlow.ts` | 3 | Ripple=tier; bite delay seeded; SET→tether, RELEASE→consume no-Dread | Cast input conflicts with t1's move/gaff → route via intent system, distinct key |
| 7 | **Dread system + tiers** | `src/dread/dread.ts`, `src/dread/tiers.ts`, `src/systems/dreadSystem.ts` | 3 | Gain table + nightMult + zoneFloor + startingBonus all unit-tested | NightMult double-applied on zoneFloor → floor is a clamp, never ×1.25 |
| 8 | **Night clock** | `src/clock/nightclock.ts`, `src/clock/phaseeffects.ts`, `src/systems/nightClockSystem.ts` | 3 | Pure phase fn; 4 phases 8–10 min; descent doesn't reset; beam UI value | Phase-boundary one-shots firing twice → compare prev/next phase, not thresholds |
| 9 | **Boat combat core** | `src/boat/boatcombat.ts`, `src/systems/boatCombat.ts` | 3 | Night-gated Draggers; winch reeling; cleat cut −1 segment; tilt | Blocked on t2 anchor param — fallback stub (§0) behind same interface |
| 10 | **Swamp + sinking haul** | `src/boat/boatcombat.ts` (swamp), `src/extract/extract.ts` | 2 | Hull 0 → extended water phase; pickups cost breath; unrecovered haul lost | Haul item identity across water phase → keep simple `CatchRecord[]` refs, no physics |
| 11 | **Boat upgrades read + Bell Keel** | `src/boat/boatcombat.ts` | 2 | Upgrades read from meta-slot; Bell Keel disengage+Caller-answer hook | Bell Keel "Callers answer" must not run before Callers exist — guard on tier ≥2 |
| 12 | **Extraction / death / Memories** | `src/extract/memories.ts`, `src/extract/extract.ts`, `src/systems/runTerminal.ts` | 3 | 100% vs 30% per-record floor; clean ×1.5; RunResult to meta; seed on death | Rounding drift between float math and display → floor at the record, sum ints |
| 13 | **Run summary UI** | `src/ui/runSummary.ts` (render pass) | 2 | Same screen for extract & death; retention check logged | None — pure view |
| 14 | **Spawn director + budgets** | `src/spawn/budgets.ts`, `src/spawn/director.ts`, `src/systems/spawnDirector.ts` | 3 | Guarantees (un-caught, Bagman floor) + budget tables tested 5×4 | Bagman floor needs meta `runsCompleted` — stub meta for M3, wire M5 later |
| 15 | **Saves** | `src/save/storage.ts`, `src/save/schemas.ts`, `src/save/migrate.ts`, `src/save/exportimport.ts` | 3 | IndexedDB round-trip; zod reject corrupt import; version migration | IDB absent in some headless test env → abstract store behind interface, MemoryStore for tests |
| 16 | **Determinism + replay test harness** | `src/run/reducer.ts`, `tests/determinism.test.ts` | 3 | Same seed + same inputs → identical RunResult; streams independent | Reducer must be the *only* mutation path — enforce by convention + review |

**Total ≈ 40 h.** Ordering note: tasks 1–5 form the vertical slice (a lake renders);
6–8 make it playable (cast/Dread/clock); 9–12 make it a *run* (boat, exit, conversion);
14–16 harden the loop (spawns, saves, determinism). Tasks 1–5 and 7–8 can run in
parallel after task 1.

---

## 12. Risks & open questions

1. **t2 tether anchor param (blocking for task 9).** If the tether can't anchor to the
   boat, boat combat degrades to a stub. Mitigation: contract in §0 + fallback stub.
2. **Delaunay edge cases** — collinear/cocircular points, super-triangle bleed.
   Mitigation: seed jitter + generous super-triangle + property test (planar, connected).
3. **Determinism vs floating point.** Render math and any `Math.random()` must never
   enter the seeded path. Mitigation: u32-only RNG state; reducer is the only mutation
   path; replay test.
4. **Three stacked pressure systems** (clock + Dread + License) risk admin-play (§13.3).
   This plan respects the simplify order: License simplifies first (M5), then clock to
   day/night. Dread never simplifies.
5. **Night clock monotonic 36 min run vs. run-length target 25–40 min** — 4×9 min.
   Phase lengths are a single constant; tune during playtest (8 min default).
6. **Bagman floor without M5.** Runs/meta are stubbed for M3; the floor logic is written
   against the stub interface and re-tested when M5 lands.
7. **Open question — sinkhole depth cap.** At deep zones deep night, sinking forever is
   the overstay punishment; needs a terminal condition at The Mouth (M6/M9 owns). M3
   caps descents at zone 5's floor.

---

## 13. 5-line summary

1. M3 builds the deterministic run shell: a PCG32 run seed with split layout/loot/AI
   streams regenerates the same lake and spawns every time — seed printed on death,
   daily-lake derived from the calendar date, so "share a seed" is free.
2. The lake is a Poisson-disc islet archipelago wired by a pruned Delaunay graph; every
   map gets wrecks, 1–2 sinkholes, one micro-event, two extraction buoys, and a spawn
   director with per-Dread-tier / per-clock-phase budgets plus the un-caught-species and
   first-3-runs Bagman guarantees.
3. The loop is cast → bite → SET/RELEASE (release is the only free Dread valve) →
   tether fight → land or die, while a real-time 4-phase Night Clock (dusk→night→deep
   night→false dawn, 8–10 min each, never reset by descent) escalates Dread ×1.25,
   enables Draggers' boat combat at night, and sinks the buoys at false dawn.
4. Boat combat reuses the tether at boat scale — hull HP, winch-post reeling, cleat-cut
   that costs a hull segment, swamping into an extended water phase with your haul
   sinking — gated to night and backed by Chandlery upgrade hooks.
5. Runs terminate at extraction (100%) or death (30% per-record, floored), convert to
   Memories and License XP, and persist to versioned zod-validated IndexedDB with JSON
   export/import; ~40 h of 1–3 h tasks, first vertical slice after tasks 1–5.
