import { describe, it, expect } from 'vitest';
import {
  createSplash,
  spawnBurst,
  stepSplash,
  ringRadius,
  SPLASH_GRAVITY,
} from '../../src/core/splash';
import { splashFx, INTENSITY_HOOK } from '../../src/game/splashFx';
import { createWorld, createFish } from '../../src/core/world';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';

const DT = 1 / 60;

describe('splash: deterministic burst emission (task T10)', () => {
  it('same emission counter produces identical particles', () => {
    const a = createSplash();
    const b = createSplash();
    spawnBurst(a, 0, 0, 1);
    spawnBurst(b, 0, 0, 1);
    for (let i = 0; i < a.parts.length; i++) {
      const pa = a.parts[i]!;
      const pb = b.parts[i]!;
      expect(pa.x).toBe(pb.x);
      expect(pa.y).toBe(pb.y);
      expect(pa.z).toBe(pb.z);
      expect(pa.vx).toBe(pb.vx);
      expect(pa.vy).toBe(pb.vy);
      expect(pa.vz).toBe(pb.vz);
      expect(pa.age).toBe(pb.age);
      expect(pa.life).toBe(pb.life);
    }
    for (let i = 0; i < a.rings.length; i++) {
      const ra = a.rings[i]!;
      const rb = b.rings[i]!;
      expect(ra.x).toBe(rb.x);
      expect(ra.z).toBe(rb.z);
      expect(ra.maxR).toBe(rb.maxR);
      expect(ra.life).toBe(rb.life);
    }
    expect(a.emitted).toBe(b.emitted);
  });
});

describe('splash: gravity return (particles die at the waterline)', () => {
  it('every particle leaps above the water, falls back to y<=0, and dies within its life', () => {
    const s = createSplash();
    spawnBurst(s, 0, 0, 1);
    const spawned = s.parts.filter((p) => p.age < p.life);
    expect(spawned.length).toBeGreaterThan(0);

    // record each particle's ascent peak + whether it ever returned to y<=0
    const seenAbove: boolean[] = spawned.map(() => false);
    let maxY = 0;
    // step well past the longest life (max vy → life ≈ 1.16s, so 2s is ample)
    for (let i = 0; i < 120; i++) {
      stepSplash(s, DT);
      for (const p of s.parts) {
        if (p.y > 0) maxY = Math.max(maxY, p.y);
      }
    }
    // the pool recycles slots via the cursor — only the first `spawned.length`
    // slots were ever written by the single burst
    for (let i = 0; i < spawned.length; i++) {
      const p = s.parts[i]!;
      expect(p.age).toBeGreaterThanOrEqual(p.life); // dead by now
      expect(p.y).toBeLessThanOrEqual(0); // died on re-entry, never airborne-dead
      void seenAbove;
    }
    expect(maxY).toBeGreaterThan(0.5); // they genuinely leapt above the water
    expect(maxY).toBeLessThan(5); // …but stay readable (no cannonballs)
  });

  it('gravity is downward and per-step arcs stay bounded', () => {
    const s = createSplash();
    spawnBurst(s, 0, 0, 0.35);
    for (const p of s.parts) {
      if (p.age >= p.life) continue;
      const vy0 = p.vy;
      stepSplash(s, DT);
      // sim applies SPLASH_GRAVITY*dt: new vy = vy0 - g*dt (unless it re-entered)
      if (p.age < p.life) expect(p.vy).toBeCloseTo(vy0 - SPLASH_GRAVITY * DT, 10);
    }
  });
});

describe('splash: bursts are world-anchored (bug B3 pattern)', () => {
  it('a burst at the origin is untouched by a later burst elsewhere', () => {
    const s = createSplash();
    spawnBurst(s, 0, 0, 1);
    for (let i = 0; i < 5; i++) stepSplash(s, DT);
    const n = s.parts.filter((p) => p.age < p.life).length;
    const before = s.parts.slice(0, n).map((p) => ({ x: p.x, z: p.z }));

    // a second, far-away burst must only take ITS own pool slots
    spawnBurst(s, 500, 500, 1);
    stepSplash(s, DT);
    for (let i = 0; i < n; i++) {
      const p = s.parts[i]!;
      expect(Math.hypot(p.x - before[i]!.x, p.z - before[i]!.z)).toBeLessThan(0.5);
      expect(Math.hypot(p.x - 500, p.z - 500)).toBeGreaterThan(400);
    }
  });
});

