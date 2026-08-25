// FISH (game) — WORKER C unit tests (plan 06: tests-first, node-only).
// Tests the three-free game logic in src/game/fish.ts against the T16/T17
// numbers. Steps are fixed-DT (FIXED_DT = 1/60) and worlds are minimal
// createWorld() constructions — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish, SPINE_SEGMENTS } from '../../src/core/world';
import { makeParams } from '../../src/gen/fishParams';
import { FIXED_DT } from '../../src/core/time';
import {
  spawnFish,
  updateFishAI,
  animateFish,
  FISH_TARGET_ID,
  NOTICE_RANGE,
  RING_DISTANCE,
  TELEGRAPH_DURATION,
  LUNGE_SPEED,
  LUNGE_DURATION,
  LUNGE_DAMAGE,
  RECOVER_DURATION,
  STRAFE_SPEED,
  HURT_DEFAULT,
  SPINE_AMP,
  FLOP_DURATION,
  EXHAUST_SPINE_SCALE,
} from '../../src/game/fish';

const DT = FIXED_DT;

function hit(damage: number, stagger = 0) {
  return { targetId: FISH_TARGET_ID, damage, knockbackX: 0, knockbackZ: 0, stagger };
}

describe('spawnFish (spawn slot)', () => {
  it('spawns a live fish with full hp when world.fish is null', () => {
    const w = createWorld();
    expect(w.fish).toBeNull();
    spawnFish(w);
    expect(w.fish).not.toBeNull();
    const f = w.fish!;
    expect(f.hp).toBe(f.maxHp);
    expect(f.hp).toBe(100);
    expect(f.state).toBe('idle');
    expect(f.spine.length).toBe(SPINE_SEGMENTS);
  });

  it('is a no-op once a fish already exists (single spawn)', () => {
    const w = createWorld();
    spawnFish(w);
    const f = w.fish!;
    f.hp = 40;
    spawnFish(w);
    expect(w.fish).toBe(f);
    expect(w.fish!.hp).toBe(40); // not respawned
  });
});

describe('idle state', () => {
  it('notices the player at the notice range and transitions idle → strafe', () => {
    const w = createWorld();
    w.fish = createFish(); // spawn at (8, -6); player at (0,0) → ~10m away
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('idle');

    w.player.x = w.fish.x - 5; // pull the player just inside NOTICE_RANGE
    w.player.z = w.fish.z;
    const dist = Math.hypot(w.player.x - w.fish.x, w.player.z - w.fish.z);
    expect(dist).toBeLessThan(NOTICE_RANGE);

    updateFishAI(w, DT);
    expect(w.fish.state).toBe('strafe');
  });
});

describe('strafe state', () => {
  it('keeps roughly the target ring distance around the player', () => {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = RING_DISTANCE;
    w.fish.z = 0;
    w.fish.state = 'strafe';
    w.fish.stateTimer = STRAFE_SPEED; // well inside the min lunge delay
    w.fish.strafeFlipTimer = 5;

    // 1.5s of strafing (90 fixed steps) — well before any lunge can trigger
    for (let i = 0; i < 90; i++) updateFishAI(w, DT);

    const dist = Math.hypot(w.fish.x - w.player.x, w.fish.z - w.player.z);
    expect(dist).toBeGreaterThan(RING_DISTANCE - 1);
    expect(dist).toBeLessThan(RING_DISTANCE + 1);

    // and it actually moved — it circles rather than sitting still
    expect(Math.hypot(w.fish.x, w.fish.z)).toBeGreaterThan(0.1);
  });

  it('facing follows the strafe velocity', () => {
    const w = createWorld();
    w.fish = createFish();
    // diagonal on the ring so the tangential velocity has both components
    const d = RING_DISTANCE / Math.SQRT2;
    w.fish.x = d;
    w.fish.z = d;
    w.fish.state = 'strafe';
    w.fish.stateTimer = 10;
    w.fish.strafeFlipTimer = 5;
    updateFishAI(w, DT);
    const expected = Math.atan2(w.fish.vx, w.fish.vz);
    expect(w.fish.facing).toBeCloseTo(expected, 6);
  });
});

