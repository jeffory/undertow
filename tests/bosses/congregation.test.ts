// THE CONGREGATION (M6, plan 05 §2.1) — the Kelp Graves boss, driven through
// the real systems. Pins the four things the milestone is made of:
//
//   • the swarm — 20-40 members, deterministic from (run seed, fight id);
//   • the mass pool — decays from exhaustion AND gaffs, scales pullForce so the
//     fight "starts heavy and lightens", and exhausting it arms the ORDINARY
//     LAND prompt;
//   • the tear-off — members come off in a seeded order, monotonically;
//   • the burst — LAND writes 12-18 real haul records + bestiary credits and
//     starts the invoice, and the run reducer never double-lands the centre.
//
// Plus the two invariants around it: zone 1 never grows a boss ripple, and an
// ordinary fight's pull force is untouched by the new fight-level dial.
//
// Pure Node — no three, no DOM. Fixed-DT steps over real worlds.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun } from '../../src/run/run';
import { descend } from '../../src/run/descent';
import { PHASE_LENGTH_S } from '../../src/game/clock';
import { hookCongregation, congregationBiteEligible } from '../../src/systems/castFlow';
import { updateCongregation } from '../../src/systems/congregation';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { processRunEvents } from '../../src/run/reducer';
import { startTetherFight } from '../../src/game/tether';
import { FISH_TARGET_ID, HEAVY_STAGGER } from '../../src/game/combat';
import { drainTownEvents } from '../../src/meta/townEvents';
import { TOTAL_ACCOUNTS } from '../../src/content/congregationInvoice';
import { seedCongregation, congregationSpawnPoint } from '../../src/spawn/director';
import { CONGREGATION_SPECIES_ID, KELP_BURST_ROSTER, speciesById } from '../../src/data/species';
import {
  BURST_MAX,
  BURST_MIN,
  INVOICE_ROW_SECONDS,
  MEMBERS_MAX,
  MEMBERS_MIN,
  PULL_MULT_EMPTY,
  PULL_MULT_FULL,
  attachedCount,
  buildSwarm,
  massFraction,
  massPoolFor,
  pullForceMultFor,
  tearMembersTo,
  tornCountFor,
} from '../../src/bosses/congregation';

const DT = FIXED_DT;
const SEED = 616;

// A run that has descended into the Kelp Graves, at night (the boss's phase
// gate), with the boat parked on the boss ripple.
function gravesWorld(seed = SEED): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  descend(w); // zone 1 → 2, regenerates the lake and re-seeds the field
  // night: the clock is a pure function of elapsed, so moving the epoch back is
  // exactly "time passed" (the same seam ?debug's __setPhase uses).
  w.run.startedAt = w.time.elapsed - (PHASE_LENGTH_S + 1);
  w.clock.runStartMs = w.run.startedAt * 1000;
  return w;
}

function bossRipple(w: WorldState) {
  return w.disturbances.find((d) => d.boss === 'congregation') ?? null;
}

function hookedGraves(seed = SEED): WorldState {
  const w = gravesWorld(seed);
  const d = bossRipple(w);
  expect(d, 'the Kelp Graves seeded a boss ripple').not.toBeNull();
  w.boat.x = d!.pos.x;
  w.boat.z = d!.pos.z + 4;
  drainTownEvents();
  hookCongregation(w, d!);
  return w;
}

// Bring the hooked swarm to the gunwale, exhausted, and accept the LAND prompt
// through the ordinary constraint — the boss is landed with the verb every catch
// is landed with.
function landIt(w: WorldState): void {
  const fight = w.tether.fights[0]!;
  const fish = w.fish!;
  fight.L = 1.2;
  fight.tension = 0;
  fish.stamina = 0;
  fish.tether.exhausted = true;
  fish.x = w.boat.x + 0.8;
  fish.z = w.boat.z;
  updateTetherConstraint(w, DT); // arms land.eligible
  expect(fight.land.eligible).toBe(true);
  w.intent.acceptLand = true;
  updateTetherConstraint(w, DT); // fires 'landed', ends the fight
  updateCongregation(w, DT); // the burst
  processRunEvents(w); // the reducer, exactly where it runs in UPDATE_ORDER
}