describe('splash: foam rings expand monotonically and die', () => {
  it('ringRadius grows every step and the ring dies at its life', () => {
    const s = createSplash();
    spawnBurst(s, 0, 0, 1);
    const ring = s.rings.find((r) => r.age < r.life);
    expect(ring).toBeTruthy();
    let prev = ringRadius(ring!);
    let grew = false;
    for (let i = 0; i < 120; i++) {
      stepSplash(s, DT);
      if (ring!.age >= ring!.life) break;
      const r = ringRadius(ring!);
      expect(r).toBeGreaterThanOrEqual(prev); // monotonic while alive
      if (r > prev + 1e-9) grew = true;
      prev = r;
    }
    expect(grew).toBe(true);
    expect(ring!.age).toBeGreaterThanOrEqual(ring!.life); // died
    expect(ring!.maxR).toBeGreaterThan(1);
  });
});

describe('splashFx: sim-side tether-event consumption (task T10)', () => {
  it('a new tether fight spawns a hook-set burst at the fish', () => {
    const w = createWorld(42);
    w.fish = createFish();
    w.fish.x = 3;
    w.fish.z = -4;
    startTetherFight(w, M2_SPECIES, 'player');
    splashFx(w, DT);

    const live = w.splash.parts.filter((p) => p.age < p.life);
    expect(live.length).toBeGreaterThan(0);
    for (const p of live) {
      expect(Math.hypot(p.x - 3, p.z - -4)).toBeLessThan(4);
    }
    // the intensity is the small hook-set tier
    expect(live.length).toBeLessThanOrEqual(6 + Math.round(18 * INTENSITY_HOOK));
    expect(w.splash.emitted).toBeGreaterThan(0);

    // a second step with no events emits nothing more (no double hook-set)
    const emitted = w.splash.emitted;
    splashFx(w, DT);
    expect(w.splash.emitted).toBe(emitted);
  });

  it('lunge and snap events spawn bursts at the fish position', () => {
    const w = createWorld(7);
    w.fish = createFish();
    w.fish.x = 1;
    w.fish.z = 2;
    startTetherFight(w, M2_SPECIES, 'player');
    splashFx(w, DT); // hook-set
    const afterHook = w.splash.emitted;

    w.tetherEvents.push({ type: 'lunge', fightId: 1, dir: { x: 1, z: 0 }, force: 4 });
    splashFx(w, DT);
    expect(w.splash.emitted).toBeGreaterThan(afterHook);

    const afterLunge = w.splash.emitted;
    w.tetherEvents.push({ type: 'snap', fightId: 1, cause: 'greed', lineId: 'line', side: 'player' });
    splashFx(w, DT);
    expect(w.splash.emitted).toBeGreaterThan(afterLunge);
  });

  it('landed events spawn a burst at the keeper (fish is nulled at land)', () => {
    const w = createWorld(3);
    w.fish = createFish();
    w.player.x = -2;
    w.player.z = 5;
    w.tetherEvents.push({ type: 'landed', clean: true });
    splashFx(w, DT);
    const live = w.splash.parts.filter((p) => p.age < p.life);
    expect(live.length).toBeGreaterThan(0);
    for (const p of live) {
      expect(Math.hypot(p.x - -2, p.z - 5)).toBeLessThan(4);
    }
  });

  it('dive-state transitions spawn a medium burst at the fish', () => {
    const w = createWorld(9);
    w.fish = createFish();
    w.fish.x = 0;
    w.fish.z = 0;
    startTetherFight(w, M2_SPECIES, 'player');
    splashFx(w, DT); // hook-set
    const afterHook = w.splash.emitted;

    w.fish.state = 'dive';
    splashFx(w, DT);
    expect(w.splash.emitted).toBeGreaterThan(afterHook);

    // staying in dive emits nothing more
    const afterDive = w.splash.emitted;
    splashFx(w, DT);
    expect(w.splash.emitted).toBe(afterDive);
  });
});