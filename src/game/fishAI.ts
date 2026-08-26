// FISH AI (tethered-fight) — plan 02 §7, round 2A (T3/T8/T6 hooks).
// The tethered-fight FSM: orbit / lunge / dive / drag / exhausted, deliberately
// separate from the M1 land AI in game/fish.ts (plan 01 §7 risk note). Runs at
// the end of the intent phase, just before tetherConstraint, so it sets this
// frame's lunge impulses / telegraphs / drag routing and integrates the fish's
// own position; the constraint then converts any overshoot into pull + tension.
//
// The only lever the AI owns is fish.vel (plan 02 §4.1): movement never touches
// the fish, so this system integrates fish.x/z itself. Every mechanic hangs off
// that:
//   orbit  — circle the player at radius ≈ L×0.9, occasional direction flips;
//            bias timer rolls a weighted transition into lunge/dive/drag.
//   lunge  — telegraph for tuning.lungeTelegraph s (hard gate, dial 5), then an
//            impulse of pullDir × tuning.pullForce (dial 1) clamped to
//            maxSwimSpeed; costs lungeStaminaCost × line.exhaustMult.
//   dive   — steady outward swim, small pull + tension bank; costs stamina/s.
//   drag   — commit to a straight fast swim at dragSpeed; routedDrag fish
//            telegraph and swim toward the arena hazard (M2: islet shoreline).
//   exhausted — no lunges/drags/dives; slow drift; flop telegraph is the
//            animation side (fish.ts animateFish reads tether.exhausted).
//
// Determinism: all randomness goes through the catch's own PCG32 stream
// (fish.ai.rng, seeded from world.seed + fight id in startTetherFight), so a
// scripted fight replays byte-identical (spec 8.3).
//
// Pure logic: no `three` imports.

import type { WorldState, FishState, TetherAIMode } from '../core/world';
import type { TetherFight } from './tether';
import { FISH_ENTITY } from './tether';
import { FISH_TARGET_ID } from './combat';

// --- FSM constants (all tunable later via the species stats block) -------------
export const ORBIT_SPEED = 2.2; // m/s — tangential orbit speed
export const ORBIT_TARGET_RATIO = 0.9; // orbit radius ≈ L × 0.9 (plan §7)
export const ORBIT_RADIAL_GAIN = 1.5; // radial speed per m of ring error
export const ORBIT_RADIAL_MAX = 1.0; // m/s — cap on the radial correction
export const ORBIT_FLIP_MIN = 1.2; // s — min between orbit direction flips
export const ORBIT_FLIP_MAX = 2.8; // s — max between orbit direction flips
export const BIAS_MIN = 1.2; // s — weighted transition roll interval (plan §8)
export const BIAS_MAX = 2.5;
export const LUNGE_JITTER = 0.35; // rad — direction jitter around "away"
export const LUNGE_SETTLE = 0.6; // s — burst continues after the impulse
export const DIVE_SPEED = 4.0; // m/s — steady outward swim (the tension tool)
export const DIVE_TENSION_TARGET = 60; // tension banked per dive before exit
export const DIVE_MAX_DURATION = 1.0; // s — dive cap
export const DIVE_STAMINA_PER_S = 8; // stamina/s while diving (plan §7 "costs stamina")
export const DRAG_DISTANCE = 3.5; // m — drag commitment distance
export const EXHAUSTED_DRIFT = 0.3; // m/s — exhausted slow drift
export const GAFT_EXHAUST_PER_HIT = 8; // stamina per gaff hit (plan 6.1)

const EPS = 1e-9; // timer snapping so fixed-step ticks land on exact durations

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// --- deterministic helpers ------------------------------------------------------
function randRange(ai: FishState['ai'], min: number, max: number): number {
  return min + ai!.rng.nextFloat() * (max - min);
}

// The catch endpoint of a fight: the endpoint owned by 'enemy' that is the fish
// (M2's only catch; boat draggers are 03 entities, not world.fish).
function primaryFishFight(world: WorldState): TetherFight | null {
  for (const f of world.tether.fights) {
    const ep = f.a.owner === 'enemy' ? f.a : f.b.owner === 'enemy' ? f.b : null;
    if (ep && ep.anchor.kind === 'entity' && ep.anchor.entityId === FISH_ENTITY) return f;
  }
  return null;
}

