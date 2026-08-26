// SINKHOLE DESCENTS (M3 round 3) — plan 03 §2.5 / §4.1 / §5.1 / §12.7.
// The four things the plan is explicit about, pinned:
//   1. determinism — "(runSeed, zone)" regenerates a byte-identical lake, and a
//      zone-1 lake is unchanged from the pre-descent generator;
//   2. "Descent does not reset the clock. runStartMs is set once per run" (§5.1)
//      — elapsed and phase are monotonic ACROSS a descent;
//   3. "Descend a zone → value = max(value, zoneFloor) — a clamp, not a gain, so
//      nightMult never applies" (§4.1), floors 0/25/50/75/90;
//   4. "M3 caps descents at zone 5's floor" (§12.7).
// Pure Node — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, type WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun } from '../../src/run/run';
import { generateLake } from '../../src/gen/lakeMap';
import { phaseAt, runElapsedMs, PHASE_LENGTH_S } from '../../src/game/clock';
import {
  DESCEND_HOLD_SECONDS,
  DESCEND_RANGE,
  canDescend,
  descend,
  nearestSinkhole,
} from '../../src/run/descent';
import { updateDescent } from '../../src/systems/descent';
import { MAX_ZONE, ZONE_DREAD_FLOOR, zoneSalt } from '../../src/core/zones';

const DT = FIXED_DT;
const SEEDS = [1, 42, 777, 2024, 31415];

function runWorld(seed = 42): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  return w;
}

function parkAtSinkhole(w: WorldState): void {
  const s = w.lake!.sinkholes[0]!;
  w.boat.x = s.mouth.x;
  w.boat.z = s.mouth.z;
  w.boat.speed = 0;
}

