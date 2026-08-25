# 01 — Foundation (M0 "The Look" + M1 "The Fight")

Owner: FOUNDATION slice. Scope: milestones M0 and M1 from spec §10. Delivers the
repo scaffold, the ECS-lite core, the flat-shaded night-lake rendering, the
rowable boat + camera (M0), and the on-foot top-down controller + gaff combat +
one hardcoded sine-spine fish + land combat (M1).

Out of scope (owned by other workers, do NOT build here):
tether system (02), procedural surface maps (03), FishParams generator (04),
meta/save/UI systems (05+). This plan only *reserves* the interfaces they will
attach to.

---

## 1. Repo scaffold

### 1.1 Stack & tooling

- **Vite** + **TypeScript** (strict) + **Three.js**. Static bundle, no backend (spec 8.1/8.3).
- **Dependencies (keep minimal per spec 8.3):** `three`, `zod` (save-schema validation later). `tone` deferred to the audio milestone — NOT installed at M0/M1.
- Dev deps: `typescript`, `vite`, `@types/three`.
- No class hierarchy, no framework, no `extends` beyond Three's own types (spec 8.3). Systems are plain functions; data are plain structs.

### 1.2 Directory / module layout

```
/undertow
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.ts                 # boot: create world, canvas, loop, resize, start systems
    core/
      world.ts              # WorldState type + createWorld()/resetWorld()
      entity.ts             # entity id + storage (flat arrays), spawn/destroy
      systems.ts            # SystemFn type + fixed update ORDER list
      rng.ts                # PCG32 (seeded) — reserved interface for 03/04
      time.ts               # fixed dt accumulator, frame clock
    render/
      renderer.ts           # THREE renderer, scene, camera, resize, loop hook
      sky.ts                # FogExp2, moon directional light, gradient skybox
      lantern.ts            # player point lantern (pulsing)
      water.ts              # water plane + Gerstner + depth-gradient shader
      post.ts               # vignette + chromatic aberration (scales w/ Dread)
      lines.ts              # (RESERVED) quadratic Bézier line renderer — 02 uses
    game/
      input.ts              # raw key/mouse → intent
      intent.ts             # intent → movement/action requests
      boat.ts               # M0: rowable boat kinematics
      controller.ts         # M1: 8-dir on-foot controller
      combat.ts             # M1: gaff light combo + heavy hold, damage events
      stamina.ts            # stamina pool, regen w/ delay
      fish.ts               # M1: one hardcoded fish (params + sine-spine mesh + AI)
      dread.ts              # (RESERVED) Dread value — post scales off it, 05 owns
    types/
      intent.ts
      combat.ts
      stats.ts              # shared numeric stat shapes
```

### 1.3 Boot flow (`main.ts`)

1. `createWorld()` → empty `WorldState`.
2. Build renderer + scene; register the M0 `WorldState` (boat, water, camera).
3. Start fixed-timestep loop (see §3.4): accumulate real dt, run system list at `DT=1/60`, render at vsync.
4. On M1: spawn the capsule fish and the on-foot controller; wire land-combat.

---

## 2. ECS-lite architecture (spec 8.3)

Go-brained: **plain data structs in flat arrays, systems as pure functions,
explicit update order.** No `class`, no `extends`, no component-registry
framework. Entities are indices into parallel typed arrays.

### 2.1 Entity storage

```ts
// entity.ts
type EntityId = number;

interface EntityStore {
  // component arrays are indexed by EntityId
  positions: Float32Array;      // x,y,z per entity (flat, SoA)
  velocities: Float32Array;
  radii: Float32Array;          // circle collision radius (land combat)
  active: Uint8Array;           // 0/1 liveness
  // ...more typed arrays added per system need (stamina, health, etc.)
  free: EntityId[];             // reused ids
  alive: number;
}
```

- Data-oriented: hot paths iterate contiguous arrays (cache-friendly, fast for ≤60k-tris scenes).
- `spawnEntity(store)` / `destroyEntity(store, id)` manage `free` + `active`.

### 2.2 World state

```ts
// core/world.ts
interface WorldState {
  entities: EntityStore;
  input: InputState;            // raw key/button state this frame
  intent: Intent;               // resolved movement/action request
  player: PlayerState;          // pos, facing, stamina, cooldowns, i-frames
  boat: BoatState;              // M0: pos, heading, speed (M1 keeps for later)
  combat: CombatState;          // active combo stage, hits, heavy windup
  fish: FishState | null;       // M1: the one hardcoded fish
  dread: number;                // 0..100 (RESERVED; post reads it, 05 owns)
  ui: UiState;                  // crosshair, stamina bar, hints
  time: Time;                   // fixed clock, runTime, night phase clock stub
  seed: number;                 // PCG32 seed (set per run; 03/04 use)
}
```