describe('the swarm', () => {
  it('grows 20-40 members on one hook, deterministic per (seed, fight id)', () => {
    const a = buildSwarm(SEED, 3);
    const b = buildSwarm(SEED, 3);
    expect(a.members.length).toBeGreaterThanOrEqual(MEMBERS_MIN);
    expect(a.members.length).toBeLessThanOrEqual(MEMBERS_MAX);
    expect(JSON.stringify(a.members)).toBe(JSON.stringify(b.members));
    expect(a.massPool).toBe(a.members.length);
    expect(a.massPoolMax).toBe(a.members.length);
  });

  it('a different fight id is a different school', () => {
    const a = buildSwarm(SEED, 3);
    const b = buildSwarm(SEED, 4);
    expect(JSON.stringify(a.members)).not.toBe(JSON.stringify(b.members));
  });

  it('the tear order is seeded, a permutation of the members, and reproducible', () => {
    const a = buildSwarm(SEED, 7);
    const b = buildSwarm(SEED, 7);
    expect(a.tearOrder).toEqual(b.tearOrder);
    expect([...a.tearOrder].sort((x, y) => x - y)).toEqual(a.members.map((m) => m.index));
  });
});

describe('the mass pool', () => {
  it('decays from exhaustion and from gaffs, and never below zero', () => {
    expect(massPoolFor(30, 1, 0)).toBe(30); // fresh: the whole congregation
    expect(massPoolFor(30, 0.5, 0)).toBeCloseTo(15, 9); // half-exhausted
    expect(massPoolFor(30, 1, 4)).toBe(26); // four torn off by the gaff
    expect(massPoolFor(30, 0.5, 4)).toBeCloseTo(11, 9); // both, together
    expect(massPoolFor(30, 0, 9)).toBe(0); // spent, clamped
  });

  it('scales pullForce from heavy to light, linearly in the pool', () => {
    const s = buildSwarm(SEED, 11);
    expect(pullForceMultFor(s)).toBeCloseTo(PULL_MULT_FULL, 9);
    s.massPool = s.massPoolMax / 2;
    expect(pullForceMultFor(s)).toBeCloseTo((PULL_MULT_FULL + PULL_MULT_EMPTY) / 2, 9);
    s.massPool = 0;
    expect(pullForceMultFor(s)).toBeCloseTo(PULL_MULT_EMPTY, 9);
    expect(massFraction(s)).toBe(0);
  });

  it('tears members off monotonically, in the seeded order', () => {
    const s = buildSwarm(SEED, 13);
    const order = [...s.tearOrder];
    const centre = { x: 0, z: 0 };
    s.massPool = s.massPoolMax - 3;
    expect(tornCountFor(s)).toBe(3);
    expect(tearMembersTo(s, tornCountFor(s), 1, centre)).toBe(3);
    expect(s.members.filter((m) => !m.attached).map((m) => m.index).sort((a, b) => a - b)).toEqual(
      order.slice(0, 3).sort((a, b) => a - b),
    );
    // the pool climbing back does NOT re-attach anybody
    s.massPool = s.massPoolMax;
    expect(tearMembersTo(s, tornCountFor(s), 2, centre)).toBe(0);
    expect(attachedCount(s)).toBe(s.members.length - 3);
  });
});

