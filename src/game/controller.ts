// CONTROLLER — WORKER A OWNS THIS FILE.
// M1: 8-dir on-foot controller (plan 01 §4.1). WASD → 8 discrete directions →
// world.player.vx/vz + facing; Space → dodge roll (0.25s i-frames, 0.6s cd,
// 25 stamina, plan §4.2). Called from the intent slot AFTER input, in systems.ts.
//
// Movement does NOT run here: the movement system integrates world.player.x/z
// from vx/vz each fixed step (foot mode only), and the collision system keeps
// the player on the islet. This function only sets velocity / facing / spends
// stamina / drives the dodge state. Boat mode is a no-op.

import type { WorldState } from '../core/world';
import { spendStamina } from './stamina';

// --- tuning constants ---------------------------------------------------------
export const WALK_SPEED = 4.5; // m/s, plan 01 §4.1 ("~4.5 m/s")
export const DODGE_MULT = 2.2; // roll burst speed = 2.2x walk
export const DODGE_SPEED = WALK_SPEED * DODGE_MULT;
export const DODGE_DURATION = 0.28; // s, roll burst (plan §4.2 "~0.28s")
export const DODGE_IFRAMES = 0.25; // s, invulnerability window (plan §4.2)
export const DODGE_COOLDOWN = 0.6; // s, stamina-independent re-roll lock (plan §4.2)
export const DODGE_COST = 25; // stamina, spent via stamina.spendStamina

const EPS = 1e-9; // timer snapping so fixed-step ticks land on exact windows

export function updateController(world: WorldState, dt: number): void {
  if (world.mode !== 'foot') return; // boat mode untouched

  const p = world.player;
  const d = p.dodge;

  // tick roll burst / re-roll cooldown / i-frame timers
  if (d.active) {
    d.timeLeft -= dt;
    if (d.timeLeft <= EPS) {
      d.active = false;
      d.timeLeft = 0;
    }
  }
  d.cooldownLeft -= dt;
  if (d.cooldownLeft <= EPS) d.cooldownLeft = 0;
  p.iframes -= dt;
  if (p.iframes <= EPS) p.iframes = 0;

  // dodge trigger — edge-triggered tap (intent.dodge is true for one step from
  // input.ts). Gated by cooldown first, then stamina: a failed-stamina attempt
  // does NOT start the cooldown. Locked entirely while the tether reel stance is
  // active (plan 02 §5.1: "dodge is suppressed (controller ignores dodge while
  // reel.active)") or while submerged (plan 02 §8: dodge is NOT a water verb).
  const reelActive = world.tether.fights.some((f) => f.reel.active);
  if (
    world.intent.dodge &&
    !reelActive &&
    !world.water.active &&
    d.cooldownLeft <= EPS &&
    spendStamina(p, DODGE_COST)
  ) {
    d.active = true;
    d.timeLeft = DODGE_DURATION;
    d.cooldownLeft = DODGE_COOLDOWN;
    p.iframes = DODGE_IFRAMES;
    const len = Math.hypot(world.intent.moveX, world.intent.moveY);
    if (len > 0) {
      d.dirX = world.intent.moveX / len;
      d.dirZ = world.intent.moveY / len;
    } else {
      // idle roll: burst along the last facing (0 = +Z, +PI/2 = +X)
      d.dirX = Math.sin(p.facing);
      d.dirZ = Math.cos(p.facing);
    }
  }

  if (d.active) {
    // roll burst: steering locked, direction fixed for the burst duration
    p.vx = DODGE_SPEED * d.dirX;
    p.vz = DODGE_SPEED * d.dirZ;
    return;
  }

  // 8-dir walk: normalize the intent axis (input.ts already normalizes, but a
  // raw (1,1) must also land at walk speed) and face along the movement.
  const mx = world.intent.moveX;
  const my = world.intent.moveY;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const nx = mx / len;
    const ny = my / len;
    p.vx = nx * WALK_SPEED;
    p.vz = ny * WALK_SPEED;
    p.facing = Math.atan2(nx, ny);
  } else {
    // idle keeps the last facing
    p.vx = 0;
    p.vz = 0;
  }
}