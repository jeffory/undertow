// FISH AI (tethered-fight) — plan 06 tests-first + T3/T8/T6/T7 acceptance.
// Pins the round-2A tether behavior: the lunge telegraph gate (exactly the dial),
// the orbit band, the drag event threshold + cooldown + by-tag, exhaustion drains
// from each source, exhausted blocks lunging, LAND eligibility, landed-vs-butchered
// end-to-end with the FSM live, and byte-identical replay determinism. Steps are
// fixed-DT (FIXED_DT = 1/60); worlds are minimal createWorld() constructions.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { movement } from '../../src/core/systems';
import { updateTetherFishAI } from '../../src/game/fishAI';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import { BASE_LINE } from '../../src/game/line';
import { FISH_TARGET_ID } from '../../src/game/combat';
import { animateFish, EXHAUST_SPINE_SCALE } from '../../src/game/fish';

const DT = FIXED_DT;

// Fight with the fish sitting exactly at the leash (no initial overshoot). The
// FSM is seeded (fish.ai.rng) by startTetherFight from world.seed + fight id.
function fightWorld(opts: { mass?: number; L?: number } = {}) {
  const { mass = 1.5 } = opts;
  const L = opts.L ?? BASE_LINE.baseLength;
  const w = createWorld(1);
  w.mode = 'foot';
  w.fish = createFish();
  w.fish.tether.mass = mass;
  w.fish.x = L;
  w.fish.z = 0; // createFish defaults to z = -6; tests want the fish on +X
  const fight = startTetherFight(w, M2_SPECIES, 'player', { L });
  expect(fight).not.toBeNull();
  expect(w.fish!.ai).not.toBeNull();
  return { w, fight: fight! };
}

// One fixed-step of the fight loop in UPDATE_ORDER (fishAI → constraint → player
// movement), advancing nothing else.
function step(w: ReturnType<typeof fightWorld>['w'], n = 1): void {
  for (let i = 0; i < n; i++) {
    updateTetherFishAI(w, DT);
    updateTetherConstraint(w, DT);
    movement(w, DT);
  }
}

describe('lunge telegraph gate (T3, dial 5)', () => {
  it('telegraph precedes the lunge by exactly tuning.lungeTelegraph', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    // a fresh lunge state with the telegraph armed at the dial duration
    ai.mode = 'lunge';
    ai.telegraph = w.tuning.lungeTelegraph;
    ai.telegraphKind = 'lunge';
    ai.pullDirX = 1;
    ai.pullDirZ = 0;

    let steps = 0;
    let fired = false;
    let maxSpeedDuringTelegraph = 0;
    while (!fired && steps < 300) {
      updateTetherFishAI(w, DT);
      const firedThisStep = w.tetherEvents.some((e) => e.type === 'lunge');
      if (!firedThisStep) {
        maxSpeedDuringTelegraph = Math.max(
          maxSpeedDuringTelegraph,
          Math.hypot(w.fish!.vx, w.fish!.vz),
        );
      } else {
        fired = true;
      }
      updateTetherConstraint(w, DT);
      movement(w, DT);
      steps++;
    }
    expect(fired).toBe(true);
    // 0.7s at 60Hz = exactly 42 fixed steps (EPS-snapped, like the cut timer)
    expect(steps).toBe(Math.round(w.tuning.lungeTelegraph * 60));
    // the fish held still (stopped + coiling) through the entire telegraph
    expect(maxSpeedDuringTelegraph).toBe(0);
    // then fired at pullDir × pullForce (dial 1)
    expect(w.fish!.vx).toBeCloseTo(w.tuning.pullForce, 6);
    expect(w.fish!.vz).toBeCloseTo(0, 6);
    const ev = w.tetherEvents.find((e) => e.type === 'lunge');
    if (ev && ev.type === 'lunge') {
      expect(ev.dir.x).toBe(1);
      expect(ev.force).toBe(w.tuning.pullForce);
    }
  });

  it('the FSM itself telegraphs before every lunge it produces, exactly the dial', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    w.fish!.stamina = 1e6; // guarantee a lunge is affordable before exhaustion
    const dialSteps = Math.round(w.tuning.lungeTelegraph * 60);
    let lungeStep = -1;
    let telegraphStep = -1;
    for (let i = 0; i < 20000 && lungeStep < 0; i++) {
      updateTetherFishAI(w, DT);
      for (const e of w.tetherEvents) {
        if (e.type === 'telegraph' && e.kind === 'lunge' && telegraphStep < 0) telegraphStep = i;
        if (e.type === 'lunge') lungeStep = i;
      }
      updateTetherConstraint(w, DT);
      movement(w, DT);
    }
    void ai;
    expect(lungeStep).toBeGreaterThanOrEqual(0);
    expect(telegraphStep).toBeGreaterThanOrEqual(0);
    expect(lungeStep - telegraphStep).toBe(dialSteps);
  });

  it('lunge impulse is clamped to maxSwimSpeed when the dial exceeds it', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    w.tuning.pullForce = 20;
    w.fish!.tether.maxSwimSpeed = 6;
    ai.mode = 'lunge';
    ai.telegraph = DT; // fires on the next step
    ai.pullDirX = 1;
    ai.pullDirZ = 0;
    updateTetherFishAI(w, DT);
    expect(Math.hypot(w.fish!.vx, w.fish!.vz)).toBeCloseTo(6, 6);
  });
});

