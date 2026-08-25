// TETHER (game) — plan 06 M2 property tests + T1/T2/T4/T5/T13/T14 acceptance.
// Pins the fun-or-dead math: distance constraint, tension, mass-ratio split,
// brace, reel, cut, snap, determinism. Steps are fixed-DT (FIXED_DT = 1/60) and
// worlds are minimal createWorld() constructions — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish, FISH_RADIUS } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { movement } from '../../src/core/systems';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateTetherFishAI } from '../../src/game/fishAI';
import { startTetherFight, toRunKinds, M2_SPECIES } from '../../src/game/tether';
import { BASE_LINE } from '../../src/game/line';

const DT = FIXED_DT;

// Build a world with the fish at (L + excess, 0) and a fresh player-vs-fish
// fight. The player sits at the origin; n (pull dir) = +X.
function fightWorld(opts: { mass?: number; excess?: number; L?: number } = {}) {
  const { mass = 1.5, excess = 0 } = opts;
  const L = opts.L ?? BASE_LINE.baseLength;
  const w = createWorld(1);
  w.fish = createFish();
  w.fish.tether.mass = mass;
  w.fish.x = L + excess;
  w.fish.z = 0; // createFish defaults to z = -6; tests want the fish on +X
  const fight = startTetherFight(w, M2_SPECIES, 'player', { L });
  expect(fight).not.toBeNull();
  expect(w.tether.fights).toHaveLength(1);
  return { w, fight: fight! };
}

describe('tether constraint — no-op / shape', () => {
  it('is a no-op when no fight is active', () => {
    const w = createWorld(1);
    w.fish = createFish();
    const px = w.player.x;
    const fx = w.fish.x;
    updateTetherConstraint(w, DT);
    expect(w.player.x).toBe(px);
    expect(w.fish.x).toBe(fx);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.tetherEvents).toHaveLength(0);
  });

  it('startTetherFight builds the M2 default endpoints (player vs catch)', () => {
    const { fight } = fightWorld();
    expect(fight.a.owner).toBe('player');
    expect(fight.a.reel.kind).toBe('player-stance');
    expect(fight.a.cut.kind).toBe('lure');
    expect(fight.b.owner).toBe('enemy');
    expect(fight.b.reel.kind).toBe('none');
    expect(fight.b.cut.kind).toBe('none');
    expect(fight.L).toBe(BASE_LINE.baseLength);
    // the catch's exhaustion pool is reset by dial 6 (default 1.0)
    expect(fight.b.mass).toBe(1.5);
  });

  it('generic endpoints: a fixed anchor never moves (mass ∞ → share → 0)', () => {
    const w = createWorld(1);
    w.fish = createFish();
    const fight = startTetherFight(w, M2_SPECIES, 'player', {
      a: {
        anchor: { kind: 'fixed', point: { x: 0, z: 0 } },
        owner: 'world',
        mass: 1e12,
        radius: 0.5,
        reel: { kind: 'none' },
        cut: { kind: 'none' },
      },
      b: {
        anchor: { kind: 'entity', entityId: -2 },
        owner: 'enemy',
        mass: 2,
        radius: FISH_RADIUS,
        reel: { kind: 'none' },
        cut: { kind: 'none' },
      },
      L: 14,
    });
    w.fish.x = 16; // 2m excess
    w.fish.z = 0;
    updateTetherConstraint(w, DT);
    // the player is not an endpoint of this fight and never moved
    expect(w.player.x).toBe(0);
    // the fish absorbed essentially all the excess
    expect(w.fish.x).toBeCloseTo(14, 6);
    expect(fight).not.toBeNull();
  });
});

