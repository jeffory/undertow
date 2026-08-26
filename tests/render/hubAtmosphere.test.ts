// THE HUB'S ATMOSPHERIC CONSEQUENCES (render seams) — task t21. The two setters
// the meta layer pushes through at boot / after a decant / after a restoration
// (plan 05 §1.1): the lighthouse beam on `1 − f(totalDecants)`, and the shore
// water's near-shore stain on restoredCount/8.
//
// Pure Node + three (no DOM, no GL): only the module seams are called — the
// beam mesh and the water material are never built, so these pin the ARITHMETIC
// the shader/material reads, not a frame.

import { describe, it, expect } from 'vitest';
import { freshMetaState } from '../../src/save/migrate';
import type { MetaState } from '../../src/save/schemas';
import { DECANT_POOL, hubLightCurve } from '../../src/meta/bottledLight';
import { setHubDecants, hubBeamState } from '../../src/render/sky';
import { setShoreRestoration, shoreWarmth, RESTORED_MAX } from '../../src/render/water';
import { applyHubMeta } from '../../src/render/hubAtmosphere';
import { BUILDINGS } from '../../src/content/buildings';

describe('the beam seam (setHubDecants)', () => {
  it('reports the untouched lamp at zero decants', () => {
    setHubDecants(0);
    const s = hubBeamState();
    expect(s.decants).toBe(0);
    expect(s.intensityScale).toBe(1);
    expect(s.sweepScale).toBe(1);
    expect(s.coolness).toBe(0);
    expect(s.opacity).toBeGreaterThan(0);
  });

  it('dims, cools and slows monotonically as bottles are poured', () => {
    setHubDecants(0);
    const base = hubBeamState();
    let prevOpacity = base.opacity;
    let prevSweep = base.sweepScale;
    for (let d = 1; d <= DECANT_POOL; d++) {
      setHubDecants(d);
      const s = hubBeamState();
      expect(s.opacity).toBeLessThan(prevOpacity);
      expect(s.sweepScale).toBeLessThan(prevSweep);
      expect(s.coolness).toBeGreaterThan(0);
      expect(s.color).not.toBe(base.color); // the colour is walking off warm
      prevOpacity = s.opacity;
      prevSweep = s.sweepScale;
    }
  });

  it('scales the beam opacity by exactly the curve (the screenshot is the math)', () => {
    setHubDecants(0);
    const full = hubBeamState().opacity;
    setHubDecants(3);
    expect(hubBeamState().opacity).toBeCloseTo(full * hubLightCurve(3).intensityScale, 8);
  });

  it('clamps a decant count past the pool', () => {
    setHubDecants(DECANT_POOL);
    const atPool = hubBeamState();
    setHubDecants(DECANT_POOL + 20);
    expect(hubBeamState().opacity).toBeCloseTo(atPool.opacity, 8);
    setHubDecants(0);
  });
});

describe('the shore-stain seam (setShoreRestoration)', () => {
  it('is zero on an unrestored shore', () => {
    setShoreRestoration(0);
    expect(shoreWarmth()).toBe(0);
  });

  it('walks to 1 across the eight ledger rows', () => {
    expect(BUILDINGS.length).toBe(RESTORED_MAX);
    for (let n = 0; n <= RESTORED_MAX; n++) {
      setShoreRestoration(n);
      expect(shoreWarmth()).toBeCloseTo(n / RESTORED_MAX, 8);
    }
  });

  it('clamps outside the ledger', () => {
    setShoreRestoration(-3);
    expect(shoreWarmth()).toBe(0);
    setShoreRestoration(99);
    expect(shoreWarmth()).toBe(1);
    setShoreRestoration(0);
  });
});

describe('applyHubMeta (one seam, both consequences)', () => {
  it('reads the beam AND the water off one MetaState', () => {
    const meta: MetaState = {
      ...freshMetaState(),
      decants: 4,
      buildings: {
        smokehouse: { restored: true, paid: 40, atRun: 0 },
        chandlery: { restored: true, paid: 45, atRun: 1 },
      },
    };
    applyHubMeta(meta);
    expect(hubBeamState().decants).toBe(4);
    expect(hubBeamState().intensityScale).toBeCloseTo(hubLightCurve(4).intensityScale, 8);
    expect(shoreWarmth()).toBeCloseTo(2 / RESTORED_MAX, 8);
  });

  it('a null save (first boot) leaves both at their untouched values', () => {
    applyHubMeta(null);
    expect(hubBeamState().intensityScale).toBe(1);
    expect(shoreWarmth()).toBe(0);
  });
});