// Gaff hits drain stamina (plan 6.1). Combat pushes HitEvents with targetId
// FISH_TARGET_ID; it runs AFTER this system in UPDATE_ORDER, so we consume the
// events it produced last tick (fixed-step → deterministic, one tick of lag).
function drainGaffHits(world: WorldState, fish: FishState): void {
  const kept = [];
  for (const hit of world.combat.hits) {
    if (hit.targetId === FISH_TARGET_ID) {
      fish.stamina = Math.max(0, fish.stamina - GAFT_EXHAUST_PER_HIT);
      if (fish.stamina <= 0) fish.tether.exhausted = true;
    } else {
      kept.push(hit);
    }
  }
  world.combat.hits = kept;
}

// --- direction helpers ----------------------------------------------------------

// The anchor end of the fight — what the catch orbits and pulls away from. A
// player fight leashes to the keeper; a BOAT fight (03 §6.1, anchor 'boat')
// leashes to the boat, so the whole FSM works at boat scale unchanged.
function anchorPos(world: WorldState, fight: TetherFight): { x: number; z: number } {
  return fight.anchor === 'boat'
    ? { x: world.boat.x, z: world.boat.z }
    : { x: world.player.x, z: world.player.z };
}

// "Mostly away from the anchor with jitter" (plan §7) — the leash play.
function awayDir(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']) {
  const p = anchorPos(world, fight);
  const dx = fish.x - p.x;
  const dz = fish.z - p.z;
  const len = Math.hypot(dx, dz) || 1e-6;
  const ax = dx / len;
  const az = dz / len;
  const j = randRange(ai, -LUNGE_JITTER, LUNGE_JITTER);
  const c = Math.cos(j);
  const s = Math.sin(j);
  return { x: ax * c - az * s, z: ax * s + az * c };
}

// M2 debug hazard (plan §7 hazard-routing seam): the islet shoreline. The
// outward radial from the islet centre through the player — dragging the player
// that way pulls them toward water. 03 fills the real collision.queryHazards
// later; this stands in until then.
function shorelineDir(world: WorldState) {
  const g = world.ground;
  const p = world.player;
  const dx = p.x - g.x;
  const dz = p.z - g.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: 1, z: 0 };
  return { x: dx / len, z: dz / len };
}

// 03 §6.1 — the boat fight's routed drag: "Dragger lunges yaw the boat toward
// hazards (rocks, wrecks, other disturbances)". The hazard is the nearest islet
// centre / wreck to the boat; the drag direction is boat → hazard, so a routed
// pull genuinely steers the hull into something. `yawTarget` on the
// DraggerInstance is set from this by the boat-combat system (§6.1). No RNG —
// pure geometry, so it never perturbs the fight's seeded stream.
function boatHazardDir(world: WorldState): { x: number; z: number } | null {
  const lake = world.lake;
  if (!lake) return null;
  const b = world.boat;
  let bestX = 0;
  let bestZ = 0;
  let bestD = Infinity;
  for (const iso of lake.islets) {
    const d = Math.hypot(iso.center.x - b.x, iso.center.z - b.z);
    if (d < bestD) {
      bestD = d;
      bestX = iso.center.x;
      bestZ = iso.center.z;
    }
  }
  for (const wreck of lake.wrecks) {
    const d = Math.hypot(wreck.pos.x - b.x, wreck.pos.z - b.z);
    if (d < bestD) {
      bestD = d;
      bestX = wreck.pos.x;
      bestZ = wreck.pos.z;
    }
  }
  if (!Number.isFinite(bestD) || bestD < 1e-6) return null;
  return { x: (bestX - b.x) / bestD, z: (bestZ - b.z) / bestD };
}

// The routed-drag direction for a fight: the boat fight steers toward lake
// hazards, the foot fight toward the islet shoreline (the water).
function routeDir(world: WorldState, fight: TetherFight) {
  if (fight.anchor === 'boat') return boatHazardDir(world) ?? shorelineDir(world);
  return shorelineDir(world);
}

// --- state transitions ----------------------------------------------------------

function enterOrbit(fish: FishState, ai: FishState['ai']): void {
  ai!.mode = 'orbit';
  ai!.timer = randRange(ai, BIAS_MIN, BIAS_MAX);
  ai!.telegraph = 0;
  ai!.telegraphKind = null;
  fish.state = 'idle'; // a compatible land-AI state (render-safe; the land AI is suppressed in fights)
}

