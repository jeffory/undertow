// THE DARKNESS — M8 (plan 05 §2.3). The zone-4 fog-of-war: the lantern radius
// function the Chandlery upgrade feeds, the cue-visibility gate, and the two
// zone seams (fog multiplier + sky darken) that turn a foggy lake into a void.
//
// The load-bearing assertion in this file is the NEGATIVE one: zones 1-3 and 5
// must be byte-identical, which for a gate means `withinLantern` answers `true`
// unconditionally there — a single false would silently stop drawing something
// in the Shallows.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import {
  BOW_LANTERN_MAX_LEVEL,
  BOW_LANTERN_STEP,
  BOW_OFFSET,
  CHOIR_ZONE,
  LANTERN_BASE_RADIUS,
  darknessActive,
  discFraction,
  lanternOrigin,
  lanternRadius,
  lanternRadiusFor,
  withinLantern,
} from '../../src/game/darkness';
import { zoneFogMultiplier, zoneSkyDarken } from '../../src/core/zones';

function worldInZone(zone: number) {
  const w = createWorld(7);
  w.run.zone = zone;
  return w;
}

describe('the lantern radius is ONE function', () => {
  it('level 0 is the stock light distance', () => {
    expect(lanternRadiusFor(0)).toBe(LANTERN_BASE_RADIUS);
  });

  it('each Chandlery bow-lantern level widens it by a fixed fraction', () => {
    for (let n = 0; n <= BOW_LANTERN_MAX_LEVEL; n++) {
      expect(lanternRadiusFor(n)).toBeCloseTo(LANTERN_BASE_RADIUS * (1 + BOW_LANTERN_STEP * n), 9);
    }
  });

  it('caps at the Chandlery‘s top level and floors at 0 (junk in, sane out)', () => {
    expect(lanternRadiusFor(99)).toBe(lanternRadiusFor(BOW_LANTERN_MAX_LEVEL));
    expect(lanternRadiusFor(-3)).toBe(LANTERN_BASE_RADIUS);
    expect(lanternRadiusFor(Number.NaN)).toBe(LANTERN_BASE_RADIUS);
  });

  it('reads the boat-upgrade data that has carried bowLantern since M3', () => {
    const w = worldInZone(CHOIR_ZONE);
    expect(lanternRadius(w)).toBe(LANTERN_BASE_RADIUS);
    w.boatCombat.upgrades.bowLantern = 2;
    expect(lanternRadius(w)).toBeCloseTo(lanternRadiusFor(2), 9);
  });
});

describe('the lantern origin follows the light, not the hull', () => {
  it('aboard, it hangs at the BOW (the same offset render/lantern.ts draws it at)', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'boat';
    w.boat.x = 10;
    w.boat.z = -4;
    w.boat.heading = 0; // +Z
    const at = lanternOrigin(w);
    expect(at.x).toBeCloseTo(10, 9);
    expect(at.z).toBeCloseTo(-4 + BOW_OFFSET, 9);
  });

  it('on foot, it is the keeper', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'foot';
    w.player.x = 3;
    w.player.z = 9;
    expect(lanternOrigin(w)).toEqual({ x: 3, z: 9 });
  });
});

describe('the cue gate', () => {
  it('is live in the Choir and nowhere else', () => {
    for (const zone of [1, 2, 3, 5]) expect(darknessActive(worldInZone(zone))).toBe(false);
    expect(darknessActive(worldInZone(CHOIR_ZONE))).toBe(true);
  });

  it('zones 1-3 and 5 draw EVERYTHING — the gate cannot hide a Shallows ripple', () => {
    for (const zone of [1, 2, 3, 5]) {
      const w = worldInZone(zone);
      w.mode = 'foot';
      for (const d of [0, 5, 20, 100, 5000]) {
        expect(withinLantern(w, d, 0), `zone ${zone} at ${d} m`).toBe(true);
      }
    }
  });

  it('in the Choir, a cue inside the disc is drawn and one outside it is not', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'foot';
    w.player.x = 0;
    w.player.z = 0;
    const r = lanternRadius(w);
    expect(withinLantern(w, r - 1, 0)).toBe(true);
    expect(withinLantern(w, r + 1, 0)).toBe(false);
    // exactly on the rim counts as inside — a cue does not flicker at the edge
    expect(withinLantern(w, r, 0)).toBe(true);
  });

  it('pad widens the disc for cues that are physically large', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'foot';
    const r = lanternRadius(w);
    expect(withinLantern(w, r + 3, 0)).toBe(false);
    expect(withinLantern(w, r + 3, 0, 4)).toBe(true);
  });

  it('a bow lantern widens what is drawn, by the same metre it widens the light', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'foot';
    const far = LANTERN_BASE_RADIUS + 3;
    expect(withinLantern(w, far, 0)).toBe(false);
    w.boatCombat.upgrades.bowLantern = 3;
    expect(withinLantern(w, far, 0)).toBe(true);
    expect(lanternRadius(w)).toBeGreaterThan(far);
  });

  it('discFraction reads 0 at the lamp, 1 at the rim', () => {
    const w = worldInZone(CHOIR_ZONE);
    w.mode = 'foot';
    expect(discFraction(w, 0, 0)).toBeCloseTo(0, 9);
    expect(discFraction(w, lanternRadius(w), 0)).toBeCloseTo(1, 9);
  });
});

describe('the two zone seams that make the void', () => {
  it('the Choir cranks the fog and every other zone is untouched by it', () => {
    expect(zoneFogMultiplier(CHOIR_ZONE)).toBeGreaterThan(4);
    expect(zoneFogMultiplier(1)).toBe(1);
    expect(zoneFogMultiplier(3)).toBe(1);
    expect(zoneFogMultiplier(5)).toBe(1);
  });

  it('the Choir darkens the sky to near-black and every other zone lerps by 0', () => {
    expect(zoneSkyDarken(CHOIR_ZONE)).toBeGreaterThan(0.8);
    expect(zoneSkyDarken(CHOIR_ZONE)).toBeLessThan(1);
    for (const zone of [1, 2, 3, 5]) expect(zoneSkyDarken(zone)).toBe(0);
  });

  it('the fog goes near-total INSIDE the metre range the lantern lights', () => {
    // FogExp2: factor = 1 − exp(−(density·z)²). At the night palette's 0.019
    // base, the Choir multiplier must saturate within ~1.5× the lantern radius —
    // close enough that the lit pool IS the world, far enough that the rim is
    // not a hard wall a metre past the bulb.
    const density = 0.019 * zoneFogMultiplier(CHOIR_ZONE);
    const factorAt = (z: number) => 1 - Math.exp(-Math.pow(density * z, 2));
    expect(factorAt(LANTERN_BASE_RADIUS * 1.5)).toBeGreaterThan(0.98);
    expect(factorAt(LANTERN_BASE_RADIUS * 0.35)).toBeLessThan(0.35);
  });
});
