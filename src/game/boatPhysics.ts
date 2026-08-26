// Boat kinematics — pure physics step for the rowable boat (plan 01 §3.4, T7).
// Extracted from game/boat.ts so the motion math can be unit-tested in Node
// without three. No three, no DOM: takes the boat state + intent + fixed dt and
// mutates only the kinematic fields (heading, speed). boat.ts owns everything
// visual (mesh, bob, wake, camera-follow) and calls this each fixed step.

import type { BoatState, WorldState } from '../core/world';
import type { Intent } from '../types/intent';
import { resolveBoatObstacles, BOAT_THUD_KEEP } from './boatObstacle';

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

// Advance the boat's position one fixed step from heading/speed, resolving
// obstacles (islets, wrecks, buoys) at the integration point (qa-issues.md B2,
// task T4). This is the boat half of the movement system's fixed-step
// integration — sim phase, deterministic. A collision slides the boat along the
// obstacle's tangent and drops its speed sharply (a thud, not a bounce); open
// water (no collision) integrates exactly as before.
export function stepBoatMovement(world: WorldState, dt: number): void {
  const boat = world.boat;
  const lake = world.lake;
  if (!lake) {
    // Legacy debug world — plain integration, no obstacles.
    if (boat.speed !== 0) {
      boat.x += Math.sin(boat.heading) * boat.speed * dt;
      boat.z += Math.cos(boat.heading) * boat.speed * dt;
    }
    return;
  }
  const toX = boat.x + Math.sin(boat.heading) * boat.speed * dt;
  const toZ = boat.z + Math.cos(boat.heading) * boat.speed * dt;
  const res = resolveBoatObstacles(lake, { x: boat.x, z: boat.z }, { x: toX, z: toZ });
  boat.x = res.x;
  boat.z = res.z;
  if (res.hit) {
    // 03 §6.1 — a Dragger yaws the hull toward hazards; the boat-combat system
    // prices the thud in hull hp. Recording the speed here (the only place the
    // impact is observable) keeps that system a pure consumer.
    const bc = world.boatCombat;
    if (bc) bc.impactSpeed = Math.max(bc.impactSpeed, Math.abs(boat.speed));
    boat.speed *= BOAT_THUD_KEEP;
  }
}