function canLunge(world: WorldState, fish: FishState, ai: FishState['ai']): boolean {
  if (fish.tether.exhausted || fish.stamina <= 0) return false;
  if (ai!.lungeCooldown > 0) return false;
  return fish.stamina >= fish.tether.lungeStaminaCost * world.line.exhaustMult;
}

function enterLunge(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  ai!.mode = 'lunge';
  // dial 5 — the hard telegraph gate. Floor at EPS: lungeStep only fires the
  // impulse on the telegraph countdown reaching 0, so a dial of exactly 0 would
  // otherwise skip the countdown branch and the lunge would silently never fire.
  ai!.telegraph = Math.max(EPS, world.tuning.lungeTelegraph);
  ai!.telegraphKind = 'lunge';
  const d = awayDir(world, fight, fish, ai);
  ai!.pullDirX = d.x;
  ai!.pullDirZ = d.z;
  fish.state = 'idle';
  world.tetherEvents.push({
    type: 'telegraph',
    fightId: fight.id,
    dir: { x: d.x, z: d.z },
    kind: 'lunge',
  });
}

function enterDive(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  ai!.mode = 'dive';
  ai!.telegraph = 0;
  ai!.telegraphKind = null;
  const d = fish.tether.routedDrag ? routeDir(world, fight) : awayDir(world, fight, fish, ai);
  ai!.pullDirX = d.x;
  ai!.pullDirZ = d.z;
  ai!.timer = DIVE_MAX_DURATION;
  ai!.pullBy = 'dive';
  fish.state = 'dive'; // render/lines.ts reads this for the line's dive-hook sink
}

function enterDrag(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  ai!.mode = 'drag';
  ai!.pullBy = 'lunge';
  const routed = fish.tether.routedDrag;
  const d = routed ? routeDir(world, fight) : awayDir(world, fight, fish, ai);
  ai!.pullDirX = d.x;
  ai!.pullDirZ = d.z;
  fish.state = 'idle';
  if (routed) {
    // "telegraph toward it, then drag along that route deliberately" (plan §7)
    // EPS floor for the same reason as enterLunge: a 0 dial must still pass
    // through the countdown branch that arms the drag-swim timer.
    ai!.telegraph = Math.max(EPS, world.tuning.lungeTelegraph);
    ai!.telegraphKind = 'drag';
    ai!.timer = world.tuning.lungeTelegraph; // telegraph phase first
    world.tetherEvents.push({
      type: 'telegraph',
      fightId: fight.id,
      dir: { x: d.x, z: d.z },
      kind: 'drag',
    });
  } else {
    // "if no hazard exists, drags go straight with jitter" (plan §7)
    ai!.telegraph = 0;
    ai!.telegraphKind = null;
    ai!.timer = DRAG_DISTANCE / fish.tether.dragSpeed;
  }
}

function enterExhausted(world: WorldState, fish: FishState, ai: FishState['ai']): void {
  ai!.mode = 'exhausted';
  ai!.telegraph = 0;
  ai!.telegraphKind = null;
  ai!.timer = 0;
  fish.state = 'idle';
  fish.tether.exhausted = true;
  void world;
}

// Weighted transition roll out of orbit (plan §8: roll every 1.2–2.5s, weighted
// by the species patterns). A single rng draw decides, so the stream position is
// deterministic regardless of which state wins. Unavailable states (cooldown /
// insufficient stamina / zero weight) are excluded up front.
function rollTransition(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  const patterns = fish.tether.patterns;
  const opts: { mode: TetherAIMode; w: number }[] = [];
  if (canLunge(world, fish, ai) && patterns.lunge > 0) opts.push({ mode: 'lunge', w: patterns.lunge });
  if (!fish.tether.exhausted && fish.stamina > 0 && patterns.dive > 0) opts.push({ mode: 'dive', w: patterns.dive });
  if (!fish.tether.exhausted && fish.stamina > 0 && patterns.drag > 0) opts.push({ mode: 'drag', w: patterns.drag });
  if (opts.length === 0) return; // stay in orbit (e.g. everything on cooldown)

  const total = opts.reduce((s, o) => s + o.w, 0);
  let r = ai!.rng.nextFloat() * total;
  for (const o of opts) {
    r -= o.w;
    if (r <= 0) {
      switch (o.mode) {
        case 'lunge':
          enterLunge(world, fight, fish, ai);
          break;
        case 'dive':
          enterDive(world, fight, fish, ai);
          break;
        case 'drag':
          enterDrag(world, fight, fish, ai);
          break;
      }
      return;
    }
  }
  const last = opts[opts.length - 1]!;
  switch (last.mode) {
    case 'lunge':
      enterLunge(world, fight, fish, ai);
      break;
    case 'dive':
      enterDive(world, fight, fish, ai);
      break;
    case 'drag':
      enterDrag(world, fight, fish, ai);
      break;
  }
}

