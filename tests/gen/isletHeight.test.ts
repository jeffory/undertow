import { describe, it, expect } from 'vitest';
import { generateLake } from '../../src/gen/lakeMap';
import {
  isletHeightAt,
  isletPeakRise,
  isletMaxRadius,
  ISLET_RISE_MIN,
  ISLET_RISE_MAX,
} from '../../src/gen/isletHeight';
import { createWorld } from '../../src/core/world';
import { ensureLake, dockPlayer, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { groundYAt } from '../../src/render/lake';

const SEEDS = [1, 2, 3, 7, 42, 99, 2024, 31415];

describe('islet height field: determinism (task t2)', () => {
  it('same lake → identical heights at sampled points', () => {
    for (const seed of SEEDS) {
      const a = generateLake(seed);
      const b = generateLake(seed);
      for (const iso of a.islets) {
        for (const [x, z] of [
          [iso.center.x, iso.center.z],
          [iso.center.x + 2, iso.center.z + 3],
          [iso.poly[0]!.x, iso.poly[0]!.z],
          [-iso.center.x, iso.center.z + 1],
        ] as const) {
          expect(isletHeightAt(iso, x, z)).toBeCloseTo(
            isletHeightAt(b.islets[iso.id]!, x, z),
            9,
          );
        }
      }
    }
  });

  it('repeated sampling of one islet is stable (render + grounding agree)', () => {
    const lake = generateLake(42);
    const iso = lake.islets[0]!;
    for (let i = 0; i < 20; i++) {
      const x = iso.center.x + (i * 1.7) % isletMaxRadius(iso);
      const z = iso.center.z + (i * 2.3) % isletMaxRadius(iso);
      expect(isletHeightAt(iso, x, z)).toBe(isletHeightAt(iso, x, z));
    }
  });

  it('different islet ids give different terrain (not a global dome)', () => {
    const lake = generateLake(42);
    const a = lake.islets[0];
    const b = lake.islets[1];
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // same relative offset, different islets — heights must diverge somewhere
    const diffs = [0, 1, 2, 3, 4].map((k) =>
      Math.abs(
        isletHeightAt(a!, a!.center.x + k, a!.center.z) -
          isletHeightAt(b!, b!.center.x + k, b!.center.z),
      ),
    );
    expect(Math.max(...diffs)).toBeGreaterThan(0.01);
  });
});

describe('islet height field: shape and bounds', () => {
  it('heights are never negative and stay within a gentle band', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed);
      for (const iso of lake.islets) {
        expect(isletPeakRise(iso)).toBeGreaterThanOrEqual(ISLET_RISE_MIN);
        expect(isletPeakRise(iso)).toBeLessThanOrEqual(ISLET_RISE_MAX);
        const r = isletMaxRadius(iso);
        for (let k = 0; k < 24; k++) {
          const ang = (k / 24) * Math.PI * 2;
          const t = (k % 4) / 4; // 0, 0.25, 0.5, 0.75
          const x = iso.center.x + Math.cos(ang) * r * t;
          const z = iso.center.z + Math.sin(ang) * r * t;
          const h = isletHeightAt(iso, x, z);
          expect(h, `seed ${seed} islet ${iso.id}`).toBeGreaterThanOrEqual(0);
          expect(h, `seed ${seed} islet ${iso.id}`).toBeLessThanOrEqual(1.3);
        }
      }
    }
  });

  it('rises toward the centre: centre is clearly above the shoreline', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed);
      for (const iso of lake.islets) {
        const cH = isletHeightAt(iso, iso.center.x, iso.center.z);
        // shoreline samples (t 0.8-1.0) hug the waterline
        const r = isletMaxRadius(iso);
        const rimH = Math.max(
          ...Array.from({ length: 8 }, (_, k) => {
            const ang = (k / 8) * Math.PI * 2;
            return isletHeightAt(iso, iso.center.x + Math.cos(ang) * r * 0.95, iso.center.z + Math.sin(ang) * r * 0.95);
          }),
        );
        expect(cH, `seed ${seed} islet ${iso.id} centre=${cH.toFixed(3)} rim=${rimH.toFixed(3)}`)
          .toBeGreaterThan(rimH + 0.1);
      }
    }
  });

  it('shoreline rim is at the waterline: height near the edge is small', () => {
    for (const seed of SEEDS) {
      const lake = generateLake(seed);
      for (const iso of lake.islets) {
        const r = isletMaxRadius(iso);
        let maxRim = 0;
        for (const v of iso.poly) {
          const d = Math.hypot(v.x - iso.center.x, v.z - iso.center.z);
          const t = d / r;
          const x = iso.center.x + (v.x - iso.center.x) * (0.99 / t);
          const z = iso.center.z + (v.z - iso.center.z) * (0.99 / t);
          maxRim = Math.max(maxRim, isletHeightAt(iso, x, z));
        }
        expect(maxRim, `seed ${seed} islet ${iso.id}`).toBeLessThan(0.15);
      }
    }
  });

  it('points beyond the rim clamp to the waterline (dragged-out fish reads afloat)', () => {
    const lake = generateLake(42);
    const iso = lake.islets[0]!;
    const far = iso.center.x + isletMaxRadius(iso) * 5;
    expect(isletHeightAt(iso, far, iso.center.z)).toBe(0);
    expect(isletHeightAt(iso, iso.center.x, iso.center.z + 40)).toBe(0);
  });
});

describe('grounding seam (groundYAt)', () => {
  it('flat GROUND_Y when there is no lake', () => {
    const w = createWorld(1);
    expect(w.lake).toBeNull();
    expect(groundYAt(w, 3, 4)).toBe(0.25);
  });

  it('flat GROUND_Y when not docked (boat mode)', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    expect(w.dockedIslet).toBeNull();
    expect(groundYAt(w, 5, 6)).toBe(0.25);
  });

  it('terrain height when docked — matches the pure sampler', () => {
    const w = createWorld(4242);
    ensureLake(w);
    spawnAtLakeStart(w);
    const start = w.lake!.islets[w.lake!.startIslet]!;
    dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
    const x = w.player.x;
    const z = w.player.z;
    expect(groundYAt(w, x, z)).toBeCloseTo(0.25 + isletHeightAt(start, x, z), 9);
  });

  it('docked player heights stay gentle across seeds (combat readability)', () => {
    for (const seed of SEEDS) {
      const w = createWorld(seed);
      ensureLake(w);
      spawnAtLakeStart(w);
      const start = w.lake!.islets[w.lake!.startIslet]!;
      dockPlayer(w, start.id, { x: start.center.x, z: start.center.z });
      const y = groundYAt(w, w.player.x, w.player.z);
      // the docked player never stands more than ~1.3 m above the waterline
      expect(y).toBeGreaterThanOrEqual(0.25);
      expect(y).toBeLessThanOrEqual(0.25 + 1.3);
    }
  });
});