describe('distance constraint — the fun-or-dead property tests', () => {
  it('after correction |d| never exceeds L — no overshoot on either side', () => {
    const { w, fight } = fightWorld({ excess: 2 });
    updateTetherConstraint(w, DT);
    const d = Math.hypot(w.fish.x - w.player.x, w.fish.z - w.player.z);
    expect(d).toBeLessThanOrEqual(fight.L + 1e-9);
    // both endpoints were corrected, not a single-sided teleport
    expect(w.player.x).toBeGreaterThan(0);
    expect(w.fish.x).toBeLessThan(16);
  });

  it('mass-ratio split sums exactly to the excess (no brace)', () => {
    const { w } = fightWorld({ mass: 3, excess: 2 });
    const pStart = w.player.x;
    const fStart = w.fish.x;
    updateTetherConstraint(w, DT);
    const playerMove = w.player.x - pStart;
    const fishMove = fStart - w.fish.x;
    expect(playerMove + fishMove).toBeCloseTo(2, 9); // reconstructs the excess
    expect(playerMove).toBeCloseTo(2 * (3 / 4), 9);
    expect(fishMove).toBeCloseTo(2 * (1 / 4), 9);
  });

  it('heavier fish moves the player more', () => {
    const light = fightWorld({ mass: 1, excess: 2 });
    const heavy = fightWorld({ mass: 8, excess: 2 });
    updateTetherConstraint(light.w, DT);
    updateTetherConstraint(heavy.w, DT);
    expect(heavy.w.player.x).toBeGreaterThan(light.w.player.x);
    expect(light.w.player.x).toBeCloseTo(2 * (1 / 2), 9);
    expect(heavy.w.player.x).toBeCloseTo(2 * (8 / 9), 9);
  });

  it('tension rises on overshoot at kTension per metre', () => {
    const { w, fight } = fightWorld({ excess: 2 });
    updateTetherConstraint(w, DT);
    expect(fight.tension).toBeCloseTo(2 * 8 * DT, 9);
  });

  it('tension decays on slack and never goes below 0', () => {
    const { w, fight } = fightWorld(); // fish exactly at L — no excess
    fight.tension = -5;
    updateTetherConstraint(w, DT);
    expect(fight.tension).toBe(0); // clamped at the floor
  });

  it('tension clamps at the line ceiling (100)', () => {
    const { w, fight } = fightWorld({ excess: 3 });
    fight.tension = 99.9;
    updateTetherConstraint(w, DT);
    // 99.9 + 3*8*dt = 100.3 → clamped to exactly 100
    expect(fight.tension).toBe(100);
  });
});

describe('brace (T4, dial 4)', () => {
  it('moving into the pull reduces displacement by exactly the dial', () => {
    const { w } = fightWorld({ mass: 1.5, excess: 2 });
    w.intent.moveX = 1; // walk into the pull (+X, toward the fish)
    updateTetherConstraint(w, DT);
    const unbranded = 2 * (1.5 / 2.5); // 1.2 with no brace
    expect(w.player.x).toBeCloseTo(unbranded * (1 - 0.6), 9); // exactly 0.4×
  });

  it('the dial scales brace efficacy live', () => {
    const mk = (efficacy: number) => {
      const { w } = fightWorld({ mass: 1.5, excess: 2 });
      w.tuning.braceEfficacy = efficacy;
      w.intent.moveX = 1;
      updateTetherConstraint(w, DT);
      return w.player.x;
    };
    const unbranded = 1.2;
    expect(mk(0.6)).toBeCloseTo(unbranded * 0.4, 9);
    expect(mk(0.3)).toBeCloseTo(unbranded * 0.7, 9);
    expect(mk(0)).toBeCloseTo(unbranded, 9); // efficacy 0 = no brace
  });

  it('walking WITH the pull applies no brace (oppose = 0)', () => {
    const { w } = fightWorld({ mass: 1.5, excess: 2 });
    w.intent.moveX = -1; // away from the fish (with the pull direction away? no — n = +X)
    updateTetherConstraint(w, DT);
    expect(w.player.x).toBeCloseTo(2 * (1.5 / 2.5), 9); // full displacement
  });
});

