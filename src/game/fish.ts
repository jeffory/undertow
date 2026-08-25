// FISH (game) — WORKER C OWNS THIS FILE.
// M1: the one hardcoded sine-spine fish (plan 01 §4.5, T16/T17): CPU sine-spine
// params (animateFish) + a minimal fightable land AI (updateFishAI). This AI is
// deliberately separate from the tethered-fight AI (02) per the plan's risk note.
//
// Slot wiring (systems.ts):
//   spawn     → spawnFish(world)    once, when world.fish is null
//   spawn     → updateFishAI(world, dt)
//   animation → animateFish(world, dt)
//
// IMPORTANT: the movement system does NOT integrate the fish — this module
// integrates world.fish.x/z from vx/vz inside updateFishAI. Collision
// (systems.ts) still contains the fish on the islet and keeps it off the
// player's circle. Combat (WORKER B) applies damage/knockback/hitFlash directly
// to world.fish and pushes a HitEvent (targetId = FISH_TARGET_ID) carrying the
// same numbers; this module consumes the event's stagger only and detects the
// hit via the hp delta, so damage is never applied twice.

import type { WorldState, FishState, HitEvent } from '../core/world';
import { spawnFishOnDockedIslet } from '../gen/lakeWorld';

// --- combat seam ---------------------------------------------------------------
// WORKER B pushes HitEvents with this targetId for the fish (combat.ts defines
// the same constant). Combat applies damage / knockback / hitFlash DIRECTLY to
// world.fish and the event carries the same numbers for other systems — this
// module consumes ONLY the stagger field, and must not re-apply damage or
// knockback (that would double it). It detects the hit itself via the hp delta.
export const FISH_TARGET_ID = 0;

// --- T17 land AI constants ------------------------------------------------------
export const NOTICE_RANGE = 8; // m — idle notices the player inside this
export const RING_DISTANCE = 5; // m — strafe orbit radius around the player
export const STRAFE_SPEED = 2.5; // m/s — tangential strafe speed
export const STRAFE_RADIAL_MAX = 1.5; // m/s — max ring-correction speed
export const STRAFE_LUNGE_MIN = 2.0; // s — min strafe time before a lunge
export const STRAFE_LUNGE_MAX = 4.0; // s — max strafe time before a lunge
export const STRAFE_FLIP_MIN = 1.2; // s — min time between direction flips
export const STRAFE_FLIP_MAX = 2.8; // s — max time between direction flips
export const TELEGRAPH_DURATION = 0.4; // s — lunge wind-up (stop + coil)
export const LUNGE_SPEED = 7; // m/s — burst speed toward the telegraphed point
export const LUNGE_DURATION = 0.62; // s — burst duration. TUNED (M1 gate T18): at
// 0.5s the burst (3.5m) fell 0.15m short of a stationary player standing on the
// 5m strafe ring (contact needs dist < 1.35m; the burst ended at 1.5m), so an
// undodged lunge never landed and the i-frame dance was untestable. 0.62s covers
// 4.34m — contact at ~0.52s, with margin for ring correction up to ~5.6m.
export const LUNGE_DAMAGE = 8; // contact damage on a landed lunge
export const RECOVER_DURATION = 1.0; // s — vulnerable pause after a lunge.
// TUNED (M1 gate T18): 0.8s barely fit a heavy (0.42s wind-up + 0.35s swing +
// driver overhead ~0.8s) so the stagger punish was unreliable; 1.0s gives the
// heavy a comfortable window and makes the fight more winnable.
export const HURT_DEFAULT = 0.5; // s — hurt duration without a stagger
export const HURT_DRAG = 6; // 1/s — knockback slides off during hurt
export const HIT_FLASH_DURATION = 0.25; // s — vertex-colour hurt flash

// --- T16 sine-spine constants -----------------------------------------------------
export const SWIM_FREQ = 6; // rad/s
export const SPINE_PHASE = 0.9; // rad/segment
export const SPINE_AMP = 0.55; // rad — base per-segment bend
export const FLOP_DURATION = 0.6; // s — belly-flop: deadTilt 0→1, spine→0
export const IDLE_SWAY = 0.4; // m/s — gentle idle sway drift