describe('lunge state', () => {
  function lungeWorld(): ReturnType<typeof createWorld> {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    w.fish.x = RING_DISTANCE;
    w.fish.z = 0;
    w.fish.state = 'strafe';
    w.fish.stateTimer = 0; // trigger the lunge on the next step
    w.fish.strafeFlipTimer = 5;
    updateFishAI(w, DT); // strafe → lunge (telegraph starts)
    expect(w.fish.state).toBe('lunge');
    return w;
  }

  it('telegraphs for ~0.4s (stopped + coiling) then bursts at exactly LUNGE_SPEED', () => {
    const w = lungeWorld();
    expect(w.fish.telegraph).toBeGreaterThan(0);
    expect(w.fish.vx).toBe(0);
    expect(w.fish.vz).toBe(0);

    let steps = 0;
    while (w.fish.telegraph > 0 && steps < 200) {
      updateFishAI(w, DT);
      steps++;
    }
    // telegraph lasted ~0.4s at 60Hz
    expect(steps / 60).toBeGreaterThanOrEqual(TELEGRAPH_DURATION - 0.05);
    expect(steps / 60).toBeLessThanOrEqual(TELEGRAPH_DURATION + 0.05);

    // burst is exactly LUNGE_SPEED toward the player's position-at-telegraph
    const speed = Math.hypot(w.fish.vx, w.fish.vz);
    expect(speed).toBeCloseTo(LUNGE_SPEED, 6);
    const dir = Math.atan2(w.fish.vx, w.fish.vz);
    const towardPlayer = Math.atan2(0 - w.fish.x, 0 - w.fish.z);
    expect(Math.abs(dir - towardPlayer)).toBeLessThan(1e-6);
  });

  it('burst lasts ~0.5s then enters the recover pause', () => {
    const w = lungeWorld();
    while (w.fish.telegraph > 0 && w.fish.state === 'lunge') updateFishAI(w, DT);

    let steps = 0;
    while (w.fish.state === 'lunge' && steps < 200) {
      updateFishAI(w, DT);
      steps++;
    }
    expect(w.fish.state).toBe('recover');
    expect(steps / 60).toBeGreaterThanOrEqual(LUNGE_DURATION - 0.05);
    expect(steps / 60).toBeLessThanOrEqual(LUNGE_DURATION + 0.05);
    expect(w.fish.vx).toBe(0);
    expect(w.fish.vz).toBe(0);
  });

  it('recover pauses ~1s then returns to strafe', () => {
    const w = lungeWorld();
    while (w.fish.state === 'lunge') updateFishAI(w, DT);
    expect(w.fish.state).toBe('recover');

    let steps = 0;
    while (w.fish.state === 'recover' && steps < 200) {
      updateFishAI(w, DT);
      steps++;
    }
    expect(w.fish.state).toBe('strafe');
    expect(steps / 60).toBeGreaterThanOrEqual(RECOVER_DURATION - 0.05);
    expect(steps / 60).toBeLessThanOrEqual(RECOVER_DURATION + 0.05);
  });
});

describe('lunge contact damage', () => {
  function burstOnPlayer(): ReturnType<typeof createWorld> {
    const w = createWorld();
    w.mode = 'foot';
    w.fish = createFish();
    // fish right on top of the player, already in the burst phase
    w.fish.x = w.player.x + w.player.radius + w.fish.radius;
    w.fish.z = w.player.z;
    w.fish.state = 'lunge';
    w.fish.telegraph = 0;
    w.fish.stateTimer = LUNGE_DURATION;
    w.fish.lungeHitDone = 0;
    w.fish.vx = 0;
    w.fish.vz = 0;
    return w;
  }

  it('deals 8 damage on contact', () => {
    const w = burstOnPlayer();
    const before = w.player.hp;
    updateFishAI(w, DT);
    expect(w.player.hp).toBe(before - LUNGE_DAMAGE);
  });

  it('hits once per lunge — no repeat damage while overlapping', () => {
    const w = burstOnPlayer();
    updateFishAI(w, DT);
    const afterFirst = w.player.hp;
    expect(afterFirst).toBe(100 - LUNGE_DAMAGE);
    // several more frames still overlapping the player
    for (let i = 0; i < 10; i++) updateFishAI(w, DT);
    expect(w.player.hp).toBe(afterFirst);
  });

  it('respects player i-frames: iframes > 0 → no damage', () => {
    const w = burstOnPlayer();
    w.player.iframes = 1.0;
    updateFishAI(w, DT);
    expect(w.player.hp).toBe(100); // no damage while invulnerable
    // ...but the lunge is still spent (won't hit again after i-frames expire)
    w.player.iframes = 0;
    updateFishAI(w, DT);
    expect(w.player.hp).toBe(100);
  });
});

