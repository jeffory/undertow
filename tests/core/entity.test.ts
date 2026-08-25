import { describe, it, expect } from 'vitest';
import { createEntityStore, spawnEntity, destroyEntity, MAX_ENTITIES } from '../../src/core/entity';

describe('EntityStore', () => {
  it('spawn assigns unique ids', () => {
    const store = createEntityStore();
    const ids = new Set<number>();
    for (let i = 0; i < 10; i++) {
      const id = spawnEntity(store);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      expect(store.active[id]).toBe(1);
    }
    expect(store.alive).toBe(10);
  });

  it('destroy recycles via free list', () => {
    const store = createEntityStore();
    const a = spawnEntity(store);
    const b = spawnEntity(store);
    const c = spawnEntity(store);
    destroyEntity(store, b);
    expect(store.active[b]).toBe(0);
    expect(store.free).toContain(b);
    // next spawn reuses the freed id
    const d = spawnEntity(store);
    expect(d).toBe(b);
    expect(store.active[b]).toBe(1);
    expect(d).not.toBe(a);
    expect(d).not.toBe(c);
  });

  it('active flags are correct through spawn/destroy cycles', () => {
    const store = createEntityStore();
    const ids = [spawnEntity(store), spawnEntity(store), spawnEntity(store)];
    ids.forEach((id, i) => expect(store.active[id]).toBe(1));
    destroyEntity(store, ids[1]!);
    expect(store.active[ids[0]!]).toBe(1);
    expect(store.active[ids[1]!]).toBe(0);
    expect(store.active[ids[2]!]).toBe(1);
    // destroying twice is a no-op
    destroyEntity(store, ids[1]!);
    expect(store.free.filter((id) => id === ids[1]).length).toBe(1);
  });

  it('destroyEntity on an unknown id is a no-op', () => {
    const store = createEntityStore();
    const id = spawnEntity(store);
    destroyEntity(store, id);
    // far out of range id
    destroyEntity(store, 999999);
    expect(store.free).toEqual([id]);
  });

  it('respects the MAX_ENTITIES bound', () => {
    const store = createEntityStore();
    for (let i = 0; i < MAX_ENTITIES; i++) {
      spawnEntity(store);
    }
    expect(store.alive).toBe(MAX_ENTITIES);
    expect(() => spawnEntity(store)).toThrow(/exhausted/);
  });

  it('still works after exhaustion if entities are freed', () => {
    const store = createEntityStore();
    for (let i = 0; i < MAX_ENTITIES; i++) spawnEntity(store);
    destroyEntity(store, 0);
    const id = spawnEntity(store);
    expect(id).toBe(0);
    expect(store.alive).toBe(MAX_ENTITIES);
  });
});