// --- exhaustion telegraph (plan 02 §6.2, T6) -------------------------------------
// Exhausted fish read as exhausted: sine-spine amplitude ×0.4 (slower, lazier
// wave) + the capsule belly-tilts ~20° toward its top side (the "flop" tell).
// Runs off fish.tether.exhausted, so the same telegraph works for the land AI
// later (04). exhaustTilt is the animation-side value; the render consumes it.
export const EXHAUST_SPINE_SCALE = 0.4; // spine amplitude multiplier when exhausted
export const EXHAUST_TILT_MAX = 0.35; // rad — ~20° belly roll
export const EXHAUST_TILT_RAMP = 0.5; // s — belly-tilt ramp in/out

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// --- deterministic pseudo-random (seeded by world.seed + the sim clock) ----------
// M1 has no RNG stream of its own (03/04 reserve world.rng); a seeded hash over
// (seed, elapsed, salt) is deterministic per run and gives the flips their variety.
function rand(world: WorldState, salt: number): number {
  let h =
    (world.seed * 374761393 +
      Math.floor(world.time.elapsed * 100) * 668265263 +
      salt * 974634223) |
    0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function randRange(world: WorldState, min: number, max: number, salt: number): number {
  return min + rand(world, salt) * (max - min);
}

function enterStrafe(world: WorldState, fish: FishState): void {
  fish.state = 'strafe';
  fish.stateTimer = randRange(world, STRAFE_LUNGE_MIN, STRAFE_LUNGE_MAX, 1);
  fish.strafeFlipTimer = randRange(world, STRAFE_FLIP_MIN, STRAFE_FLIP_MAX, 2);
  fish.strafeDir = rand(world, 3) < 0.5 ? -1 : 1;
}

// Pulls the fish's hit events off world.combat.hits. Combat (WORKER B) already
// applied damage / knockback / hitFlash directly to the fish; this module reads
// the event's STAGGER only (stagger seconds = hurt state duration) and detects
// the hit itself from the hp delta, so a hit is never applied twice. A corpse
// ignores everything except the queue clean-up.
function applyFishHits(world: WorldState, fish: FishState): void {
  let stagger = 0;
  const kept: HitEvent[] = [];
  for (const hit of world.combat.hits) {
    if (hit.targetId === FISH_TARGET_ID) {
      if (hit.stagger > stagger) stagger = hit.stagger;
    } else {
      kept.push(hit);
    }
  }
  world.combat.hits = kept;
  if (fish.state === 'dead') return;

  const hpDropped = fish.hp < fish.lastHp; // combat lowered hp since our last step
  fish.lastHp = fish.hp;

  if (fish.hp <= 0) {
    fish.state = 'dead';
    fish.vx = 0;
    fish.vz = 0;
    fish.stateTimer = 0;
    fish.telegraph = 0;
    return;
  }
  if (hpDropped && fish.hitFlash <= 0) {
    fish.hitFlash = HIT_FLASH_DURATION; // safety: cover a direct-damage path that skips the flash
  }
  if (hpDropped || stagger > 0) {
    fish.state = 'hurt';
    fish.stateTimer = stagger > 0 ? stagger : HURT_DEFAULT;
    fish.telegraph = 0; // a hit cancels a coiling lunge
  }
}

// --- spawn (spawn slot) ------------------------------------------------------------
export function spawnFish(world: WorldState): void {
  if (world.fish) return; // the scaffold spawns the single fish exactly once
  // M3: place the catch on the islet the player is docked to (it spawns inside
  // the islet hull near the player); legacy origin offset when no lake is present.
  spawnFishOnDockedIslet(world);
}

// --- T17 land AI (spawn/combat-adjacent slot) ----------------------------------------
// State machine: idle (sway, notice ≤8m) → strafe (circle the player at ~5m,
// 2.5 m/s, direction flips) → lunge (0.4s telegraph stop+coil, then a ~7 m/s
// burst for ~0.5s; contact damage 8 once per lunge, gated by player i-frames)
// → recover (0.8s vulnerable pause) → strafe. hurt (stagger = duration)
// interrupts anything except dead. dead = corpse + flop. The fish integrates
// its own x/z from vx/vz; facing follows velocity when moving.
export function updateFishAI(world: WorldState, dt: number): void {
  const fish = world.fish;
  if (!fish) return;

  fish.hitFlash = Math.max(0, fish.hitFlash - dt);

  if (fish.state === 'dead') {
    applyFishHits(world, fish); // keep the hit queue clear; corpse ignores it
    return;
  }

  const player = world.player;

  // --- behaviour for the current state ----------------------------------------
  switch (fish.state) {
    case 'idle': {
      // sway in place — the sine-spine carries the look
      const t = world.time.elapsed;
      fish.vx = Math.sin(t * 1.2) * IDLE_SWAY;
      fish.vz = Math.cos(t * 0.8) * IDLE_SWAY;
      const dist = Math.hypot(player.x - fish.x, player.z - fish.z);
      if (dist < NOTICE_RANGE) enterStrafe(world, fish);
      break;
    }
    case 'strafe': {
      fish.stateTimer -= dt;
      fish.strafeFlipTimer -= dt;
      if (fish.strafeFlipTimer <= 0) {
        fish.strafeDir = -fish.strafeDir;
        fish.strafeFlipTimer = randRange(world, STRAFE_FLIP_MIN, STRAFE_FLIP_MAX, 4);
      }
      if (fish.stateTimer <= 0) {
        // lunge: telegraph — stop and coil toward the player's current spot
        fish.state = 'lunge';
        fish.telegraph = TELEGRAPH_DURATION;
        fish.vx = 0;
        fish.vz = 0;
        fish.lungeX = player.x;
        fish.lungeZ = player.z;
        break;
      }
      const dx = player.x - fish.x;
      const dz = player.z - fish.z;
      const dist = Math.hypot(dx, dz) || 1e-6;
      const rx = dx / dist;
      const rz = dz / dist;
      // tangent around the player, sign = strafeDir
      const tx = -rz * fish.strafeDir;
      const tz = rx * fish.strafeDir;
      // pull back toward the ring when far, push out when close
      const radial = clamp((dist - RING_DISTANCE) * 1.5, -STRAFE_RADIAL_MAX, STRAFE_RADIAL_MAX);
      fish.vx = tx * STRAFE_SPEED + rx * radial;
      fish.vz = tz * STRAFE_SPEED + rz * radial;
      break;
    }
    case 'lunge': {
      if (fish.telegraph > 0) {
        fish.telegraph -= dt;
        fish.vx = 0;
        fish.vz = 0;
        if (fish.telegraph <= 0) {
          // burst begins — fly at the point locked at the telegraph start
          const dx = fish.lungeX - fish.x;
          const dz = fish.lungeZ - fish.z;
          const d = Math.hypot(dx, dz) || 1e-6;
          fish.vx = (dx / d) * LUNGE_SPEED;
          fish.vz = (dz / d) * LUNGE_SPEED;
          fish.stateTimer = LUNGE_DURATION;
          fish.lungeHitDone = 0;
        }
      } else {
        fish.stateTimer -= dt;
        if (!fish.lungeHitDone) {
          const dist = Math.hypot(player.x - fish.x, player.z - fish.z);
          // the collision system separates to exactly r+r; a small tolerance
          // catches the contact frame
          if (dist < player.radius + fish.radius + 0.05) {
            fish.lungeHitDone = 1;
            if (player.iframes <= 0) player.hp -= LUNGE_DAMAGE;
          }
        }
        if (fish.stateTimer <= 0) {
          fish.vx = 0;
          fish.vz = 0;
          fish.state = 'recover';
          fish.stateTimer = RECOVER_DURATION;
        }
      }
      break;
    }
    case 'hurt': {
      // vulnerable pause — knockback slides off with drag
      const drag = Math.max(0, 1 - HURT_DRAG * dt);
      fish.vx *= drag;
      fish.vz *= drag;
      fish.stateTimer -= dt;
      if (fish.stateTimer <= 0) enterStrafe(world, fish);
      break;
    }
    case 'recover': {
      fish.vx = 0;
      fish.vz = 0;
      fish.stateTimer -= dt;
      if (fish.stateTimer <= 0) enterStrafe(world, fish);
      break;
    }
  }

  // --- integrate own position (movement system does NOT touch the fish) ------
  fish.x += fish.vx * dt;
  fish.z += fish.vz * dt;

  // facing follows velocity when moving
  const speed = Math.hypot(fish.vx, fish.vz);
  if (speed > 0.05) fish.facing = Math.atan2(fish.vx, fish.vz);

  // --- consume combat hits (damage / knockback / stagger) --------------------
  applyFishHits(world, fish);
}

// --- T16 sine-spine (animation slot) ----------------------------------------------
// bend[i] = amplitude · sin(t·freq + i·phase). Amplitude scales down with hp
// (M1 stand-in for exhaustion) and collapses to 0 over ~0.6s while dead — the
// flop. deadTilt 0→1 rolls the corpse belly-up on the render side.
export function animateFish(world: WorldState, dt: number): void {
  const fish = world.fish;
  if (!fish) return;

  if (fish.state === 'dead') {
    fish.deadTilt = Math.min(1, fish.deadTilt + dt / FLOP_DURATION);
  }

  const health = clamp(fish.maxHp > 0 ? fish.hp / fish.maxHp : 0, 0, 1);
  let ampScale = health * 0.5 + 0.5;
  if (fish.state === 'dead') ampScale = Math.max(0, 1 - fish.deadTilt);

  // Exhaustion telegraph (plan 02 §6.2): spine amplitude ×0.4 + belly-tilt. The
  // tilt ramps toward ~20° over ~0.5s while exhausted and decays back otherwise.
  const exhausted = fish.tether.exhausted;
  if (exhausted && fish.state !== 'dead') {
    ampScale *= EXHAUST_SPINE_SCALE;
    fish.exhaustTilt = Math.min(EXHAUST_TILT_MAX, fish.exhaustTilt + dt / EXHAUST_TILT_RAMP);
  } else {
    fish.exhaustTilt = Math.max(0, fish.exhaustTilt - dt / EXHAUST_TILT_RAMP);
  }

  const t = world.time.elapsed;
  // M4: per-species swim profile (plan 04 §3.1) — the M1 constants are the
  // default when no species params are attached (legacy land fish).
  const freq = fish.params?.swimFreq ?? SWIM_FREQ;
  const amp = fish.params?.swimAmp ?? SPINE_AMP;
  for (let i = 0; i < fish.spine.length; i++) {
    const bend = amp * ampScale * Math.sin(t * freq + i * SPINE_PHASE);
    fish.spine[i] = Number.isFinite(bend) ? bend : 0;
  }
}