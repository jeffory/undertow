// EntityStore — flat-array, SoA storage (plan 01 §2.1, spec 8.3).
// Entities are indices into parallel typed arrays. No classes, no registry.

export type EntityId = number;

export interface EntityStore {
  positions: Float32Array; // x,y,z per entity (flat, SoA)
  velocities: Float32Array; // x,y,z
  radii: Float32Array; // circle collision radius
  active: Uint8Array; // 0/1 liveness
  free: EntityId[]; // reused ids
  alive: number;
}

export const MAX_ENTITIES = 4096;

export function createEntityStore(): EntityStore {
  return {
    positions: new Float32Array(MAX_ENTITIES * 3),
    velocities: new Float32Array(MAX_ENTITIES * 3),
    radii: new Float32Array(MAX_ENTITIES),
    active: new Uint8Array(MAX_ENTITIES),
    free: [],
    alive: 0,
  };
}

export function spawnEntity(store: EntityStore): EntityId {
  const id = store.free.pop() ?? store.alive;
  if (id >= MAX_ENTITIES) {
    throw new Error('entity store exhausted');
  }
  store.active[id] = 1;
  store.alive = Math.max(store.alive, id + 1);
  store.radii[id] = 0.5;
  const p = id * 3;
  store.positions[p] = 0;
  store.positions[p + 1] = 0;
  store.positions[p + 2] = 0;
  store.velocities[p] = 0;
  store.velocities[p + 1] = 0;
  store.velocities[p + 2] = 0;
  return id;
}

export function destroyEntity(store: EntityStore, id: EntityId): void {
  if (id >= store.active.length || !store.active[id]) return;
  store.active[id] = 0;
  store.free.push(id);
}