describe('reel stance (T2)', () => {
  it('reel shrinks L at reelRate and drains 10 stamina/s', () => {
    const { w, fight } = fightWorld({ L: 14 });
    w.intent.secondary = true;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT); // 1s
    expect(fight.L).toBeCloseTo(14 - BASE_LINE.reelRate, 6);
    expect(w.player.stamina).toBeCloseTo(90, 6);
    expect(fight.reel.active).toBe(true);
  });

  it('L never goes below the fish hook radius', () => {
    const { w, fight } = fightWorld({ L: 14 });
    w.intent.secondary = true;
    for (let i = 0; i < 1200; i++) updateTetherConstraint(w, DT); // 20s
    expect(fight.L).toBeCloseTo(FISH_RADIUS, 6);
  });

  it('reeling stops at 0 stamina — L stops shrinking', () => {
    const { w, fight } = fightWorld({ L: 14 });
    w.player.stamina = 2; // 0.2s of reeling at 10/s
    w.intent.secondary = true;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT); // 1s
    expect(w.player.stamina).toBe(0);
    expect(fight.reel.active).toBe(false);
    expect(fight.L).toBeCloseTo(14 - BASE_LINE.reelRate * 0.2, 6); // 13.5
    const LAfter = fight.L;
    updateTetherConstraint(w, DT); // no more shrink once inactive
    expect(fight.L).toBe(LAfter);
  });

  it('reels an exhausted catch twice as fast', () => {
    const { w, fight } = fightWorld({ L: 14 });
    w.fish!.tether.exhausted = true;
    w.intent.secondary = true;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT); // 1s
    expect(fight.L).toBeCloseTo(14 - BASE_LINE.reelRate * 2, 6);
  });

  it('reeling at low tension exhausts the catch (12/s, plan 6.1)', () => {
    const { w } = fightWorld({ L: 14 });
    w.intent.secondary = true;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT); // 1s, tension stays < 40
    expect(w.fish!.stamina).toBeCloseTo(100 - 12, 6);
    expect(w.fish!.tether.exhausted).toBe(false);
  });
});

describe('cut line (T5)', () => {
  it('fires at exactly 0.5s held, costs the lure, ends the fight', () => {
    const { w, fight } = fightWorld();
    w.intent.cut = true;
    for (let i = 0; i < 29; i++) updateTetherConstraint(w, DT); // just under 0.5s
    expect(fight.cut.fired).toBe(false);
    updateTetherConstraint(w, DT); // 30th step = exactly 0.5s
    expect(fight.cut.fired).toBe(true);
    expect(fight.cut.progress).toBe(1);
    const ev = w.tetherEvents.find((e) => e.type === 'cut');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'cut') {
      expect(ev.cost).toBe('lure');
      expect(ev.fightId).toBe(fight.id);
      expect(ev.lineId).toBe(BASE_LINE.id);
    }
    expect(w.tether.fights).toHaveLength(0); // fight ended
    expect(w.lure.count).toBe(0); // lure spent
  });

  it('progress resets when F is released before 0.5s', () => {
    const { w, fight } = fightWorld();
    w.intent.cut = true;
    for (let i = 0; i < 15; i++) updateTetherConstraint(w, DT); // 0.25s
    expect(fight.cut.progress).toBeGreaterThan(0);
    w.intent.cut = false;
    updateTetherConstraint(w, DT);
    expect(fight.cut.held).toBe(0);
    expect(fight.cut.progress).toBe(0);
    expect(w.tether.fights).toHaveLength(1); // fight continues
  });
});

describe('snap (T5)', () => {
  it('snaps at exactly 100 tension — catch freed, lure lost, player staggered', () => {
    const { w, fight } = fightWorld({ excess: 3 });
    fight.tension = 99.9;
    updateTetherConstraint(w, DT);
    expect(fight.tension).toBe(100); // clamped exactly at the ceiling
    expect(fight.snap.fired).toBe(true);
    expect(fight.snap.cause).toBe('greed'); // not reeling → greed
    const ev = w.tetherEvents.find((e) => e.type === 'snap');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'snap') {
      expect(ev.cause).toBe('greed');
      expect(ev.side).toBe('player');
      expect(ev.lineId).toBe(BASE_LINE.id);
    }
    expect(w.tether.fights).toHaveLength(0);
    expect(w.lure.count).toBe(0);
    expect(w.player.stagger).toBeGreaterThan(0);
  });

  it('snap cause is reel when reeling at the ceiling', () => {
    const { w, fight } = fightWorld({ excess: 3 });
    fight.tension = 99.9;
    w.intent.secondary = true; // reeling at the snap moment
    updateTetherConstraint(w, DT);
    expect(fight.snap.cause).toBe('reel');
  });
});

describe('catch death / butchered', () => {
  it('fish death during the fight ends it with a butchered event', () => {
    const { w } = fightWorld();
    w.fish!.hp = 0;
    updateTetherConstraint(w, DT);
    expect(w.tether.fights).toHaveLength(0);
    const ev = w.tetherEvents.find((e) => e.type === 'butchered');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'butchered') {
      expect(ev.minusOneTier).toBe(true); // loot −1 tier flag (plan 6.3, T7)
      expect(ev.lineId).toBe(BASE_LINE.id);
    }
  });
});

