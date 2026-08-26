// COMBAT — WORKER B OWNS THIS FILE.
// M1: gaff combat (plan 01 §4.4, spec 4.1). LMB tap → 3-hit light combo (short
// reach, ~0.5s buffer to continue, stage damage 6/6/10); hold LMB ≥ 0.35s then
// release → heavy wind-up swing with knockback + stagger, costs 30 stamina.
//
// INPUT: world.intent.primary is a LEVEL signal — true while LMB is held
// (input.ts sets it from the raw mouse button). Combat resolves it itself:
//   • the RISING EDGE of primary is the press that begins a wind-up;
//   • releasing after < HEAVY_CHARGE_MIN held is a light tap (combo advance);
//   • releasing after ≥ HEAVY_CHARGE_MIN held is a heavy (stamina-gated).
// This is the "hold LMB ≥ ~0.35s then release" variant for T15 (no auto-fire
// at full charge — documented choice). Each press-release is one tap; a press
// during an active swing is ignored entirely (no buffering mid-swing).
//
// HEAVY STAMINA: the 30-stamina cost is spent AT SWING START (the release) via
// spendStamina from stamina.ts (Worker A). A heavy with insufficient stamina
// degrades to NOTHING — never a light fallback.
//
// FACING: a swing locks the player's facing for its whole duration. Combat runs
// after movement in UPDATE_ORDER, so it re-asserts world.player.facing to the
// value captured when the swing started.
//
// HITS CONTRACT: world.combat.hits is cleared at the START of each tick and
// refilled with the events this tick produced. Combat applies the damage, the
// hurt flash, and the knockback impulse DIRECTLY to world.fish; the emitted
// event carries the same numbers for other systems. The fish AI (Worker C)
// should consume the event's stagger field (→ 'hurt' state) and must NOT
// re-apply the damage/knockback (that would double it). targetId is
// FISH_TARGET_ID — the M1 fish has no EntityStore id.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import { spendStamina } from './stamina';
import { SNATCHER_TARGET_ID } from '../enemies/snatcher';

// --- tuning constants ---------------------------------------------------------
export const REACH = 1.6; // m — gaff arc radius (light and heavy)
export const LIGHT_ARC_DEG = 100; // full arc width, centred on the facing
export const HEAVY_ARC_DEG = 120; // wider heavy sweep
export const LIGHT_DAMAGE: [number, number, number] = [6, 6, 10]; // per combo stage
export const HEAVY_DAMAGE = 18;
export const LIGHT_KNOCKBACK = 1.5; // m/s impulse added to fish velocity
export const HEAVY_KNOCKBACK = 4.5;
export const HIT_FLASH = 0.15; // s of vertex-colour hurt flash
export const HEAVY_STAGGER = 0.9; // s of 'hurt' the fish AI applies from the hit event
export const LIGHT_SWING_DURATION = 0.22; // s per light swing (also the facing lock)
export const LIGHT_ACTIVE_START = 0.05; // s after swing start the arc is live
export const LIGHT_ACTIVE_END = 0.16; // s — arc dead after this
export const COMBO_BUFFER = 0.5; // s to continue the chain after a swing ends
export const HEAVY_SWING_DURATION = 0.35; // s
export const HEAVY_ACTIVE_START = 0.05; // s
export const HEAVY_ACTIVE_END = 0.24; // s
export const HEAVY_CHARGE_MIN = 0.35; // s held → release fires a heavy
export const HEAVY_STAMINA_COST = 30; // spec 4.1
export const FISH_TARGET_ID = 0; // hit-event targetId for the single M1 fish

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Arc-vs-circle: does the target circle overlap the sector in front of the
// player? Facing uses the world convention (0 = +Z, +PI/2 = +X). The radial
// check lets the fish's near edge reach the arc rim; the angular check adds the
// fish's half-angle (asin(r/d)) as seen from the player, so the boundary is the
// true circle-vs-wedge overlap, inclusive at the edge.
export function arcCircleHit(
  px: number,
  pz: number,
  facing: number,
  fx: number,
  fz: number,
  radius: number,
  reach: number,
  arcHalfDeg: number,
): boolean {
  const dx = fx - px;
  const dz = fz - pz;
  const dist = Math.hypot(dx, dz);
  if (dist > reach + radius) return false;
  if (dist < 1e-6) return true; // target standing on the player is always in arc
  const delta = Math.abs(wrapPi(Math.atan2(dx, dz) - facing));
  const half = (arcHalfDeg * Math.PI) / 180;
  const margin = Math.asin(Math.min(1, radius / dist));
  return delta <= half + margin;
}

function lightStageDamage(stage: number): number {
  const idx = Math.min(LIGHT_DAMAGE.length - 1, Math.max(0, stage - 1));
  return LIGHT_DAMAGE[idx] ?? LIGHT_DAMAGE[0];
}