describe('hurt state (hit events from combat)', () => {
  it('consumes fish-targeted hits but does not re-apply damage or knockback (combat applies them directly)', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.hp = 90; // combat already applied the 10 damage directly
    w.combat.hits.push(
      { targetId: FISH_TARGET_ID, damage: 10, knockbackX: 3, knockbackZ: 0, stagger: 0 },
      { targetId: 999, damage: 5, knockbackX: 0, knockbackZ: 0, stagger: 0 }
    );
    updateFishAI(w, DT);
    expect(w.fish.hp).toBe(90); // no double damage
    expect(w.combat.hits).toHaveLength(1); // the non-fish event is left alone
    expect(w.combat.hits[0]!.targetId).toBe(999);
  });

  it('a stagger event puts the fish into hurt for the stagger duration', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.hp = 90; // combat's damage for this hit
    const stagger = 1.2;
    w.combat.hits.push(hit(10, stagger));
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('hurt');
    expect(w.fish.stateTimer).toBeCloseTo(stagger, 6); // stagger seconds = state duration
    expect(w.fish.hitFlash).toBeGreaterThan(0);
  });

  it('an hp drop without an event still staggers the fish (hp-delta check)', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.hp = 60; // dropped between steps (e.g. combat hit directly)
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('hurt');
    expect(w.fish.stateTimer).toBeCloseTo(HURT_DEFAULT, 6);
  });

  it('hurt interrupts a lunge but not the dead state', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.x = RING_DISTANCE;
    w.fish.z = 0;
    w.fish.state = 'strafe';
    w.fish.stateTimer = 0;
    w.fish.strafeFlipTimer = 5;
    updateFishAI(w, DT); // → lunge, telegraphing
    expect(w.fish.state).toBe('lunge');

    w.fish.hp = 95; // combat's damage for this hit
    w.combat.hits.push(hit(5, 0.6));
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('hurt');
    expect(w.fish.telegraph).toBe(0); // the coil is cancelled

    // dead is never interrupted
    const dead = createWorld();
    dead.fish = createFish();
    dead.fish.hp = 0;
    updateFishAI(dead, DT);
    expect(dead.fish.state).toBe('dead');
    dead.combat.hits.push(hit(5, 1.0));
    updateFishAI(dead, DT);
    expect(dead.fish.state).toBe('dead');
  });

  it('hurt lasts its timer then returns to strafe', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.hp = 90;
    w.combat.hits.push(hit(10, 0.5));
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('hurt');
    for (let i = 0; i < 200; i++) {
      updateFishAI(w, DT);
      if (w.fish.state === 'strafe') break;
    }
    expect(w.fish.state).toBe('strafe');
  });
});