describe('LAND (T6)', () => {
  it('a landed exhausted catch within 2m ends the fight, despawns the fish, emits landed clean', () => {
    const { w } = fightWorld({ L: 1.5 });
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    updateTetherConstraint(w, DT); // computes land.eligible
    expect(w.tether.fights[0]!.land.eligible).toBe(true);
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT);
    const ev = w.tetherEvents.find((e) => e.type === 'landed');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'landed') expect(ev.clean).toBe(true);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.fish).toBeNull(); // despawned as caught
  });

  it('is not eligible when the catch is far, even if exhausted', () => {
    const { w, fight } = fightWorld({ L: 14 });
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    updateTetherConstraint(w, DT);
    expect(fight.land.eligible).toBe(false);
  });

  it('is not eligible when the catch is close but not exhausted', () => {
    const { w, fight } = fightWorld({ L: 1.5 });
    updateTetherConstraint(w, DT);
    expect(fight.land.eligible).toBe(false);
  });
});

describe('drag events (plan 4.2)', () => {
  it('a single big pull (>1.5m in the window) fires a drag event', () => {
    const { w } = fightWorld({ mass: 4, excess: 2 }); // player correction = 1.6m
    updateTetherConstraint(w, DT);
    const ev = w.tetherEvents.find((e) => e.type === 'drag');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'drag') {
      expect(ev.magnitude).toBeGreaterThan(1.5);
      expect(ev.anchor).toBe('player');
    }
  });

  it('small pulls never fire a drag event', () => {
    const { w } = fightWorld({ mass: 1, excess: 1 }); // player correction = 0.5m
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'drag')).toBe(false);
  });

  it('a big pull landing exactly on a window boundary still fires (slide then accumulate)', () => {
    // Regression for the T12 gate: a single-frame pull >1.5m is an immediate
    // drag per plan §4.2. If the window slid AFTER accumulating, this pull
    // would be wiped on the slide tick and the drag would be silently lost.
    const { w, fight } = fightWorld({ mass: 4, excess: 2 }); // player correction = 1.6m
    fight.drag.windowStart = w.time.elapsed - 0.2; // window is stale → slides this tick
    updateTetherConstraint(w, DT);
    const ev = w.tetherEvents.find((e) => e.type === 'drag');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'drag') expect(ev.magnitude).toBeGreaterThan(1.5);
  });
});

describe('replay determinism (spec 8.3)', () => {
  it('same seed + same intent script → byte-identical fight state', () => {
    function run() {
      const w = createWorld(7);
      w.mode = 'foot';
      w.fish = createFish();
      w.fish.tether.mass = 3;
      w.fish.x = 16;
      w.fish.z = -3;
      startTetherFight(w, M2_SPECIES, 'player');
      const script = [
        { secondary: true, cut: false, moveX: 0, moveY: 0 },
        { secondary: false, cut: false, moveX: 1, moveY: 0 },
        { secondary: true, cut: false, moveX: -1, moveY: 0 },
        { secondary: false, cut: false, moveX: 0, moveY: 1 },
        { secondary: false, cut: false, moveX: 0.5, moveY: -0.5 },
      ];
      for (let i = 0; i < 240; i++) {
        const s = script[i % script.length]!;
        w.intent.secondary = s.secondary;
        w.intent.cut = s.cut;
        w.intent.moveX = s.moveX;
        w.intent.moveY = s.moveY;
        updateTetherConstraint(w, DT);
        movement(w, DT);
      }
      return w;
    }
    const a = run();
    const b = run();
    const fa = a.tether.fights[0];
    const fb = b.tether.fights[0];
    expect(fa === undefined).toBe(fb === undefined);
    if (fa && fb) {
      expect(fa.L).toBe(fb.L);
      expect(fa.tension).toBe(fb.tension);
    }
    // byte-identical positions / stamina / events (toBe = bitwise)
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.z).toBe(b.player.z);
    expect(a.player.stamina).toBe(b.player.stamina);
    expect(a.fish!.x).toBe(b.fish!.x);
    expect(a.fish!.z).toBe(b.fish!.z);
    expect(a.tetherEvents.length).toBe(b.tetherEvents.length);
  });
});

