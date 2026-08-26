// THE STREET THAT WAS — task t18 slice 3. The hub's building slots are pure
// geometry over the start islet, so the same seed always lays the same street,
// and a building always returns to the SAME slot whatever order the town comes
// back in.

import { describe, it, expect } from 'vitest';
import { generateLake } from '../../src/gen/lakeMap';
import { pointInPolygon } from '../../src/core/poly';
import { isletMaxRadius } from '../../src/gen/isletHeight';
import { lighthouseFoot, streetAxis, townSlot, townSlots } from '../../src/meta/hubStreet';
import { BUILDINGS, buildingSlotIndex } from '../../src/content/buildings';

const SEEDS = [1, 7, 2026, 99999, 4242];

function startIslet(seed: number) {
  const lake = generateLake(seed, 1);
  return lake.islets[lake.startIslet]!;
}

describe('slot determinism', () => {
  it('the same seed lays the same street, every call', () => {
    for (const seed of SEEDS) {
      const a = townSlots(startIslet(seed), BUILDINGS.length);
      const b = townSlots(startIslet(seed), BUILDINGS.length);
      expect(a).toEqual(b);
    }
  });

  it('different seeds lay different streets (the islet is the layout key)', () => {
    const a = townSlots(startIslet(1), BUILDINGS.length);
    const b = townSlots(startIslet(2026), BUILDINGS.length);
    expect(a).not.toEqual(b);
  });

  it('a slot never moves when more of the town comes back', () => {
    const iso = startIslet(2026);
    const full = townSlots(iso, BUILDINGS.length);
    // townSlot() is the render path's single-slot read — same answer, always
    for (let i = 0; i < BUILDINGS.length; i++) {
      expect(townSlot(iso, i, BUILDINGS.length)).toEqual(full[i]);
    }
  });

  it('every building maps to its own distinct slot, in ledger order', () => {
    const indices = BUILDINGS.map((b) => buildingSlotIndex(b.id));
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(indices).size).toBe(BUILDINGS.length);
  });

  it('an unknown id falls back to slot 0 rather than NaN', () => {
    expect(buildingSlotIndex('sunken-casino')).toBe(0);
  });
});

describe('street geometry', () => {
  it('runs from the lighthouse foot toward the islet centre and past it', () => {
    for (const seed of SEEDS) {
      const iso = startIslet(seed);
      const foot = lighthouseFoot(iso);
      const axis = streetAxis(iso);
      const slots = townSlots(iso, BUILDINGS.length);
      // slot 0 is nearer the lighthouse than the last slot
      const d0 = Math.hypot(slots[0]!.x - foot.x, slots[0]!.z - foot.z);
      const dN = Math.hypot(slots.at(-1)!.x - foot.x, slots.at(-1)!.z - foot.z);
      expect(d0).toBeLessThan(dN);
      // the axis is a unit vector
      expect(Math.hypot(axis.x, axis.z)).toBeCloseTo(1, 6);
    }
  });

  it('buildings alternate sides of the street', () => {
    const iso = startIslet(7);
    const axis = streetAxis(iso);
    const perpX = -axis.z;
    const perpZ = axis.x;
    const slots = townSlots(iso, BUILDINGS.length);
    const sides = slots.map((s) => {
      const dx = s.x - iso.center.x;
      const dz = s.z - iso.center.z;
      return Math.sign(dx * perpX + dz * perpZ);
    });
    expect(sides).toEqual([1, -1, 1, -1, 1, -1, 1, -1]);
  });

  it('every slot lands on the walkable islet, not in the water', () => {
    for (const seed of SEEDS) {
      const iso = startIslet(seed);
      for (const slot of townSlots(iso, BUILDINGS.length)) {
        expect(pointInPolygon({ x: slot.x, z: slot.z }, iso.poly)).toBe(true);
      }
    }
  });

  it('the street scales with the islet — never wider than its radius', () => {
    for (const seed of SEEDS) {
      const iso = startIslet(seed);
      const r = isletMaxRadius(iso);
      for (const slot of townSlots(iso, BUILDINGS.length)) {
        expect(Math.hypot(slot.x - iso.center.x, slot.z - iso.center.z)).toBeLessThan(r);
      }
    }
  });

  it('footprint scale stays in a sane band and yaw is finite', () => {
    for (const slot of townSlots(startIslet(1), BUILDINGS.length)) {
      expect(slot.scale).toBeGreaterThan(0.9);
      expect(slot.scale).toBeLessThan(1.1);
      expect(Number.isFinite(slot.yaw)).toBe(true);
    }
  });

  it('a zero/negative count is an empty street, not a throw', () => {
    expect(townSlots(startIslet(1), 0)).toEqual([]);
    expect(townSlots(startIslet(1), -3)).toEqual([]);
  });
});