// --- M7 (plan 05 §2.2): the Snatcher is a SECOND TARGET for the SAME SWING ----
//
// THE KILL-VERB REUSE DECISION: no new verb, no new button, no new arc, no new
// damage model. The gaff the keeper already owns — the light combo and the
// heavy — is the whole kill. What the Snatcher adds is only WHERE that swing is
// measured from, because a boat fight has no keeper standing on the water:
//
//   • ON FOOT the origin is the keeper and the facing is the swing's own locked
//     facing — the ordinary arc, unchanged, "gaff combo in reach";
//   • ABOARD the origin is the hull and the facing is the bearing from the hull
//     to the catch: the gunwale the line actually runs over. Aboard, facing is
//     not a driven quantity (the on-foot controller is a no-op in boat mode), so
//     an aimed arc would be an arc nobody could aim — the side the line is on IS
//     the aim.
//
// And it is only ever in that arc while it is SURFACED (enemies/snatcher.ts's
// down/up cycle): latched, it is under, working the catch. The timing is the
// skill; the swing is the one already in the player's hands.
//
// The catch's own hit test below is UNTOUCHED — it still measures from the
// keeper exactly as it always has, so no zone-1/2 fight moves.
export interface GaffArc {
  x: number;
  z: number;
  facing: number;
}

export function snatcherGaffArc(world: WorldState): GaffArc | null {
  const s = world.snatcher;
  if (s.phase !== 'latched' || !s.surfaced) return null;
  const fight = world.tether.fights.find((f) => f.id === s.fightId);
  const fish = world.fish;
  if (!fight || !fish) return null;
  if (fight.anchor === 'boat') {
    const b = world.boat;
    return { x: b.x, z: b.z, facing: Math.atan2(fish.x - b.x, fish.z - b.z) };
  }
  return { x: world.player.x, z: world.player.z, facing: world.combat.swingFacing };
}

// The Snatcher's body radius for the arc test — it is a long eel, but what the
// swing has to catch is the part of it at the gunwale.
export const SNATCHER_HIT_RADIUS = 0.6;

function startSwing(world: WorldState, isHeavy: boolean): void {
  const c = world.combat;
  c.attackTimer = isHeavy ? HEAVY_SWING_DURATION : LIGHT_SWING_DURATION;
  c.swingFacing = world.player.facing; // lock the facing at swing start
  c.swingIsHeavy = isHeavy;
  c.swingHitDelivered = false;
  if (isHeavy) {
    c.comboStage = 0; // a heavy consumes the light chain
    c.comboWindow = 0;
  }
}

function startLightTap(world: WorldState): void {
  const c = world.combat;
  if (c.comboStage === 0) c.comboStage = 1;
  else if (c.comboWindow > 0) c.comboStage = (c.comboStage % 3) + 1; // advance in buffer
  else c.comboStage = 1; // chain lapsed — restart at stage 1
  c.comboWindow = 0; // re-armed when this swing ends
  startSwing(world, false);
}