- Every field is plain data. `createWorld()` returns a fully defaulted state; `resetWorld()` re-rolls for a new run.

### 2.3 System function signature

```ts
// core/systems.ts
type SystemFn = (world: WorldState, dt: number) => void;

const UPDATE_ORDER: SystemFn[] = [
  input,            // read devices → InputState
  intent,           // InputState → movement/action Intent
  tetherConstraint, // (RESERVED, 02) distance constraint — runs AFTER intent, BEFORE movement
  movement,         // apply Intent velocity, integrate positions, rotation
  collision,        // circle vs islet polygons / world bounds
  combat,           // gaff hits, combo timers, damage application
  dread,            // (RESERVED, 05) Dread value; M1 keeps a stub
  spawn,            // (RESERVED, 03/04) spawn director; M1 spawns the single fish
  animation,        // sine-spine CPU animation params (fish)
  render,           // build/reveal scene from WorldState
  ui,               // update DOM/overlay HUD
];
```

- Systems are **pure-ish**: they take `world` + `dt`, mutate only their owned slice, return nothing. Order is the contract — a system must not depend on a later system having run.
- `render` is the only system that touches Three directly; game systems never import `three`.

### 2.4 Fixed timestep

- Accumulate real elapsed time; step systems at fixed `DT = 1/60` (deterministic, stable for combat/tether math later). Render interpolates or runs at display rate. Keeps §4.3-style Euler math consistent across refresh rates.

---

## 3. Rendering (M0 "The Look")

Target look (spec 8.1): **flat-shaded low-poly, vertex colours, zero textures, one moon directional + player point lantern, FogExp2 doing most of the atmosphere, cheap vignette + chromatic aberration scaling with Dread.**

### 3.1 Renderer / camera

- `WebGLRenderer`, `antialias: true`, sRGB output, high-ish pixel ratio capped (perf guard, §6).
- `PerspectiveCamera` low top-down angle (matches the "low top-down" view used across the art). Orthographic-ish feel for boat/islet gameplay; tune later.
- Camera: follows the player (M1) / boat (M0) with smooth lerp; slight zoom-out as Dread rises (reserved for 05).

### 3.2 Scene pieces

- **sky.ts** — `FogExp2` with per-zone density (Shallows = bone-teal, near-black water base, spec 8.1); a gradient background colour; the directional **moon** light (cool, low intensity).
- **lantern.ts** — player point lantern: warm point light + tiny emissive lantern mesh; a slow pulse. Its radius is the readable space at night (also the eventual Choir fog-of-war hook, 04).
- **water.ts** — the big one. A large plane with a custom shader:
  - **Gerstner waves** (sum of 2–3 travelling sinusoids) for the surface mesh in the vertex shader — CPU-simple, no textures.
  - **Depth gradient** in the fragment shader: colour lerps from near-black (deep) to bone/teal accent (shallow) based on depth/height, matching the palette.
  - Cheap, few draw calls (one plane, instanced patches if needed later).
- **post.ts** — fullscreen pass: **vignette** (dark corners) + **chromatic aberration** (subtle RGB fringe at edges). Both scale with `world.dread` (0 at calm → strongest at tier 4). At dread tier 4, add the 0.5° screen tilt (spec 8.1). Cheaper to leave tilt as a camera-roll lerp than a real post warp — do that.
- **Vertex colours only, zero textures** — all meshes use `MeshLambertMaterial({ vertexColors: true })` (or a tiny flat-shaded custom material). No UVs, no albedo maps. Enforced in code review.

### 3.3 "Screenshot that feels like the game" (M0 ship criterion)

A single in-game screenshot must read as UNDERTOW at a glance:
- black lake + Gerstner water with the depth gradient,
- fog swallowing distance (FogExp2 density tuned so the far shore ghosts out),
- a small boat with a warm lantern glow on the water,
- one cool moon light raking the scene,
- subtle vignette darkening the edges.

Acceptance: the team agrees the M0 screenshot "already feels like the game" — no assets, all procedural.

### 3.4 Boat (M0 deliverable)

- **boat.ts** — a simple low-poly boat mesh (vertex-coloured, no texture). Rowed on the water:
  - WASD / arrows row: heading + forward thrust; turning rate + drag; gentle bobbing/banking on Gerstner waves (sample water height).
  - Water-splash puff of particles when moving (cheap, instanced points).
  - Not physics — plain kinematics + sinusoidal bob (matches ECS-lite/no-engine ethos).