describe('event stream (T14 / Addendum A.6)', () => {
  it('toRunKinds maps the tether stream onto 03 run-reducer kinds', () => {
    expect(toRunKinds({ type: 'landed', clean: true })).toBe('tether/landed');
    expect(toRunKinds({ type: 'cut', fightId: 1, lineId: 'x', cost: 'lure' })).toBe(
      'tether/cut',
    );
    expect(
      toRunKinds({ type: 'snap', fightId: 1, cause: 'greed', lineId: 'x', side: 'player' }),
    ).toBe('tether/snapped');
    expect(
      toRunKinds({ type: 'pulledUnder', breathSec: 15, occupied: false }),
    ).toBe('tether/pulledIn');
    expect(
      toRunKinds({
        type: 'drag',
        fightId: 1,
        anchor: 'player',
        dir: { x: 1, z: 0 },
        magnitude: 2,
        by: 'lunge',
      }),
    ).toBeNull();
  });

  it('tetherEvents are cleared per tick by the first producer (fishAI)', () => {
    const { w } = fightWorld({ mass: 4, excess: 2 });
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'drag')).toBe(true);
    // next tick: fishAI (the first producer) clears the stream before the
    // constraint produces fresh events
    updateTetherFishAI(w, DT);
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'drag')).toBe(false);
  });
});
// --- QA round: degenerate mass splits + drag cooldown decay ---------------------

describe('mass-split degenerate cases (NaN guards)', () => {
  function customFight(massA: number, massB: number) {
    const w = createWorld(1);
    w.fish = createFish();
    w.fish.x = 16; // L 14 → 2m excess along +X
    w.fish.z = 0;
    const fight = startTetherFight(w, M2_SPECIES, 'player', {
      a: {
        anchor: { kind: 'entity', entityId: -1 },
        owner: 'player',
        mass: massA,
        radius: 0.5,
        reel: { kind: 'player-stance' },
        cut: { kind: 'lure' },
      },
      b: {
        anchor: { kind: 'entity', entityId: -2 },
        owner: 'enemy',
        mass: massB,
        radius: FISH_RADIUS,
        reel: { kind: 'none' },
        cut: { kind: 'none' },
      },
      L: 14,
    });
    expect(fight).not.toBeNull();
    return { w, fight: fight! };
  }

  it('an Infinity-mass B endpoint moves nothing but pulls A the whole excess (no NaN)', () => {
    const { w } = customFight(1, Infinity);
    updateTetherConstraint(w, DT);
    expect(Number.isFinite(w.player.x)).toBe(true);
    expect(Number.isFinite(w.fish!.x)).toBe(true);
    expect(w.fish!.x).toBe(16); // immovable end never moves
    expect(w.player.x).toBeCloseTo(2, 6); // A takes the full correction
  });

  it('an Infinity-mass A endpoint: B takes the whole correction (no NaN)', () => {
    const { w } = customFight(Infinity, 2);
    updateTetherConstraint(w, DT);
    expect(w.player.x).toBe(0);
    expect(w.fish!.x).toBeCloseTo(14, 6);
    expect(Number.isFinite(w.fish!.x)).toBe(true);
  });

  it('both ends Infinity: nothing moves, tension still accumulates, no NaN', () => {
    const { w, fight } = customFight(Infinity, Infinity);
    updateTetherConstraint(w, DT);
    expect(w.player.x).toBe(0);
    expect(w.fish!.x).toBe(16);
    expect(Number.isFinite(fight.tension)).toBe(true);
    expect(fight.tension).toBeGreaterThan(0);
  });

  it('zero total mass splits evenly instead of NaN-poisoning both endpoints', () => {
    const { w } = customFight(0, 0);
    updateTetherConstraint(w, DT);
    expect(Number.isFinite(w.player.x)).toBe(true);
    expect(Number.isFinite(w.fish!.x)).toBe(true);
    expect(w.player.x).toBeCloseTo(1, 6);
    expect(w.fish!.x).toBeCloseTo(15, 6);
  });
});

describe('drag cooldown decay', () => {
  it('decays while the line is slack (it used to freeze until the next taut step)', () => {
    const { w, fight } = fightWorld({ excess: 0 }); // fish exactly at L → slack path
    fight.drag.cooldown = 0.2;
    updateTetherConstraint(w, DT);
    expect(fight.drag.cooldown).toBeCloseTo(0.2 - DT, 9);
  });

  it('a fired drag keeps its full cooldown on the firing step', () => {
    const { w, fight } = fightWorld({ mass: 4, excess: 2 });
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'drag')).toBe(true);
    // the cooldown set by the fire is not partially consumed the same step
    expect(fight.drag.cooldown).toBeCloseTo(0.3, 9);
  });
});