describe('FSM shape (T8)', () => {
  it('orbit keeps the fish near L×0.9 around the player (distance band)', () => {
    const { w, fight } = fightWorld({ L: 10 });
    const ai = w.fish!.ai!;
    ai.mode = 'orbit';
    ai.timer = 100; // hold the orbit — no transition rolls
    ai.orbitFlipTimer = 100;
    w.fish!.x = 10;
    w.fish!.z = 0;
    step(w, 120); // 2s of orbiting
    const d = Math.hypot(w.fish!.x - w.player.x, w.fish!.z - w.player.z);
    const target = fight.L * 0.9;
    expect(Math.abs(d - target)).toBeLessThan(1.5);
    // and it actually circles rather than sitting still
    expect(Math.hypot(w.fish!.x, w.fish!.z)).toBeGreaterThan(1);
  });

  it('species pattern weights bias the transition mix', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    w.fish!.tether.patterns = { orbit: 0, lunge: 0, dive: 1, drag: 0 };
    ai.timer = 0; // roll on the first step
    updateTetherFishAI(w, DT);
    expect(ai.mode).toBe('dive');
  });

  it('a routedDrag fish telegraphs its drag and routes toward the islet shoreline', () => {
    const { w } = fightWorld({ L: 14 });
    const ai = w.fish!.ai!;
    w.player.x = 3; // outward radial from the islet centre (0,0) through the player
    w.player.z = 4;
    w.fish!.tether.patterns = { orbit: 0, lunge: 0, dive: 0, drag: 1 };
    ai.timer = 0;
    updateTetherFishAI(w, DT);
    expect(ai.mode).toBe('drag');
    expect(ai.telegraphKind).toBe('drag');
    expect(ai.telegraph).toBe(w.tuning.lungeTelegraph);
    expect(ai.pullDirX).toBeCloseTo(3 / 5, 6);
    expect(ai.pullDirZ).toBeCloseTo(4 / 5, 6);
    const ev = w.tetherEvents.find((e) => e.type === 'telegraph');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'telegraph') expect(ev.kind).toBe('drag');
  });
});

describe('drag events (T3, plan 4.2)', () => {
  it('a drag during a dive is tagged by: dive', () => {
    const { w, fight } = fightWorld({ mass: 8, L: 8 });
    const ai = w.fish!.ai!;
    ai.mode = 'dive';
    ai.pullBy = 'dive';
    w.fish!.x = 11; // 3m excess → one-frame player correction 8/9·3 = 2.67m
    w.fish!.z = 0;
    updateTetherConstraint(w, DT);
    const ev = w.tetherEvents.find((e) => e.type === 'drag');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'drag') expect(ev.by).toBe('dive');
    void fight;
  });

  it('drag fires only past the 1.5m window and respects the 0.3s cooldown', () => {
    const { w, fight } = fightWorld({ mass: 8, L: 8 });
    const drag = fight.drag;
    drag.accumulated = 1.6; // already over the threshold
    drag.cooldown = 0.3; // but the cooldown is still running
    drag.windowStart = 0; // elapsed stays 0 → the window never slides
    w.fish!.x = 9; // 1m excess → 0.889m player correction this step
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'drag')).toBe(false); // blocked

    drag.cooldown = 0;
    w.fish!.x = 9; // re-place the overshoot (the first step corrected len back to L)
    updateTetherConstraint(w, DT);
    const ev = w.tetherEvents.find((e) => e.type === 'drag');
    expect(ev).toBeDefined();
    if (ev && ev.type === 'drag') {
      expect(ev.magnitude).toBeGreaterThan(1.5);
      expect(ev.anchor).toBe('player');
    }
  });
});

