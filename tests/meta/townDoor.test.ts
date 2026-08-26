// THE LIGHTHOUSE DOOR — task t18 slice 4. The proximity + hold-E verb that opens
// the restoration register, mirroring the descent's contextual hold.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { ensureLake } from '../../src/gen/lakeWorld';
import { lighthouseFoot } from '../../src/meta/hubStreet';
import { DOOR_HOLD_SECONDS, DOOR_RANGE, atLighthouseDoor, updateTownDoor } from '../../src/systems/townDoor';

function footWorldAtDoor(seed = 2026): WorldState {
  const world = createWorld(seed);
  ensureLake(world);
  const lake = world.lake!;
  const iso = lake.islets[lake.startIslet]!;
  const door = lighthouseFoot(iso);
  world.mode = 'foot';
  world.dockedIslet = lake.startIslet;
  world.player.x = door.x;
  world.player.z = door.z;
  return world;
}

function hold(world: WorldState, seconds: number, dt = 1 / 60): void {
  world.intent.extract = true;
  for (let t = 0; t < seconds; t += dt) updateTownDoor(world, dt);
}

describe('proximity', () => {
  it('is at the door when standing on the lighthouse foot', () => {
    expect(atLighthouseDoor(footWorldAtDoor())).toBe(true);
  });

  it('is not at the door from across the islet', () => {
    const world = footWorldAtDoor();
    const iso = world.lake!.islets[world.lake!.startIslet]!;
    const door = lighthouseFoot(iso);
    const dx = iso.center.x - door.x;
    const dz = iso.center.z - door.z;
    const len = Math.hypot(dx, dz) || 1;
    world.player.x = door.x + (dx / len) * (DOOR_RANGE + 1);
    world.player.z = door.z + (dz / len) * (DOOR_RANGE + 1);
    expect(atLighthouseDoor(world)).toBe(false);
  });

  it('is a FOOT verb — never reachable from the boat', () => {
    const world = footWorldAtDoor();
    world.mode = 'boat';
    expect(atLighthouseDoor(world)).toBe(false);
  });

  it('needs both hands: not underwater, not mid-fight', () => {
    const under = footWorldAtDoor();
    under.water.active = true;
    expect(atLighthouseDoor(under)).toBe(false);

    const fighting = footWorldAtDoor();
    fighting.tether.fights.push({} as never);
    expect(atLighthouseDoor(fighting)).toBe(false);
  });

  it('needs the START islet — another islet\'s shore has no register', () => {
    const world = footWorldAtDoor();
    world.dockedIslet = world.lake!.startIslet === 0 ? 1 : 0;
    expect(atLighthouseDoor(world)).toBe(false);
  });
});

describe('the hold', () => {
  it('opens the register after the full hold', () => {
    const world = footWorldAtDoor();
    hold(world, DOOR_HOLD_SECONDS + 0.05);
    expect(world.town.open).toBe(true);
  });

  it('does not open early', () => {
    const world = footWorldAtDoor();
    hold(world, DOOR_HOLD_SECONDS * 0.5);
    expect(world.town.open).toBe(false);
    expect(world.town.held).toBeGreaterThan(0);
  });

  it('releasing resets the hold — no accumulating across taps', () => {
    const world = footWorldAtDoor();
    hold(world, DOOR_HOLD_SECONDS * 0.6);
    world.intent.extract = false;
    updateTownDoor(world, 1 / 60);
    expect(world.town.held).toBe(0);
    hold(world, DOOR_HOLD_SECONDS * 0.6);
    expect(world.town.open).toBe(false);
  });

  it('walking away mid-hold drops it', () => {
    const world = footWorldAtDoor();
    hold(world, DOOR_HOLD_SECONDS * 0.8);
    world.player.x += 500;
    updateTownDoor(world, 1 / 60);
    expect(world.town.near).toBe(false);
    expect(world.town.held).toBe(0);
  });

  it('an open register parks the hold — E does not re-trigger behind it', () => {
    const world = footWorldAtDoor();
    hold(world, DOOR_HOLD_SECONDS + 0.05);
    expect(world.town.open).toBe(true);
    hold(world, DOOR_HOLD_SECONDS * 2);
    expect(world.town.held).toBe(0);
    expect(world.town.open).toBe(true);
  });

  it('tracks `near` for the doorstep prompt without any key held', () => {
    const world = footWorldAtDoor();
    world.intent.extract = false;
    updateTownDoor(world, 1 / 60);
    expect(world.town.near).toBe(true);
    expect(world.town.held).toBe(0);
  });
});