export function updateCombat(world: WorldState, dt: number): void {
  const c = world.combat;

  // CONTRACT: cleared at the START of every tick. Systems running after combat
  // (the fish AI in the spawn slot) read the fresh events pushed this tick.
  c.hits.length = 0;

  // Submerged (plan 02 §8): gaff is NOT a water verb — the player can only
  // reel / cut / struggle while under. Mirror the dodge branch: cancel any
  // swing/wind-up and remember the primary level so a press while surfacing
  // doesn't ghost into a swing.
  if (world.water.active) {
    c.comboStage = 0;
    c.comboWindow = 0;
    c.attackTimer = 0;
    c.heavyCharge = 0;
    c.swingHitDelivered = false;
    c.primaryPrev = world.intent.primary;
    return;
  }

  // A dodge resets the whole chain and cancels any swing or wind-up in
  // progress. Taps during the roll are ignored entirely.
  if (world.player.dodge.active) {
    c.comboStage = 0;
    c.comboWindow = 0;
    c.attackTimer = 0;
    c.heavyCharge = 0;
    c.swingHitDelivered = false;
    c.primaryPrev = world.intent.primary;
    return;
  }

  // Tick the swing timer; when it ends, arm the combo buffer (light) or clear
  // the chain (heavy).
  const wasSwinging = c.attackTimer > 0;
  if (wasSwinging) c.attackTimer = Math.max(0, c.attackTimer - dt);
  if (wasSwinging && c.attackTimer === 0) {
    if (c.swingIsHeavy) {
      c.comboStage = 0;
      c.comboWindow = 0;
    } else {
      c.comboWindow = COMBO_BUFFER;
    }
  }

  // Rising edge of LMB = the press that begins a wind-up.
  const press = world.intent.primary && !c.primaryPrev;
  c.primaryPrev = world.intent.primary;

  if (world.intent.primary) {
    if (c.attackTimer === 0) {
      if (press) c.heavyCharge = dt; // fresh press while idle begins a wind-up
      else if (c.heavyCharge > 0) c.heavyCharge += dt; // continuing hold
    }
    // a press during an active swing is ignored — no charge, no combo advance
  } else if (c.heavyCharge > 0) {
    // release resolves the hold: heavy past the threshold, light below it
    if (c.heavyCharge >= HEAVY_CHARGE_MIN) {
      if (spendStamina(world.player, HEAVY_STAMINA_COST)) startSwing(world, true);
      // insufficient stamina → degrades to nothing, never a light
    } else {
      startLightTap(world);
    }
    c.heavyCharge = 0;
  }

  // Let the combo buffer lapse. Runs after charge handling so the buffer is
  // frozen from the very first frame of a wind-up (heavyCharge > 0) — charging
  // "holds" the light combo chain.
  if (c.attackTimer === 0 && c.comboWindow > 0 && c.heavyCharge === 0) {
    c.comboWindow = Math.max(0, c.comboWindow - dt);
    if (c.comboWindow === 0) c.comboStage = 0;
  }

  // A swing locks the facing for its duration (re-asserted after movement ran).
  if (c.attackTimer > 0) world.player.facing = c.swingFacing;

  // Active-window hit detection — at most one hit per swing.
  if (c.attackTimer > 0 && !c.swingHitDelivered) {
    // M7: a surfaced Snatcher takes the swing FIRST. It is at the gunwale, on
    // the line, between the keeper and everything else — and it is the reason
    // the swing was thrown. Nothing here runs unless one is latched AND up.
    const arc = snatcherGaffArc(world);
    if (arc) {
      const isHeavy = c.swingIsHeavy;
      const dur = isHeavy ? HEAVY_SWING_DURATION : LIGHT_SWING_DURATION;
      const elapsed = dur - c.attackTimer;
      const activeStart = isHeavy ? HEAVY_ACTIVE_START : LIGHT_ACTIVE_START;
      const activeEnd = isHeavy ? HEAVY_ACTIVE_END : LIGHT_ACTIVE_END;
      const s = world.snatcher;
      if (elapsed >= activeStart && elapsed < activeEnd) {
        const arcHalf = (isHeavy ? HEAVY_ARC_DEG : LIGHT_ARC_DEG) / 2;
        if (
          arcCircleHit(arc.x, arc.z, arc.facing, s.x, s.z, SNATCHER_HIT_RADIUS, REACH, arcHalf)
        ) {
          const damage = isHeavy ? HEAVY_DAMAGE : lightStageDamage(c.comboStage);
          const dx = s.x - arc.x;
          const dz = s.z - arc.z;
          const dist = Math.hypot(dx, dz) || 1;
          const kb = isHeavy ? HEAVY_KNOCKBACK : LIGHT_KNOCKBACK;
          c.hits.push({
            targetId: SNATCHER_TARGET_ID,
            damage,
            knockbackX: (dx / dist) * kb,
            knockbackZ: (dz / dist) * kb,
            stagger: isHeavy ? HEAVY_STAGGER : 0,
          });
          c.swingHitDelivered = true;
        }
      }
    }
  }

  if (c.attackTimer > 0 && !c.swingHitDelivered) {
    const fish = world.fish;
    if (fish && fish.hp > 0) {
      const isHeavy = c.swingIsHeavy;
      const dur = isHeavy ? HEAVY_SWING_DURATION : LIGHT_SWING_DURATION;
      const elapsed = dur - c.attackTimer;
      const activeStart = isHeavy ? HEAVY_ACTIVE_START : LIGHT_ACTIVE_START;
      const activeEnd = isHeavy ? HEAVY_ACTIVE_END : LIGHT_ACTIVE_END;
      if (elapsed >= activeStart && elapsed < activeEnd) {
        const arcHalf = (isHeavy ? HEAVY_ARC_DEG : LIGHT_ARC_DEG) / 2;
        const p = world.player;
        if (arcCircleHit(p.x, p.z, c.swingFacing, fish.x, fish.z, fish.radius, REACH, arcHalf)) {
          const damage = isHeavy ? HEAVY_DAMAGE : lightStageDamage(c.comboStage);
          const kb = isHeavy ? HEAVY_KNOCKBACK : LIGHT_KNOCKBACK;
          const dx = fish.x - p.x;
          const dz = fish.z - p.z;
          const dist = Math.hypot(dx, dz) || 1;
          const dirX = dx / dist;
          const dirZ = dz / dist;
          fish.hp = Math.max(0, fish.hp - damage);
          fish.hitFlash = HIT_FLASH;
          fish.vx += dirX * kb; // knockback impulse, away from the player
          fish.vz += dirZ * kb;
          c.hits.push({
            targetId: FISH_TARGET_ID,
            damage,
            knockbackX: dirX * kb,
            knockbackZ: dirZ * kb,
            stagger: isHeavy ? HEAVY_STAGGER : 0,
          });
          c.swingHitDelivered = true;
        }
      }
    }
  }
}