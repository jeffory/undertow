// LAKE WORLD — M3 round 1 world integration (task scope 3). Pure logic that
// bridges the generated LakeMap into the WorldState: lake generation, the
// lighthouse-islet run start (boat in the water), boat↔islet docking (approach
// within DOCK_RANGE of an islet edge + B, and B near the boat back aboard), and
// the docked-islet seam the collision / water-phase / spawn systems read. No
// three.

import type { WorldState } from '../core/world';
import { createFish } from '../core/world';
import { generateLake } from './lakeMap';
import type { Islet, LakeMap } from './lakeMap';
import type { Vec2 } from '../core/poly';
import { polygonCentroid, constrainCircleInConvex, distanceToHull } from '../core/poly';

export const DOCK_RANGE = 2; // m — approach within this of an islet edge to dock

// Run start: the boat spawns off the lighthouse islet, in the water, facing the
// lake — just past the islet's maximum reach so it can never sit on land.
export function boatSpawnDist(lake: LakeMap): number {
  return lake.poissonRadius * 0.36 + 8;
}

export function ensureLake(world: WorldState): LakeMap {
  if (!world.lake) world.lake = generateLake(world.seed);
  return world.lake;
}

// The islet the player is currently walking on (foot mode), or null.
export function dockedIslet(world: WorldState): Islet | null {
  if (!world.lake || world.dockedIslet == null) return null;
  return world.lake.islets[world.dockedIslet] ?? null;
}

// Run start (task scope 5): aboard the boat, in the water near the lighthouse
// islet, facing into the lake. The camera follows the boat as before.
export function spawnAtLakeStart(world: WorldState): void {
  const lake = ensureLake(world);
  const start = lake.islets[lake.startIslet]!;
  world.mode = 'boat';
  world.dockedIslet = null;
  world.boat.x = start.center.x + boatSpawnDist(lake);
  world.boat.z = start.center.z;
  world.boat.heading = Math.PI / 2;
  world.boat.speed = 0;
}

// Nearest dockable (walkable) islet whose hull edge is within `range` of (x,z).
// Returns null when no islet is close enough to dock.
export function nearestDockableIslet(
  world: WorldState,
  x: number,
  z: number,
  range: number,
): Islet | null {
  const lake = ensureLake(world);
  let best: Islet | null = null;
  let bestD = range;
  for (const iso of lake.islets) {
    if (iso.kind === 'rock') continue;
    const d = distanceToHull({ x, z }, iso.hull);
    if (d <= bestD) {
      bestD = d;
      best = iso;
    }
  }
  return best;
}

export function playerNearBoat(world: WorldState, range: number): boolean {
  const b = world.boat;
  return Math.hypot(world.player.x - b.x, world.player.z - b.z) <= range;
}

// Hop off the boat onto islet `isletId`. `at` picks the exact landing spot
// (the boot path drops the keeper at the islet centroid); otherwise the player
// lands at the shore nearest the boat. Clamps into the hull either way.
export function dockPlayer(world: WorldState, isletId: number, at?: Vec2): void {
  const lake = ensureLake(world);
  const iso = lake.islets[isletId];
  if (!iso || iso.kind === 'rock') return;
  world.dockedIslet = isletId;
  world.mode = 'foot';
  const target = at ?? { x: world.boat.x, z: world.boat.z };
  const p = constrainCircleInConvex(
    { x: target.x, z: target.z, radius: world.player.radius },
    iso.hull,
  );
  world.player.x = p.x;
  world.player.z = p.z;
  world.player.vx = 0;
  world.player.vz = 0;
}

// Step back aboard the boat (B near the boat).
export function boardBoat(world: WorldState): void {
  world.mode = 'boat';
  world.dockedIslet = null;
}

// Spawn (or reposition) the M1 catch onto the islet the player is docked on,
// a few metres from the player and always inside the hull. Falls back to the
// legacy origin offset when no lake is present.
export function spawnFishOnDockedIslet(world: WorldState): void {
  const fish = world.fish ?? createFish();
  world.fish = fish;
  const iso = dockedIslet(world);
  if (!iso) {
    fish.x = 8;
    fish.z = -6;
    return;
  }
  const p = world.player;
  const c = polygonCentroid(iso.hull);
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const len = Math.hypot(dx, dz) || 1;
  fish.x = p.x + (dx / len) * 4;
  fish.z = p.z + (dz / len) * 4;
  const q = constrainCircleInConvex(
    { x: fish.x, z: fish.z, radius: fish.radius },
    iso.hull,
  );
  fish.x = q.x;
  fish.z = q.z;
}