- **Camera** follows the boat; world is the water plane + a few low-poly islet silhouettes to frame the fog (islets are placeholders; procedural map owns them later).
- Lantern on the boat until M1 switches it to the player.

---

## 4. M1 "The Fight"

### 4.1 On-foot controller (`controller.ts`)

- **8-dir top-down**: WASD maps to 8 discrete directions; normalized velocity; character mesh rotates to facing.
- Interplay with M0 boat: for M1, a debug toggle lands the player on a ground plane (an islet) so land combat is testable without the full map. Boat remains for M0 screenshot/demo.

### 4.2 Dodge roll (`controller.ts` / `stamina.ts`)

Per spec 4.1:
- **Space** → dodge roll. **i-frames 0.25s**, **cooldown 0.6s**, **costs 25 stamina**.
- While rolling: brief velocity burst in move direction, ignore damage (i-frame window), short animation (roll — reuse capsule body tilt).
- Cooldown independent of stamina: even at 0 stamina you cannot roll again within 0.6s.

### 4.3 Stamina system (`stamina.ts`)

- Pool **100**. Regen **40/s after 0.8s delay** (no regen for 0.8s after spending).
- Costs: dodge 25, heavy gaff 30 (spec 4.1). Reel stance drains 10/s (reserved for 02).
- UI bar shows pool; a subtle "spent" flash during the 0.8s no-regen window.

### 4.4 Gaff combat (`combat.ts`)

- **LMB tap** → **gaff light 3-hit combo**:
  - Three swings, short reach (small arc in front of the player), each a small damage window.
  - Combo advances on successful tap within a buffer window; resets if the chain is not continued or the player moves/dodges.
- **Hold LMB** → **gaff heavy**: wind-up (charge ~0.5s), then a swing with **knockback + stagger damage**, **costs 30 stamina** (spec 4.1).
- Damage application: a hit event when the arc overlaps the fish's collision circle; applies knockback impulse + a hit-stun, and (M1) a simple HP decrement + hurt flash (vertex-colour flash, no texture).

### 4.5 One hardcoded fish + sine-spine (`fish.ts`)

