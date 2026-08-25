import { describe, it, expect } from 'vitest';
import {
  stepBoatKinematics,
  ACCEL_FWD,
  ACCEL_REV,
  MAX_SPEED,
  MAX_REV,
  DRAG,
  TURN_RATE,
  TURN_SPEED_PENALTY,
} from '../../src/game/boatPhysics';
import { createWorld } from '../../src/core/world';

const DT = 1 / 60;
const intent = (moveX: number, moveY: number) => {
  const w = createWorld();
  w.intent.moveX = moveX;
  w.intent.moveY = moveY;
  return w.intent;
};

describe('stepBoatKinematics', () => {
  it('forward thrust accelerates toward MAX_SPEED', () => {
    const boat = createWorld().boat;
    for (let i = 0; i < 300; i++) {
      stepBoatKinematics(boat, intent(0, 1), DT);
      expect(boat.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
    }
    // full-throttle forward over 5s reaches the cap
    expect(boat.speed).toBeCloseTo(MAX_SPEED, 6);
    // and it built up monotonically (never negative)
    expect(boat.speed).toBeGreaterThan(0);
  });

  it('exponential drag glides after thrust is released', () => {
    const boat = createWorld().boat;
    boat.speed = 3;
    const expected = 3 * (1 - DRAG * DT);
    stepBoatKinematics(boat, intent(0, 0), DT);
    expect(boat.speed).toBeCloseTo(expected, 10);
    // after 120 steps (~2s) it has decayed substantially and is still positive
    for (let i = 0; i < 120; i++) stepBoatKinematics(boat, intent(0, 0), DT);
    expect(boat.speed).toBeGreaterThan(0);
    expect(boat.speed).toBeLessThan(3 * 0.4);
  });

  it('reverse is weaker than forward', () => {
    const fwd = createWorld().boat;
    const rev = createWorld().boat;
    stepBoatKinematics(fwd, intent(0, 1), DT);
    stepBoatKinematics(rev, intent(0, -1), DT);
    // one step: speed += accel*dt, then drag applies to the new speed
    expect(fwd.speed).toBeCloseTo(ACCEL_FWD * DT * (1 - DRAG * DT), 10);
    expect(rev.speed).toBeCloseTo(-ACCEL_REV * DT * (1 - DRAG * DT), 10);
    expect(Math.abs(rev.speed)).toBeLessThan(fwd.speed);
    // reverse magnitude is exactly ACCEL_REV/ACCEL_FWD of the forward magnitude
    expect(Math.abs(rev.speed) / fwd.speed).toBeCloseTo(ACCEL_REV / ACCEL_FWD, 10);
  });

  it('turn rate is penalized at speed', () => {
    const still = createWorld().boat;
    stepBoatKinematics(still, intent(1, 0), DT);
    const dStill = Math.abs(still.heading);

    const fast = createWorld().boat;
    fast.speed = MAX_SPEED;
    stepBoatKinematics(fast, intent(1, 0), DT);
    const dFast = Math.abs(fast.heading);

    expect(dFast).toBeLessThan(dStill);
    expect(dFast).toBeCloseTo(dStill * (1 - TURN_SPEED_PENALTY), 10);
    expect(dStill).toBeCloseTo(TURN_RATE * DT, 10);
  });

  it('speed clamps at MAX_SPEED forward and MAX_REV reverse', () => {
    const fwd = createWorld().boat;
    for (let i = 0; i < 1000; i++) stepBoatKinematics(fwd, intent(0, 1), DT);
    expect(fwd.speed).toBe(MAX_SPEED);

    const rev = createWorld().boat;
    for (let i = 0; i < 1000; i++) stepBoatKinematics(rev, intent(0, -1), DT);
    expect(rev.speed).toBe(-MAX_REV);
  });

  it('settles to rest (tiny friction) below the 0.02 deadband', () => {
    const boat = createWorld().boat;
    boat.speed = 0.01;
    stepBoatKinematics(boat, intent(0, 0), DT);
    expect(boat.speed).toBe(0);
  });

  it('does not change position — it is pure kinematics', () => {
    const w = createWorld();
    w.boat.speed = 2;
    w.boat.heading = 0.7;
    const { x, z } = w.boat;
    stepBoatKinematics(w.boat, intent(0, 1), DT);
    expect(w.boat.x).toBe(x);
    expect(w.boat.z).toBe(z);
  });
});