// --- per-state steps ------------------------------------------------------------

function orbitStep(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  if (ai!.orbitFlipTimer <= 0) {
    ai!.orbitDir = -ai!.orbitDir;
    ai!.orbitFlipTimer = randRange(ai, ORBIT_FLIP_MIN, ORBIT_FLIP_MAX);
  }
  if (ai!.timer <= 0) {
    ai!.timer = randRange(ai, BIAS_MIN, BIAS_MAX);
    rollTransition(world, fight, fish, ai);
    return;
  }
  const p = anchorPos(world, fight);
  const dx = fish.x - p.x;
  const dz = fish.z - p.z;
  const dist = Math.hypot(dx, dz) || 1e-6;
  const rx = dx / dist;
  const rz = dz / dist;
  // tangent around the player, sign = orbitDir; radial holds the ~L×0.9 band
  const tx = -rz * ai!.orbitDir;
  const tz = rx * ai!.orbitDir;
  const target = fight.L * ORBIT_TARGET_RATIO;
  const radial = clamp((target - dist) * ORBIT_RADIAL_GAIN, -ORBIT_RADIAL_MAX, ORBIT_RADIAL_MAX);
  fish.vx = tx * ORBIT_SPEED + rx * radial;
  fish.vz = tz * ORBIT_SPEED + rz * radial;
}

function fireLunge(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai']): void {
  const f = fish.tether;
  const force = world.tuning.pullForce; // dial 1 — live
  if (f.exhausted) return; // plan 02 §3 edge case: exhausted fish never lunge
  fish.vx = ai!.pullDirX * force;
  fish.vz = ai!.pullDirZ * force;
  const sp = Math.hypot(fish.vx, fish.vz);
  if (sp > f.maxSwimSpeed) {
    fish.vx *= f.maxSwimSpeed / sp;
    fish.vz *= f.maxSwimSpeed / sp;
  }
  fish.stamina = Math.max(0, fish.stamina - f.lungeStaminaCost * world.line.exhaustMult);
  if (fish.stamina <= 0) fish.tether.exhausted = true;
  ai!.pullBy = 'lunge';
  ai!.lungeCooldown = f.lungeCooldown;
  world.tetherEvents.push({
    type: 'lunge',
    fightId: fight.id,
    dir: { x: ai!.pullDirX, z: ai!.pullDirZ },
    force,
  });
}

function lungeStep(world: WorldState, fight: TetherFight, fish: FishState, ai: FishState['ai'], dt: number): void {
  if (ai!.telegraph > 0) {
    ai!.telegraph = Math.max(0, ai!.telegraph - dt);
    if (ai!.telegraph <= EPS) ai!.telegraph = 0; // snap → fires on the exact dial tick
    fish.vx = 0; // stopped + coiling during the telegraph
    fish.vz = 0;
    if (ai!.telegraph <= 0) {
      fireLunge(world, fight, fish, ai);
      ai!.timer = LUNGE_SETTLE;
    }
  } else if (ai!.timer <= 0) {
    enterOrbit(fish, ai);
  }
}

function diveStep(fight: TetherFight, fish: FishState, ai: FishState['ai'], dt: number): void {
  const sp = DIVE_SPEED;
  fish.vx = ai!.pullDirX * sp;
  fish.vz = ai!.pullDirZ * sp;
  ai!.pullBy = 'dive'; // drag events during the dive tag by: 'dive'
  fish.stamina = Math.max(0, fish.stamina - DIVE_STAMINA_PER_S * dt);
  if (fish.stamina <= 0) fish.tether.exhausted = true;
  if (ai!.timer <= 0 || fight.tension >= DIVE_TENSION_TARGET) {
    enterOrbit(fish, ai);
  }
}