- A single **hardcoded fish** (not the generator — that's 04): a capsule body made of ~8 spine segments, **CPU sine-spine animation**: each segment's bend = `sin(t*freq + segIndex*phase)` (spec 8.2), amplitude scaled by exhaustion.
- One shared geometry pool / one mesh with vertex colours (palette for the Shallows).
- A minimal **land AI** so it's fightable: idle sway → when player is near/aggressive, it strafes, lunges, and takes damage from the gaff; when HP hits 0 it flops dead (bend flat, no loot — loot is 04/05). Enough to feel like a fight for M1.
- **Collision**: circle vs the player circle; the gaff hit detection is arc-vs-circle (spec 8.3 collision = circle vs islet polygons / enemies).

### 4.6 Land combat acceptance

Player can: approach the fish, dodge its lunges (i-frames), land a 3-hit combo, heavy-knock it, and kill it. The fish's sine-spine reads as "alive/wrong" in the flat-shaded look. Stamina gates dodge+heavy meaningfully.

---

## 5. Task breakdown (ordered, ~1–3h each)

### M0 — The Look

| # | Task | Files | Est | Acceptance |
|---|------|-------|-----|-----------|
| T1 | Scaffold: Vite+TS+Three, tsconfig strict, package.json, index.html, dev run | package.json, tsconfig, vite.config, index.html, main.ts | 1h | `npm run dev` shows a blank Three scene at 60fps |
| T2 | Core: WorldState, EntityStore (flat arrays), SystemFn + UPDATE_ORDER, fixed dt loop | core/*, time.ts | 2h | Boot runs the (stub) system list at fixed 60Hz |
| T3 | Renderer + camera + resize | render/renderer.ts | 1h | Scene clears, camera responds to resize |
| T4 | Fog + moon light + gradient sky | render/sky.ts | 1h | Far objects ghost into fog; moon rakes the scene |
| T5 | Player/boat point lantern | render/lantern.ts | 1h | Warm glow + pulse; radius readable at night |
| T6 | Water: Gerstner vertex waves + depth-gradient fragment shader | render/water.ts | 3h | Water plane waves + deep→shallow colour gradient, low draw count |
| T7 | Boat: row kinematics + bob + camera follow | game/boat.ts | 2h | WASD rows boat on water; bobbing; camera follows |
| T8 | Post: vignette + chromatic aberration scaling w/ Dread stub | render/post.ts | 2h | Effects present at dread>0; off at 0 |
| T9 | **M0 gate**: screenshot pass | — | 1h | Screenshot "feels like the game" (spec §3.3) |

### M1 — The Fight

| # | Task | Files | Est | Acceptance |
|---|------|-------|-----|-----------|
| T10 | Input → intent layer | game/input.ts, intent.ts | 1h | Key state resolves to an Intent |
| T11 | 8-dir on-foot controller + facing | game/controller.ts | 2h | WASD → 8-dir movement + rotation; debug ground plane |
| T12 | Stamina pool + 0.8s-delay regen | game/stamina.ts | 1h | Costs/regen match spec; bar updates |
| T13 | Dodge roll: i-frames 0.25s, cd 0.6s, 25 stamina | controller.ts | 2h | Roll invulnerable 0.25s; cd enforced; drains 25 |
| T14 | Gaff light 3-hit combo | game/combat.ts | 2h | Combo advances with buffer; reach is short |
| T15 | Gaff heavy: wind-up, knockback, stagger, 30 stamina | game/combat.ts | 2h | Hold→charge→knockback; costs 30 |
| T16 | Capsule fish mesh + sine-spine animation | game/fish.ts | 2h | Sine-spine reads alive; shared geometry pool |
| T17 | Land fish AI (strafes/lunges) + circle collision + gaff hit events | game/fish.ts, collision.ts | 2h | Fightable; gaff arc hits; fish dies |
| T18 | **M1 gate**: land combat loop + stamina + dodge | — | 1h | Fight the fish, dodge, combo, heavy, kill; perf within budget |

---

## 6. Perf budget checks (spec 8.3)

Apply at **both** M0 and M1 gates (and re-check after M1 land combat):

- **≤ 150 draw calls** — instance the water patches, lantern glows, and any repeated props; no per-prop draw call bloat. M1 ground is one plane.
- **≤ 60k triangles** typical scene — vertex-count lint/assert; keep the fish capsule and props low-poly.
- **60 fps on integrated graphics** — the dev machine's integrated GPU is the target; cap pixel ratio, keep shaders cheap (no texture fetches, no heavy fragment work), one shadow-passing light.

Instrument: a small FPS overlay + a debug readout of draw calls / tris behind a flag (used later for the tether debug panel's sibling).

---

## 7. Risks & open questions

- **Fog density / view distance balance**: too much fog hides the fish fight; too little breaks the mood. Tune at M0 gate.
- **Gerstner water perf on integrated GPU**: if the vertex shader is too heavy, drop to fewer wave octaves / a coarser tessellation. Mitigation staged.
- **Fixed vs variable timestep + camera feel**: fixed 60Hz is good for combat determinism but can feel steppy; keep interpolation cheap.
- **Boat ↔ foot transition**: M1 introduces a debug ground plane; the real boat↔islet boarding is owned by the map worker (03). Flag the interface: `WorldState.boat` + a `world.mode` ('boat' | 'foot') that 03 will drive.
- **One fish's land AI vs tether fights**: M1's land AI must be separate from the tethered-fight AI (02) — do not let the M1 strafe/lunge logic leak into tether behaviors.

**Reserved interfaces for other workers (do not build, just keep the seams open):**
- `tetherConstraint` slot already in `UPDATE_ORDER` (02).
- `world.dread` numeric + `ui` state (05 reads; post/tilt already consume it).
- `world.seed` + `rng.ts` PCG32 (03/04).
- `spawn` system slot (03/04).
- `lines.ts` render module (02).
- `world.mode` ('boat'|'foot') (03).

---

## Summary (5 lines)

- Scaffold a minimal Vite+TS+Three repo (`three`, `zod` only; `tone` deferred) with the ECS-lite core: flat-array EntityStore, plain-data WorldState, and a fixed-order pure-system loop ending in render/ui.
- M0 builds the Look — Gerstner+depth-gradient water, FogExp2, moon + player lantern, cheap Dread-scaled vignette/CA post — shipped on the "screenshot that feels like the game" criterion.
- M1 builds the Fight — 8-dir controller, dodge (0.25s iframes/0.6s cd/25 stamina), stamina (100, 40/s after 0.8s), gaff light combo + heavy hold, and one hardcoded sine-spine fish with land combat.
- Tasks are ~1–3h each with per-milestone acceptance gates; both gates assert the perf budget (≤150 draw calls, ≤60k tris, 60fps integrated).
- Out-of-scope seams (tether slot, Dread, seed/rng, spawn, lines renderer, boat/foot mode) are reserved, not built here.
