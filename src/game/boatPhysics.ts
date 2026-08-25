// Boat kinematics — pure physics step for the rowable boat (plan 01 §3.4, T7).
// Extracted from game/boat.ts so the motion math can be unit-tested in Node
// without three. No three, no DOM: takes the boat state + intent + fixed dt and
// mutates only the kinematic fields (heading, speed). boat.ts owns everything
// visual (mesh, bob, wake, camera-follow) and calls this each fixed step.

import type { BoatState } from '../core/world';
import type { Intent } from '../types/intent';

// --- kinematics tuning (feel: heavy at rest, glides once moving, turns wide) --
export const ACCEL_FWD = 4.2; // m/s^2, strong forward thrust
export const ACCEL_REV = 1.6; // m/s^2, weak reverse
export const MAX_SPEED = 4.6; // m/s forward cap
export const MAX_REV = 2.0; // m/s reverse cap
export const DRAG = 0.55; // per-second exponential drag (glide)
export const TURN_RATE = 1.5; // rad/s at rest, full rudder
export const TURN_SPEED_PENALTY = 0.45; // how much speed widens the turn (0..1)

// Advance the boat's heading/speed one fixed step from the intent. Mutates
// `boat` (heading, speed); returns nothing. Behaviour is identical to the
// kinematics previously inline in boat.ts's updateBoat.
export function stepBoatKinematics(boat: BoatState, intent: Intent, dt: number): void {
  // --- heading (turn): wide at speed -----------------------------------------
  const speedFrac = Math.min(Math.abs(boat.speed) / MAX_SPEED, 1);
  const turnScale = 1 - speedFrac * TURN_SPEED_PENALTY;
  boat.heading += intent.moveX * TURN_RATE * turnScale * dt;

  // --- speed (thrust + drag) -------------------------------------------------
  const throttle = intent.moveY; // -1..1, +forward
  const accel = throttle >= 0 ? ACCEL_FWD * throttle : ACCEL_REV * throttle;
  boat.speed += accel * dt;
  boat.speed -= boat.speed * DRAG * dt; // exponential drag → glide
  if (boat.speed > MAX_SPEED) boat.speed = MAX_SPEED;
  if (boat.speed < -MAX_REV) boat.speed = -MAX_REV;
  // tiny friction so it settles to rest
  if (Math.abs(boat.speed) < 0.02) boat.speed = 0;
}