describe('the fight', () => {
  it('hooks as ONE tether fight whose catch is the swarm centre', () => {
    const w = hookedGraves();
    expect(w.tether.fights).toHaveLength(1);
    expect(w.tether.fights[0]!.species).toBe(CONGREGATION_SPECIES_ID);
    expect(w.run.activeCatch?.species).toBe(CONGREGATION_SPECIES_ID);
    expect(w.congregation.active).toBe(true);
    expect(w.congregation.fightId).toBe(w.tether.fights[0]!.id);
    expect(w.congregation.members.length).toBeGreaterThanOrEqual(MEMBERS_MIN);
  });

  it('emits boss.started into the town-events queue', () => {
    const w = hookedGraves();
    const events = drainTownEvents();
    const started = events.find((e) => e.type === 'boss.started');
    expect(started).toBeDefined();
    expect(started).toMatchObject({
      bossId: 'congregation',
      zone: 2,
      members: w.congregation.members.length,
    });
  });

  it('starts heavy and lightens: the fight-level pull multiplier tracks the pool', () => {
    const w = hookedGraves();
    const fight = w.tether.fights[0]!;
    expect(fight.pullForceMult).toBeCloseTo(PULL_MULT_FULL, 9);
    // half-exhaust the centre and step the boss system
    w.fish!.stamina = w.fish!.tether.maxStamina * 0.5;
    updateCongregation(w, DT);
    expect(fight.pullForceMult!).toBeLessThan(PULL_MULT_FULL);
    expect(fight.pullForceMult!).toBeGreaterThan(PULL_MULT_EMPTY);
    expect(w.congregation.massPool).toBeCloseTo(w.congregation.massPoolMax * 0.5, 6);
  });

  it('a gaff tears members straight off the hook (heavy takes two, light one)', () => {
    const w = hookedGraves();
    const before = attachedCount(w.congregation);
    w.combat.hits.push({
      targetId: FISH_TARGET_ID,
      damage: 18,
      knockbackX: 0,
      knockbackZ: 0,
      stagger: HEAVY_STAGGER,
    });
    updateCongregation(w, DT);
    expect(w.congregation.gaffTears).toBe(2);
    w.combat.hits.length = 0;
    w.combat.hits.push({
      targetId: FISH_TARGET_ID,
      damage: 6,
      knockbackX: 0,
      knockbackZ: 0,
      stagger: 0,
    });
    updateCongregation(w, DT);
    expect(w.congregation.gaffTears).toBe(3);
    expect(attachedCount(w.congregation)).toBe(before - 3);
    expect(w.congregation.massPool).toBe(w.congregation.massPoolMax - 3);
  });

  it('an exhausted mass pool exhausts the centre, which arms the ordinary LAND', () => {
    const w = hookedGraves();
    const fight = w.tether.fights[0]!;
    w.fish!.stamina = 0;
    updateCongregation(w, DT);
    expect(w.congregation.massPool).toBe(0);
    expect(w.fish!.tether.exhausted).toBe(true);
    expect(attachedCount(w.congregation)).toBe(0);
    // …and the constraint arms LAND on the same rules it always did
    fight.L = 1.2;
    w.fish!.x = w.boat.x + 0.8;
    w.fish!.z = w.boat.z;
    updateTetherConstraint(w, DT);
    expect(fight.land.eligible).toBe(true);
  });

  it('a snapped/cut Congregation adjourns — no burst, no ledger', () => {
    const w = hookedGraves();
    w.tether.fights.length = 0; // the fight ended without a `landed` event
    w.tetherEvents.length = 0;
    updateCongregation(w, DT);
    expect(w.congregation.active).toBe(false);
    expect(w.congregation.landed).toBe(false);
    expect(w.congregation.invoice.active).toBe(false);
    expect(w.run.haul).toHaveLength(0);
  });
});

describe('the burst', () => {
  it('lands 12-18 individual catches into the run haul — not one boss', () => {
    const w = hookedGraves();
    landIt(w);
    const n = w.run.haul.length;
    expect(n).toBeGreaterThanOrEqual(BURST_MIN);
    expect(n).toBeLessThanOrEqual(BURST_MAX);
    expect(w.congregation.burstCount).toBe(n);
    // the reducer ran after us and did NOT add a 19th record for the centre
    expect(w.run.activeCatch).toBeNull();
    for (const rec of w.run.haul) {
      expect(rec.clean).toBe(true);
      expect(rec.memories).toBeGreaterThan(0);
      expect(rec.weight).toBeGreaterThan(0);
    }
  });

  it('itemises the kelp-zone roster, with a guaranteed bestiary credit each', () => {
    const w = hookedGraves();
    landIt(w);
    const rosterNames = KELP_BURST_ROSTER.map((r) => speciesById(r.id).name.toLowerCase());
    for (const rec of w.run.haul) expect(rosterNames).toContain(rec.species);
    const cleanCredits = w.run.bestiaryEvents.filter((e) => e.event === 'clean');
    expect(cleanCredits).toHaveLength(w.run.haul.length);
    for (const ev of cleanCredits) {
      expect(KELP_BURST_ROSTER.map((r) => r.id)).toContain(ev.speciesId);
    }
    // the boss itself was recorded as fought at the hook-set
    expect(w.run.bestiaryEvents.some((e) => e.speciesId === CONGREGATION_SPECIES_ID)).toBe(true);
  });

  it('is deterministic: the same run seed bursts the same haul', () => {
    const a = hookedGraves();
    landIt(a);
    const b = hookedGraves();
    landIt(b);
    expect(JSON.stringify(a.run.haul)).toBe(JSON.stringify(b.run.haul));
  });

  it('raises Dread exactly once, at the epic band', () => {
    const w = hookedGraves();
    const before = w.dread;
    landIt(w);
    expect(w.dread).toBeGreaterThan(before);
    expect(w.dread - before).toBeLessThanOrEqual(12 * 1.25 + 1e-9); // one tier-4 gain × night
  });

  it('emits boss.landed carrying the burst count and the 47 accounts', () => {
    const w = hookedGraves();
    drainTownEvents();
    landIt(w);
    const landed = drainTownEvents().find((e) => e.type === 'boss.landed');
    expect(landed).toMatchObject({
      bossId: 'congregation',
      zone: 2,
      burst: w.run.haul.length,
      accounts: TOTAL_ACCOUNTS,
    });
  });
});