describe('dead state', () => {
  it('hp 0 → dead, then no further state changes and no movement', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.x = 4;
    w.fish.z = -2;
    w.fish.hp = 0; // combat applied the killing blow
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('dead');

    // from the death frame on it is a corpse: no state change, no movement
    const x = w.fish.x;
    const z = w.fish.z;
    for (let i = 0; i < 120; i++) updateFishAI(w, DT);
    expect(w.fish.state).toBe('dead');
    expect(w.fish.x).toBe(x);
    expect(w.fish.z).toBe(z);
  });

  it('spine amplitude collapses to ~0 over the flop and deadTilt reaches 1', () => {
    const w = createWorld();
    w.fish = createFish();
    w.fish.hp = 0;
    updateFishAI(w, DT);
    expect(w.fish.state).toBe('dead');

    // step the flop (~0.6s) at fixed dt
    for (let i = 0; i < Math.ceil(FLOP_DURATION * 60) + 10; i++) animateFish(w, DT);
    const maxBend = Math.max(...Array.from(w.fish.spine).map(Math.abs));
    expect(maxBend).toBeLessThan(0.01);
    expect(w.fish.deadTilt).toBe(1);
  });
});

describe('animateFish (sine-spine)', () => {
  it('writes a full spine of finite bends', () => {
    const w = createWorld();
    w.fish = createFish();
    animateFish(w, 0);
    expect(w.fish.spine.length).toBe(SPINE_SEGMENTS);
    for (let i = 0; i < w.fish.spine.length; i++) {
      expect(Number.isFinite(w.fish.spine[i]!)).toBe(true);
    }
  });

  it('scales amplitude down with hp: a wounded fish sways less', () => {
    const full = createWorld();
    full.fish = createFish();
    const half = createWorld();
    half.fish = createFish();
    half.fish.hp = 50;
    half.fish.lastHp = 50;

    animateFish(full, 0);
    animateFish(half, 0);

    const maxFull = Math.max(...Array.from(full.fish.spine).map(Math.abs));
    const maxHalf = Math.max(...Array.from(half.fish.spine).map(Math.abs));
    expect(maxFull).toBeGreaterThan(0);
    expect(maxHalf).toBeGreaterThan(0);
    // hp scale = hp/maxHp*0.5+0.5 → 50% hp = 0.75 of full amplitude
    expect(maxHalf / maxFull).toBeCloseTo(0.75, 6);
  });
});

describe('animateFish (M4 per-species swim profile)', () => {
  // a live fish with species params (swimFreq/swimAmp from the generator)
  function speciesFish() {
    const w = createWorld();
    w.fish = createFish();
    const params = makeParams();
    params.speciesId = 'silt-pikelet';
    params.swimFreq = 5;
    params.swimAmp = 0.9;
    w.fish.params = { ...params };
    w.fish.spine = new Float32Array(params.spineSegments);
    return w;
  }

  it('uses the species swimAmp/swimFreq instead of the M1 constants', () => {
    const w = speciesFish();
    animateFish(w, 0);
    const maxBend = Math.max(...Array.from(w.fish.spine).map(Math.abs));
    // full hp → ampScale 1 → bend ≈ swimAmp = 0.9 (the sine peaks somewhere)
    expect(maxBend).toBeGreaterThan(0.6);
    expect(maxBend).toBeLessThanOrEqual(0.9 + 1e-9);
    // and it differs from the M1 baseline amplitude (0.55)
    expect(maxBend).toBeGreaterThan(0.55);
  });

  it('exhaustion scales the spine amplitude to 40% (EXHAUST_SPINE_SCALE)', () => {
    const fresh = speciesFish();
    const exhausted = speciesFish();
    exhausted.fish.tether.exhausted = true;
    animateFish(fresh, 0);
    animateFish(exhausted, 0);
    const maxFresh = Math.max(...Array.from(fresh.fish.spine).map(Math.abs));
    const maxExh = Math.max(...Array.from(exhausted.fish.spine).map(Math.abs));
    expect(maxExh / maxFresh).toBeCloseTo(EXHAUST_SPINE_SCALE, 6);
  });

  it('stays finite when the fish is dead (flop collapses the wave)', () => {
    const w = speciesFish();
    w.fish.hp = 0;
    w.fish.state = 'dead';
    for (let i = 0; i < Math.ceil(FLOP_DURATION * 60) + 10; i++) animateFish(w, DT);
    const maxBend = Math.max(...Array.from(w.fish.spine).map(Math.abs));
    expect(Number.isFinite(maxBend)).toBe(true);
    expect(maxBend).toBeLessThan(0.01);
  });
});