describe('exhaustion drains (T6, plan 6.1)', () => {
  it('a lunge drains lungeStaminaCost × line.exhaustMult', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    ai.mode = 'lunge';
    ai.telegraph = DT;
    ai.pullDirX = 1;
    ai.pullDirZ = 0;
    updateTetherFishAI(w, DT); // the lunge fires on this step
    expect(w.tetherEvents.some((e) => e.type === 'lunge')).toBe(true);
    updateTetherConstraint(w, DT); // would clear the event stream
    movement(w, DT);
    expect(w.fish!.stamina).toBeCloseTo(100 - 20 * BASE_LINE.exhaustMult, 6);
  });

  it('a gaff hit drains 8 stamina and consumes only fish-targeted hits', () => {
    const { w } = fightWorld();
    w.combat.hits.push(
      { targetId: FISH_TARGET_ID, damage: 10, knockbackX: 0, knockbackZ: 0, stagger: 0 },
      { targetId: 999, damage: 5, knockbackX: 0, knockbackZ: 0, stagger: 0 },
    );
    updateTetherFishAI(w, DT);
    expect(w.fish!.stamina).toBeCloseTo(100 - 8, 6);
    expect(w.combat.hits).toHaveLength(1); // the non-fish event is left alone
    expect(w.combat.hits[0]!.targetId).toBe(999);
  });

  it('reeling at low tension drains the catch 12/s', () => {
    const { w } = fightWorld({ L: 14 });
    const ai = w.fish!.ai!;
    ai.mode = 'orbit';
    ai.timer = 100; // no FSM drains — isolate the reel source
    w.intent.secondary = true;
    step(w, 60); // 1s of reeling, tension stays < 40
    expect(w.fish!.stamina).toBeCloseTo(100 - 12, 6);
  });

  it('exhausted blocks lunging', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    ai.mode = 'lunge';
    ai.telegraph = DT;
    ai.pullDirX = 1;
    ai.pullDirZ = 0;
    updateTetherFishAI(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'lunge')).toBe(false);
    expect(ai.mode).toBe('exhausted');
    expect(w.fish!.vx).toBe(0); // no burst
  });
});

describe('LAND (T6)', () => {
  it('LAND fires only <2m AND exhausted; the catch despawns as caught', () => {
    const { w, fight } = fightWorld({ L: 1.5 });
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    step(w, 1); // computes land.eligible (exhausted && len < 2)
    expect(fight.land.eligible).toBe(true);
    w.intent.acceptLand = true;
    step(w, 1);
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
    w.intent.acceptLand = true;
    step(w, 2);
    expect(fight.land.eligible).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'landed')).toBe(false);
  });

  it('is not eligible when the catch is close but not exhausted', () => {
    const { w, fight } = fightWorld({ L: 1.5 });
    w.intent.acceptLand = true;
    step(w, 2);
    expect(fight.land.eligible).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'landed')).toBe(false);
  });
});

describe('kill profiles end-to-end with the FSM running (T7)', () => {
  it('landed and butchered are distinct outcomes', () => {
    // Angler: exhausted + close → landed (fight ends, fish despawns)
    const angler = fightWorld({ L: 1.5 });
    angler.w.fish!.stamina = 0;
    angler.w.fish!.tether.exhausted = true;
    angler.w.intent.acceptLand = true;
    step(angler.w, 2);
    expect(angler.w.tetherEvents.some((e) => e.type === 'landed')).toBe(true);
    expect(angler.w.tetherEvents.some((e) => e.type === 'butchered')).toBe(false);
    expect(angler.w.fish).toBeNull();

    // Butcher: HP death before exhaustion → butchered (minusOneTier flag).
    // The butchered event fires on step 1's constraint; step 2 would clear it.
    const butcher = fightWorld();
    butcher.w.fish!.hp = 0;
    step(butcher.w, 1);
    expect(butcher.w.tetherEvents.some((e) => e.type === 'butchered')).toBe(true);
    expect(butcher.w.tetherEvents.some((e) => e.type === 'landed')).toBe(false);
    const ev = butcher.w.tetherEvents.find((e) => e.type === 'butchered');
    if (ev && ev.type === 'butchered') expect(ev.minusOneTier).toBe(true);
  });
});

