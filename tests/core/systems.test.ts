import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { UPDATE_ORDER, movement, collision } from '../../src/core/systems';

describe('systems: movement', () => {
  it('boat position integrates heading·speed·dt', () => {
    const world = createWorld();
    world.boat.x = 0;
    world.boat.z = 0;
    world.boat.heading = Math.PI / 2; // facing +X
    world.boat.speed = 2;

    movement(world, 1 / 60);
    // over 1/60s at 2 m/s → 2/60 ≈ 0.0333 m along +X
    const dx = Math.sin(world.boat.heading) * world.boat.speed * (1 / 60);
    expect(world.boat.x).toBeCloseTo(dx, 10);
    expect(world.boat.z).toBeCloseTo(0, 10);
  });

  it('heading+speed composes direction in XZ plane', () => {
    const world = createWorld();
    world.boat.heading = 0; // facing +Z
    world.boat.speed = 3;
    movement(world, 1);
    expect(world.boat.x).toBeCloseTo(0, 10);
    expect(world.boat.z).toBeCloseTo(3, 10);
  });

  it('no movement when speed is zero', () => {
    const world = createWorld();
    world.boat.speed = 0;
    world.boat.heading = 1.2;
    movement(world, 1);
    expect(world.boat.x).toBe(0);
    expect(world.boat.z).toBe(0);
  });

  it('movement does not mutate heading or speed', () => {
    const world = createWorld();
    world.boat.heading = 0.5;
    world.boat.speed = 4;
    movement(world, 1 / 60);
    expect(world.boat.heading).toBe(0.5);
    expect(world.boat.speed).toBe(4);
  });

  it('is a member of UPDATE_ORDER in the contract position (after tetherConstraint, before collision)', () => {
    const idx = UPDATE_ORDER.indexOf(movement);
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(UPDATE_ORDER.length - 1);
  });
});

describe('systems: movement (foot-mode player integration)', () => {
  it('integrates player vx/vz into position in foot mode', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.player.vx = 3;
    w.player.vz = -2;
    movement(w, 1 / 60);
    expect(w.player.x).toBeCloseTo(3 / 60, 10);
    expect(w.player.z).toBeCloseTo(-2 / 60, 10);
  });

  it('does not move the player when vx/vz are zero', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.player.x = 1;
    w.player.z = -1;
    movement(w, 1);
    expect(w.player.x).toBe(1);
    expect(w.player.z).toBe(-1);
  });

  it('keeps the boat parked in foot mode even with heading/speed set', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.boat.heading = Math.PI / 2;
    w.boat.speed = 4;
    movement(w, 1);
    expect(w.boat.x).toBe(0);
    expect(w.boat.z).toBe(0);
  });

  it('still integrates the boat in boat mode (M0 behaviour unchanged)', () => {
    const w = createWorld(); // mode 'boat'
    w.boat.heading = 0;
    w.boat.speed = 2;
    movement(w, 1);
    expect(w.boat.x).toBe(0);
    expect(w.boat.z).toBeCloseTo(2, 10);
    // the player is untouched in boat mode
    expect(w.player.x).toBe(0);
    expect(w.player.z).toBe(0);
  });

  it('does not integrate the fish — the fish AI owns its own position', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = 4;
    w.fish.z = -3;
    movement(w, 1);
    expect(w.fish.x).toBe(4);
    expect(w.fish.z).toBe(-3);
  });
});

describe('systems: collision (foot-mode land combat)', () => {
  it('is a no-op in boat mode', () => {
    const w = createWorld(); // mode 'boat'
    w.player.x = 50; // far outside the islet boundary
    collision(w, 1 / 60);
    expect(w.player.x).toBe(50);
  });

  it('pulls the player back inside the ground boundary', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.player.x = 25; // boundary radius 20, player radius 0.5 → max centre dist 19.5
    w.player.z = 0;
    collision(w, 1 / 60);
    expect(Math.hypot(w.player.x, w.player.z)).toBeCloseTo(20 - w.player.radius, 10);
  });

  it('leaves an inside player untouched', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.player.x = 3;
    w.player.z = -2;
    collision(w, 1 / 60);
    expect(w.player.x).toBe(3);
    expect(w.player.z).toBe(-2);
  });

  it('pulls a spawned fish back inside the boundary', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = 30;
    w.fish.z = 0;
    collision(w, 1 / 60);
    expect(Math.hypot(w.fish.x, w.fish.z)).toBeCloseTo(20 - w.fish.radius, 10);
  });

  it('separates overlapping player and fish circles so they no longer overlap', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = w.player.x; // identical spot → degenerate overlap
    w.fish.z = w.player.z;
    collision(w, 1 / 60);
    const dist = Math.hypot(w.fish.x - w.player.x, w.fish.z - w.player.z);
    expect(dist).toBeCloseTo(w.player.radius + w.fish.radius, 10);
  });

  it('leaves non-overlapping player and fish alone', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = 5;
    w.fish.z = 0;
    const px = w.player.x;
    const pz = w.player.z;
    const fx = w.fish.x;
    const fz = w.fish.z;
    collision(w, 1 / 60);
    expect(w.player.x).toBe(px);
    expect(w.player.z).toBe(pz);
    expect(w.fish.x).toBe(fx);
    expect(w.fish.z).toBe(fz);
  });

  it('does not separate a dead fish from the player (walk through it)', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.state = 'dead';
    w.fish.x = 0;
    w.fish.z = 0; // right on the player
    collision(w, 1 / 60);
    expect(w.fish.x).toBe(0);
    expect(w.fish.z).toBe(0);
  });

  it('sits in UPDATE_ORDER after movement', () => {
    const mIdx = UPDATE_ORDER.indexOf(movement);
    const cIdx = UPDATE_ORDER.indexOf(collision);
    expect(cIdx).toBeGreaterThan(mIdx);
  });
});