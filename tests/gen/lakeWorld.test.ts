import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import {
  ensureLake,
  spawnAtLakeStart,
  dockedIslet,
  nearestDockableIslet,
  dockPlayer,
  playerNearBoat,
  spawnFishOnDockedIslet,
  DOCK_RANGE,
} from '../../src/gen/lakeWorld';
import { collision } from '../../src/core/systems';
import { updateWaterPhase } from '../../src/game/waterPhase';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import { pointInConvex } from '../../src/core/poly';

describe('lake world integration (plan 03 §2 + task scope 3)', () => {
  it('ensureLake generates the lake deterministically from world.seed', () => {
    const a = createWorld(4242);
    const b = createWorld(4242);
    ensureLake(a);
    ensureLake(b);
    expect(a.lake).toEqual(b.lake);
    expect(a.lake!.seed).toBe(4242);
  });

  it('spawnAtLakeStart: boat mode, in the water, near the start islet', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    expect(w.mode).toBe('boat');
    expect(w.lake).not.toBeNull();
    const start = w.lake!.islets[w.lake!.startIslet]!;
    // in the water (not inside the start islet polygon)
    expect(pointInConvex({ x: w.boat.x, z: w.boat.z }, start.hull)).toBe(false);
    // near the lighthouse islet
    const d = Math.hypot(w.boat.x - start.center.x, w.boat.z - start.center.z);
    expect(d).toBeLessThan(40);
    // dockedIslet is unset while aboard
    expect(w.dockedIslet).toBeNull();
  });

  it('dockPlayer puts the player on the islet (mode foot, inside the hull)', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
    expect(w.mode).toBe('foot');
    expect(w.dockedIslet).toBe(start.id);
    expect(pointInConvex({ x: w.player.x, z: w.player.z }, start.hull)).toBe(true);
  });

  it('collision keeps the foot player inside the docked islet hull', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
    // shove the player well outside the hull
    w.player.x = start.center.x + 60;
    w.player.z = start.center.z + 60;
    collision(w, 1 / 60);
    expect(pointInConvex({ x: w.player.x, z: w.player.z }, start.hull)).toBe(true);
  });

  it('collision pushes the boat out of islet hulls in boat mode (islets as land)', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const someIslet = w.lake!.islets[0]!;
    w.boat.x = someIslet.center.x;
    w.boat.z = someIslet.center.z; // dead centre of an islet
    collision(w, 1 / 60);
    expect(pointInConvex({ x: w.boat.x, z: w.boat.z }, someIslet.hull)).toBe(false);
  });

  it('nearestDockableIslet: docks within DOCK_RANGE of an edge, null when far', () => {
    const w = createWorld(4242);
    ensureLake(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    // a point 1m off the start islet's edge (radially out from a hull vertex) docks
    const v0 = start.hull[0]!;
    const c = start.center;
    const len = Math.hypot(v0.x - c.x, v0.z - c.z) || 1;
    const edgePoint = { x: v0.x + ((v0.x - c.x) / len), z: v0.z + ((v0.z - c.z) / len) };
    const near = nearestDockableIslet(w, edgePoint.x, edgePoint.z, DOCK_RANGE);
    expect(near).not.toBeNull();
    expect(near!.id).toBe(start.id);
    const far = nearestDockableIslet(w, 200, 200, DOCK_RANGE);
    expect(far).toBeNull();
  });

  it('playerNearBoat: true within range, false far away', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    w.player.x = w.boat.x;
    w.player.z = w.boat.z;
    expect(playerNearBoat(w, DOCK_RANGE)).toBe(true);
    w.player.x = w.boat.x + 50;
    expect(playerNearBoat(w, DOCK_RANGE)).toBe(false);
  });

  it('spawnFishOnDockedIslet places the catch inside the docked islet hull', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
    spawnFishOnDockedIslet(w);
    expect(w.fish).not.toBeNull();
    expect(pointInConvex({ x: w.fish!.x, z: w.fish!.z }, start.hull)).toBe(true);
  });

  it('water phase: a tethered player dragged past the islet shoreline enters/exits', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
    spawnFishOnDockedIslet(w);
    startTetherFight(w, M2_SPECIES, 'player');
    expect(w.tether.fights.length).toBe(1);
    expect(w.water.active).toBe(false);

    // drag the player past the shoreline (a routed tether drag)
    w.player.x = start.center.x + 40;
    w.player.z = start.center.z;
    updateWaterPhase(w, 1 / 60);
    expect(w.water.active).toBe(true);

    // struggle back inside → surfaced, breath reset
    w.player.x = start.center.x;
    w.player.z = start.center.z;
    updateWaterPhase(w, 1 / 60);
    expect(w.water.active).toBe(false);
  });
});