describe('exhaustion telegraph (animation side, T6)', () => {
  it('exhausted fish: spine amplitude ×0.4 and belly-tilt ramps up', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish!.tether.exhausted = true;
    animateFish(w, DT);
    const exhaustedMax = Math.max(...Array.from(w.fish!.spine).map(Math.abs));
    expect(w.fish!.exhaustTilt).toBeGreaterThan(0);

    const baseline = createWorld();
    baseline.fish = createFish();
    animateFish(baseline, DT);
    const baseMax = Math.max(...Array.from(baseline.fish!.spine).map(Math.abs));
    expect(exhaustedMax / baseMax).toBeCloseTo(EXHAUST_SPINE_SCALE, 6);

    // a fresh fish has no tilt
    const fresh = createWorld();
    fresh.fish = createFish();
    animateFish(fresh, DT);
    expect(fresh.fish!.exhaustTilt).toBe(0);
  });
});

describe('fight-end hand-back (T8)', () => {
  it('when the fight ends the fish returns to the land AI cleanly (idle, ai cleared, no burst carryover)', () => {
    const { w } = fightWorld();
    const ai = w.fish!.ai!;
    ai.mode = 'dive';
    ai.pullDirX = 1;
    ai.pullDirZ = 0;
    w.fish!.vx = 4; // a live dive burst
    w.fish!.vz = 0;
    w.intent.cut = true; // end the fight via the F-ring (0.5s hold)
    for (let i = 0; i < 31; i++) {
      updateTetherFishAI(w, DT);
      updateTetherConstraint(w, DT);
    }
    expect(w.tether.fights).toHaveLength(0);
    updateTetherFishAI(w, DT); // next tick hands the fish back
    expect(w.fish!.ai).toBeNull();
    expect(w.fish!.state).toBe('idle');
    expect(w.fish!.vx).toBe(0);
    expect(w.fish!.vz).toBe(0);
  });
});

describe('replay determinism (spec 8.3)', () => {
  it('same seed + same intent script → byte-identical fight state with the FSM live', () => {
    function run() {
      const w = createWorld(7);
      w.mode = 'foot';
      w.fish = createFish();
      w.fish.tether.mass = 3;
      w.fish.x = 16;
      w.fish.z = -3;
      const fight = startTetherFight(w, M2_SPECIES, 'player');
      expect(fight).not.toBeNull();
      const script = [
        { secondary: true, cut: false, moveX: 0, moveY: 0 },
        { secondary: false, cut: false, moveX: 1, moveY: 0 },
        { secondary: true, cut: false, moveX: -1, moveY: 0 },
        { secondary: false, cut: false, moveX: 0, moveY: 1 },
        { secondary: false, cut: false, moveX: 0.5, moveY: -0.5 },
      ];
      for (let i = 0; i < 600; i++) {
        const s = script[i % script.length]!;
        w.intent.secondary = s.secondary;
        w.intent.cut = s.cut;
        w.intent.moveX = s.moveX;
        w.intent.moveY = s.moveY;
        updateTetherFishAI(w, DT);
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
    expect(a.player.x).toBe(b.player.x);
    expect(a.player.z).toBe(b.player.z);
    expect(a.player.stamina).toBe(b.player.stamina);
    expect(a.fish!.x).toBe(b.fish!.x);
    expect(a.fish!.z).toBe(b.fish!.z);
    expect(a.fish!.stamina).toBe(b.fish!.stamina);
    expect(a.fish!.ai?.mode).toBe(b.fish!.ai?.mode);
    // both RNG streams have consumed the same number of draws
    if (a.fish!.ai && b.fish!.ai) {
      expect(a.fish!.ai.rng.nextFloat()).toBe(b.fish!.ai.rng.nextFloat());
    }
    expect(a.tetherEvents.length).toBe(b.tetherEvents.length);
  });
});