function dragStep(fight: TetherFight, fish: FishState, ai: FishState['ai'], dt: number): void {
  if (ai!.telegraph > 0) {
    ai!.telegraph = Math.max(0, ai!.telegraph - dt);
    if (ai!.telegraph <= EPS) ai!.telegraph = 0;
    fish.vx = 0; // hold still through the drag telegraph
    fish.vz = 0;
    if (ai!.telegraph <= 0) ai!.timer = DRAG_DISTANCE / fish.tether.dragSpeed; // begin the swim
  } else {
    const sp = fish.tether.dragSpeed;
    fish.vx = ai!.pullDirX * sp;
    fish.vz = ai!.pullDirZ * sp;
    ai!.pullBy = 'lunge';
    const metres = sp * dt;
    fish.stamina = Math.max(0, fish.stamina - fish.tether.dragStaminaCostPerM * metres);
    if (fish.stamina <= 0) fish.tether.exhausted = true;
    if (ai!.timer <= 0) enterOrbit(fish, ai);
  }
  void fight;
}

function exhaustedStep(world: WorldState, fish: FishState, ai: FishState['ai'], dt: number): void {
  void dt;
  // no lunges/drags/dives — slow drift; the flop telegraph is the animation side
  const t = world.time.elapsed;
  fish.vx = Math.sin(t * 0.6) * EXHAUSTED_DRIFT;
  fish.vz = Math.cos(t * 0.5) * EXHAUSTED_DRIFT;
  void ai;
}

// --- the system ------------------------------------------------------------------

export function updateTetherFishAI(world: WorldState, dt: number): void {
  // CONTRACT: fishAI is the FIRST producer of the tether event stream each tick
  // (it runs at the end of the intent phase, before tetherConstraint). It clears
  // the stream here so consumers (the constraint's own events, the playtest log,
  // render) all see one fresh stream per tick: fishAI's telegraph/lunge events
  // plus the constraint's drag/snap/cut/landed/butchered events.
  world.tetherEvents.length = 0;

  // When a tether fight ends (snap / cut / butcher / land), hand the fish back
  // to the M1 land AI in a clean state: land-AI-compatible state, ai cleared,
  // velocity zeroed (a stray dive/lunge burst must not carry over).
  const inFight = world.tether.fights.length > 0 && primaryFishFight(world) !== null;
  if (!inFight) {
    if (world.fish && world.fish.ai) {
      world.fish.state = 'idle';
      world.fish.vx = 0;
      world.fish.vz = 0;
      world.fish.ai = null;
    }
    return;
  }
  const fight = primaryFishFight(world)!;
  const fish = world.fish;
  const ai = fish?.ai;
  if (!fish || !ai) return;

  // Gaff hits drain stamina (plan 6.1) — consume the hits combat pushed last tick.
  drainGaffHits(world, fish);

  // Stamina floor → exhausted (plan 6.1); exhausted blocks lunging/diving/dragging.
  if (fish.stamina <= 0) {
    if (ai.mode !== 'exhausted') enterExhausted(world, fish, ai);
  }

  ai.lungeCooldown = Math.max(0, ai.lungeCooldown - dt);
  ai.orbitFlipTimer = Math.max(0, ai.orbitFlipTimer - dt);
  if (ai.mode !== 'exhausted') ai.timer = Math.max(0, ai.timer - dt);

  switch (ai.mode) {
    case 'orbit':
      orbitStep(world, fight, fish, ai);
      break;
    case 'lunge':
      lungeStep(world, fight, fish, ai, dt);
      break;
    case 'dive':
      diveStep(fight, fish, ai, dt);
      break;
    case 'drag':
      dragStep(fight, fish, ai, dt);
      break;
    case 'exhausted':
      exhaustedStep(world, fish, ai, dt);
      break;
  }

  // The fish integrates its own position (movement never touches it).
  fish.x += fish.vx * dt;
  fish.z += fish.vz * dt;
  const speed = Math.hypot(fish.vx, fish.vz);
  if (speed > 0.05) fish.facing = Math.atan2(fish.vx, fish.vz);
}