describe('the invoice clock', () => {
  it('starts on the landing with the haul already banked', () => {
    const w = hookedGraves();
    landIt(w);
    expect(w.congregation.invoice.active).toBe(true);
    expect(w.congregation.invoice.rowIndex).toBe(0);
    expect(w.congregation.invoice.fillers.length).toBeGreaterThan(0);
    expect(w.run.haul.length).toBeGreaterThanOrEqual(BURST_MIN);
  });

  it('descends a row every ~0.35 s and stamps at account 47', () => {
    const w = hookedGraves();
    landIt(w);
    const inv = w.congregation.invoice;
    let t = 0;
    while (!inv.done && t < 60) {
      updateCongregation(w, DT);
      t += DT;
    }
    expect(inv.rowIndex).toBe(TOTAL_ACCOUNTS);
    expect(inv.done).toBe(true);
    // 47 rows at 0.35 s, within one row of the ideal
    expect(t).toBeGreaterThan(TOTAL_ACCOUNTS * INVOICE_ROW_SECONDS - INVOICE_ROW_SECONDS);
    expect(t).toBeLessThan(TOTAL_ACCOUNTS * INVOICE_ROW_SECONDS + INVOICE_ROW_SECONDS);
  });

  it('refuses the skip before row 10 and takes it after', () => {
    const w = hookedGraves();
    landIt(w);
    const inv = w.congregation.invoice;
    // three rows in, E does nothing
    for (let i = 0; i < 3; i++) {
      w.intent.extract = false;
      updateCongregation(w, INVOICE_ROW_SECONDS);
    }
    expect(inv.rowIndex).toBeLessThan(10);
    w.intent.extract = true;
    updateCongregation(w, DT);
    expect(inv.done).toBe(false);
    expect(inv.rowIndex).toBeLessThan(TOTAL_ACCOUNTS);
    // past row 10, a fresh press jumps to the stamp
    w.intent.extract = false;
    for (let i = 0; i < 10; i++) updateCongregation(w, INVOICE_ROW_SECONDS);
    expect(inv.rowIndex).toBeGreaterThanOrEqual(10);
    w.intent.extract = true;
    updateCongregation(w, DT);
    expect(inv.rowIndex).toBe(TOTAL_ACCOUNTS);
    expect(inv.done).toBe(true);
  });
});

describe('the spawn trigger', () => {
  it('seeds ONE oversized boss ripple in the Kelp Graves, once per run', () => {
    const w = gravesWorld();
    const ripples = w.disturbances.filter((d) => d.boss === 'congregation');
    expect(ripples).toHaveLength(1);
    expect(w.run.bossSeeded).toBe(true);
    expect(seedCongregation(w)).toBe(false); // never twice
    expect(w.disturbances.filter((d) => d.boss === 'congregation')).toHaveLength(1);
  });

  it('never seeds one in the Shallows — zone 1 is untouched', () => {
    const w = createWorld(SEED);
    ensureLake(w);
    spawnAtLakeStart(w);
    initRun(w);
    expect(w.run.zone).toBe(1);
    expect(w.run.bossSeeded).toBe(false);
    expect(w.disturbances.some((d) => d.boss)).toBe(false);
    expect(seedCongregation(w)).toBe(false);
  });

  it('gathers at the same place for the same run seed, clear of the weed', () => {
    const a = gravesWorld();
    const b = gravesWorld();
    const pa = bossRipple(a)!.pos;
    const pb = bossRipple(b)!.pos;
    expect(pa).toEqual(pb);
    expect(congregationSpawnPoint(a)).toEqual(pa);
    for (const col of a.lake!.kelp) {
      expect(Math.hypot(col.x - pa.x, col.z - pa.z), 'clear of every column').toBeGreaterThan(2);
    }
  });

  it('will not bite before night — the ripple declines the tackle and stays', () => {
    const w = gravesWorld();
    w.run.startedAt = w.time.elapsed; // back to dusk
    w.clock.runStartMs = w.run.startedAt * 1000;
    expect(congregationBiteEligible(w)).toBe(false);
    const d = bossRipple(w)!;
    d.state = 'prompt';
    w.run.promptId = d.id;
    hookCongregation(w, d);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.congregation.active).toBe(false);
    expect(d.state).toBe('idle'); // still there, re-castable
  });
});

describe('every other fight is untouched', () => {
  it('an ordinary tether fight carries no pull multiplier at all', () => {
    const w = createWorld(SEED);
    ensureLake(w);
    spawnAtLakeStart(w);
    initRun(w);
    w.fish = createFish();
    const fight = startTetherFight(w, 'silt-pikelet', 'player');
    expect(fight).not.toBeNull();
    expect(fight!.pullForceMult).toBeUndefined();
    expect(w.congregation.active).toBe(false);
  });
});