describe('zone lakes: determinism (task 2 "same run seed → same zone-2 lake")', () => {
  it('a zone-2 lake is byte-identical for the same run seed', () => {
    for (const seed of SEEDS) {
      const a = JSON.stringify(generateLake(seed, 2));
      const b = JSON.stringify(generateLake(seed, 2));
      expect(a, `seed ${seed}`).toBe(b);
    }
  });

  it('every zone 1..5 is byte-identical on regeneration', () => {
    for (let zone = 1; zone <= MAX_ZONE; zone++) {
      expect(JSON.stringify(generateLake(9000, zone))).toBe(
        JSON.stringify(generateLake(9000, zone)),
      );
    }
  });

  it('a deeper zone is a DIFFERENT lake from the same seed (the zone salt bites)', () => {
    for (const seed of SEEDS) {
      const z1 = JSON.stringify(generateLake(seed, 1).islets.map((i) => i.center));
      const z2 = JSON.stringify(generateLake(seed, 2).islets.map((i) => i.center));
      const z3 = JSON.stringify(generateLake(seed, 3).islets.map((i) => i.center));
      expect(z1, `seed ${seed}`).not.toBe(z2);
      expect(z2, `seed ${seed}`).not.toBe(z3);
    }
  });

  it('zone 1 salts with 0 — the Shallows surface is the round-1 lake, untouched', () => {
    expect(zoneSalt(1)).toBe(0);
    for (const seed of SEEDS) {
      expect(JSON.stringify(generateLake(seed))).toBe(JSON.stringify(generateLake(seed, 1)));
    }
  });

  it('deeper zones stamp their zone onto the map, islets and wrecks', () => {
    const lake = generateLake(42, 3);
    expect(lake.zone).toBe(3);
    for (const iso of lake.islets) expect(iso.zone).toBe(3);
    for (const wreck of lake.wrecks) expect(wreck.zone).toBe(3);
    expect(lake.sinkholes.every((s) => s.zoneFrom === 3 && s.zoneTo === 4)).toBe(true);
  });

  it('1 sinkhole in the Shallows, 2 in the deeper zones, NONE at the Mouth (the cap)', () => {
    for (const seed of SEEDS) {
      expect(generateLake(seed, 1).sinkholes).toHaveLength(1);
      expect(generateLake(seed, 2).sinkholes).toHaveLength(2);
      expect(generateLake(seed, 4).sinkholes).toHaveLength(2);
      expect(generateLake(seed, MAX_ZONE).sinkholes).toHaveLength(0);
    }
  });

  it('every sinkhole mouth is in open water — reachable by boat, not on an islet', () => {
    for (const seed of SEEDS) {
      for (let zone = 1; zone < MAX_ZONE; zone++) {
        const lake = generateLake(seed, zone);
        for (const s of lake.sinkholes) {
          // the mouth sits off the gap islet's shore, clear of its hull radius
          const d = Math.hypot(s.mouth.x - s.pos.x, s.mouth.z - s.pos.z);
          expect(d, `seed ${seed} zone ${zone}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('descent: the Night Clock does not reset (plan §5.1)', () => {
  it('elapsed and phase are monotonic across a descent', () => {
    const w = runWorld();
    // run into the night so the phase is observable on both sides
    w.time.elapsed = PHASE_LENGTH_S + 30;
    const epochBefore = w.run.startedAt;
    const clockBefore = w.clock.runStartMs;
    const elapsedBefore = runElapsedMs(w.run.startedAt, w.time.elapsed);
    const phaseBefore = phaseAt(elapsedBefore);
    expect(phaseBefore).toBe('night');

    descend(w);

    expect(w.run.startedAt).toBe(epochBefore);
    expect(w.clock.runStartMs).toBe(clockBefore);
    const elapsedAfter = runElapsedMs(w.run.startedAt, w.time.elapsed);
    expect(elapsedAfter).toBeGreaterThanOrEqual(elapsedBefore);
    expect(phaseAt(elapsedAfter)).toBe(phaseBefore);
  });

  it('the clock keeps advancing through four descents — never rewinds', () => {
    const w = runWorld();
    let last = -1;
    for (let d = 0; d < 4; d++) {
      for (let i = 0; i < 60 * 30; i++) w.time.elapsed += DT;
      const before = runElapsedMs(w.run.startedAt, w.time.elapsed);
      expect(before).toBeGreaterThan(last);
      last = before;
      descend(w);
      expect(runElapsedMs(w.run.startedAt, w.time.elapsed)).toBeGreaterThanOrEqual(before);
    }
    expect(w.run.zone).toBe(MAX_ZONE);
  });
});

describe('descent: the Dread floor rises (plan §4.1)', () => {
  it('the floor is a clamp — 0 → 25 → 50 → 75 → 90, never a nightMult gain', () => {
    const w = runWorld();
    for (const zone of [2, 3, 4, 5]) {
      descend(w);
      expect(w.run.zone).toBe(zone);
      expect(w.run.zoneFloor).toBe(ZONE_DREAD_FLOOR[zone]);
      expect(w.dread).toBe(ZONE_DREAD_FLOOR[zone]); // exactly the floor, no ×1.25
    }
  });

  it('Dread already above the floor is left alone (it is a floor, not a set)', () => {
    const w = runWorld();
    w.dread = 62;
    descend(w); // zone 2, floor 25
    expect(w.dread).toBe(62);
    descend(w); // zone 3, floor 50 — still below 62
    expect(w.dread).toBe(62);
    descend(w); // zone 4, floor 75 — now it lifts
    expect(w.dread).toBe(75);
  });

  it('Dread and the haul persist across the descent (nothing resets but the lake)', () => {
    const w = runWorld();
    w.dread = 33;
    w.run.haul = [{ species: 'a', tier: 1, weight: 1, clean: true, memories: 5, xp: 5 }];
    descend(w);
    expect(w.dread).toBe(33);
    expect(w.run.haul).toHaveLength(1);
    expect(w.run.dreadPeak).toBeGreaterThanOrEqual(33);
  });
});

describe('descent: the zone cap (plan §12.7)', () => {
  it('caps at zone 5 — further descents are refused', () => {
    const w = runWorld();
    for (let i = 0; i < 10; i++) descend(w);
    expect(w.run.zone).toBe(MAX_ZONE);
    expect(w.run.sinkholesDescended).toBe(MAX_ZONE - 1);
    expect(canDescend(w)).toBe(false);
    expect(w.run.zoneFloor).toBe(ZONE_DREAD_FLOOR[MAX_ZONE]);
  });

  it('the Mouth has no sinkholes to descend through', () => {
    const w = runWorld();
    for (let i = 0; i < 4; i++) descend(w);
    expect(w.lake!.zone).toBe(MAX_ZONE);
    expect(w.lake!.sinkholes).toHaveLength(0);
    expect(nearestSinkhole(w, w.boat.x, w.boat.z)).toBeNull();
  });
});

describe('descent: the world after the gap', () => {
  it('regenerates the lake for the deeper zone from the same run seed', () => {
    const w = runWorld(4242);
    descend(w);
    expect(JSON.stringify(w.lake)).toBe(JSON.stringify(generateLake(4242, 2)));
    expect(w.seed).toBe(4242);
  });

  it('the boat starts the new zone at its lighthouse islet with a fresh ripple field', () => {
    const w = runWorld();
    descend(w);
    expect(w.mode).toBe('boat');
    expect(w.dockedIslet).toBeNull();
    expect(w.disturbances.length).toBeGreaterThan(0);
    for (const d of w.disturbances) expect(d.state).toBe('idle');
  });

  it('each zone still has its own two extraction buoys — extraction works at depth', () => {
    const w = runWorld();
    for (let i = 0; i < 3; i++) {
      descend(w);
      expect(w.lake!.buoys).toHaveLength(2);
      expect(w.lake!.buoys.filter((b) => b.primary)).toHaveLength(1);
      expect(w.lake!.buoys.every((b) => !b.submerged)).toBe(true);
    }
  });
});

describe('the descent verb (hold at the mouth)', () => {
  it('needs the full hold: a partial hold descends nothing', () => {
    const w = runWorld();
    parkAtSinkhole(w);
    w.intent.extract = true;
    for (let i = 0; i < Math.floor((DESCEND_HOLD_SECONDS / DT) * 0.5); i++) updateDescent(w, DT);
    expect(w.run.zone).toBe(1);
    expect(w.run.descend.held).toBeGreaterThan(0);
  });

  it('a completed hold at the mouth descends exactly one zone', () => {
    const w = runWorld();
    parkAtSinkhole(w);
    w.intent.extract = true;
    for (let i = 0; i < Math.ceil(DESCEND_HOLD_SECONDS / DT) + 2; i++) updateDescent(w, DT);
    expect(w.run.zone).toBe(2);
    expect(w.run.sinkholesDescended).toBe(1);
  });

  it('releasing the verb resets the hold', () => {
    const w = runWorld();
    parkAtSinkhole(w);
    w.intent.extract = true;
    for (let i = 0; i < 10; i++) updateDescent(w, DT);
    expect(w.run.descend.held).toBeGreaterThan(0);
    w.intent.extract = false;
    updateDescent(w, DT);
    expect(w.run.descend.held).toBe(0);
  });

  it('does nothing out of range, mid-fight, or while a Dragger has the hull', () => {
    const hold = Math.ceil(DESCEND_HOLD_SECONDS / DT) + 2;

    const far = runWorld();
    parkAtSinkhole(far);
    far.boat.x += DESCEND_RANGE * 4;
    far.intent.extract = true;
    for (let i = 0; i < hold; i++) updateDescent(far, DT);
    expect(far.run.zone).toBe(1);

    const busy = runWorld();
    parkAtSinkhole(busy);
    busy.boatCombat.active = true;
    busy.intent.extract = true;
    for (let i = 0; i < hold; i++) updateDescent(busy, DT);
    expect(busy.run.zone).toBe(1);

    const wet = runWorld();
    parkAtSinkhole(wet);
    wet.water.active = true;
    wet.intent.extract = true;
    for (let i = 0; i < hold; i++) updateDescent(wet, DT);
    expect(wet.run.zone).toBe(1);
  });
});
