// TETHER LOG — plan 02 §11 / T11 instrumentation acceptance.
// Pins the per-fight + session log shape the T12 gate driver asserts on:
// outcomes, maxTension, drag/lunge/dodge tallies, reeledMs, determinism of the
// JSON shape. Steps are fixed-DT worlds — no three, no DOM.

import { describe, it, expect, beforeEach } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import {
  updateTetherLog,
  getSessionLog,
  sessionSummary,
  resetTetherLog,
  type FightRecord,
} from '../../src/playtest/tetherLog';

const DT = FIXED_DT;

// A foot-mode world with a fight started against a fish on +X.
function fightWorld(opts: { x?: number; mass?: number } = {}) {
  const w = createWorld(1);
  w.mode = 'foot';
  w.fish = createFish();
  w.fish.tether.mass = opts.mass ?? 1.5;
  w.fish.x = opts.x ?? 16;
  w.fish.z = 0;
  const fight = startTetherFight(w, M2_SPECIES, 'player');
  expect(fight).not.toBeNull();
  return { w, fight: fight! };
}

describe('tetherLog — fight lifecycle', () => {
  beforeEach(() => resetTetherLog());

  it('records a fight when it starts, as ongoing', () => {
    const { w } = fightWorld();
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    const log = getSessionLog();
    expect(log.fights).toHaveLength(1);
    const f = log.fights[0]!;
    expect(f.outcome).toBe('ongoing');
    expect(f.endedAt).toBeNull();
    expect(f.species).toBe(M2_SPECIES);
    expect(f.anchor).toBe('player');
  });

  it('finalizes a snap with cause events, maxTension and duration', () => {
    const { w, fight } = fightWorld();
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT); // record created while the fight is alive

    // pin both endpoints so the 2m excess persists, crank tension below the
    // ceiling, and let the logger observe it
    w.player.x = 0;
    w.player.z = 0;
    w.fish!.x = 16;
    w.fish!.z = 0;
    fight.tension = 80;
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    expect(getSessionLog().fights[0]!.maxTension).toBeGreaterThan(80);

    // now snap: 99.9 + the same tick's excess gain clamps to 100 and fires
    w.player.x = 0;
    w.player.z = 0;
    w.fish!.x = 16;
    w.fish!.z = 0;
    fight.tension = 99.9;
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    expect(w.tether.fights).toHaveLength(0);
    const log = getSessionLog();
    const f = log.fights[0]!;
    expect(f.outcome).toBe('snap');
    expect(f.endedAt).not.toBeNull();
    expect(f.durationSec).not.toBeNull();
    expect(f.maxTension).toBeGreaterThan(80);
    expect(f.tensionAtEnd).toBe(100); // snap == ceiling, pinned by the logger
    expect(log.tallies.snaps).toBe(1);
    expect(f.events.some((e) => e.type === 'snap')).toBe(true);
  });

  it('records a cut outcome with the cut tally', () => {
    const { w } = fightWorld();
    w.intent.cut = true;
    for (let i = 0; i < 30; i++) {
      updateTetherConstraint(w, DT);
      updateTetherLog(w, DT);
    }
    expect(getSessionLog().fights[0]!.outcome).toBe('cut');
    expect(getSessionLog().tallies.cuts).toBe(1);
  });

  it('records a landed outcome with the land tally', () => {
    // exhausted fish within LAND distance, prompt accepted the tick after
    // eligibility is set by the constraint's final branch
    const { w } = fightWorld({ x: 1 });
    w.fish!.stamina = 0;
    w.fish!.tether.exhausted = true;
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    expect(getSessionLog().fights[0]!.outcome).toBe('landed');
    expect(getSessionLog().tallies.lands).toBe(1);
  });

  it('records a butchered outcome when the catch dies mid-fight', () => {
    const { w } = fightWorld();
    w.fish!.hp = 0;
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    expect(getSessionLog().fights[0]!.outcome).toBe('butchered');
    expect(getSessionLog().tallies.butchers).toBe(1);
  });

  it('tracks maxTension across a fight (not just at the end)', () => {
    const { w } = fightWorld({ mass: 3 });
    // pin both endpoints each tick so the geometry stays stable and tension
    // climbs steadily off the 2m excess; advance sim time so samples land.
    for (let i = 0; i < 60; i++) {
      w.time.elapsed += DT;
      w.player.x = 0;
      w.player.z = 0;
      w.fish!.x = 16;
      w.fish!.z = 0;
      updateTetherConstraint(w, DT);
      updateTetherLog(w, DT);
    }
    const f = getSessionLog().fights[0]!;
    expect(f.maxTension).toBeGreaterThan(0);
    expect(f.samples.length).toBeGreaterThan(0);
    expect(f.samples[0]!.tension).toBeGreaterThanOrEqual(0);
  });
});

describe('tetherLog — event tallies', () => {
  beforeEach(() => resetTetherLog());

  it('tallies drags, lunges (with dodge), telegraphs and reeledMs', () => {
    const { w, fight } = fightWorld({ mass: 4, x: 16 });
    // a big pull fires a drag event
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    w.tetherEvents.length = 0; // the producer clears at the next tick start

    // a lunge while the player's dodge i-frames are active = dodged
    w.tetherEvents.push({
      type: 'lunge',
      fightId: fight.id,
      dir: { x: 1, z: 0 },
      force: 4,
    });
    w.player.dodge.active = true;
    updateTetherLog(w, DT);
    w.tetherEvents.length = 0;

    w.tetherEvents.push({ type: 'telegraph', fightId: fight.id, dir: { x: 1, z: 0 }, kind: 'lunge' });
    updateTetherLog(w, DT);
    w.tetherEvents.length = 0;

    w.tetherEvents.push({ type: 'reeledMs', ms: 500 });
    updateTetherLog(w, DT);

    const log = getSessionLog();
    const f = log.fights[0]!;
    expect(f.drags).toBe(1);
    expect(f.dragMagnitude).toBeGreaterThan(0);
    expect(f.lunges).toBe(1);
    expect(f.lungesDodged).toBe(1);
    expect(f.telegraphs).toBe(1);
    expect(f.reeledMs).toBe(500);
    expect(log.tallies.drags).toBe(1);
    expect(log.tallies.lunges).toBe(1);
    expect(log.tallies.lungesDodged).toBe(1);
    expect(log.tallies.reeledMs).toBe(500);
  });

  it('only counts lunges as dodged while dodge i-frames are active', () => {
    const { w, fight } = fightWorld();
    w.tetherEvents.push({ type: 'lunge', fightId: fight.id, dir: { x: 0, z: 1 }, force: 4 });
    w.player.dodge.active = false;
    updateTetherLog(w, DT);
    const f = getSessionLog().fights[0]!;
    expect(f.lunges).toBe(1);
    expect(f.lungesDodged).toBe(0);
  });

  it('the session summary is a printable, human-readable block', () => {
    const { w, fight } = fightWorld();
    updateTetherLog(w, DT);
    w.tetherEvents.push({ type: 'reeledMs', ms: 1234 });
    updateTetherLog(w, DT);
    expect(fight).toBeDefined();
    const s = sessionSummary();
    expect(s).toContain('tether session');
    expect(s).toContain('landed 0');
    expect(s).toContain('reeled 1.2s');
  });

  it('the JSON shape is plain and serializable (no functions, no undefined)', () => {
    const { w } = fightWorld();
    updateTetherConstraint(w, DT);
    updateTetherLog(w, DT);
    const json = JSON.parse(JSON.stringify(getSessionLog())) as {
      fights: FightRecord[];
    };
    expect(Array.isArray(json.fights)).toBe(true);
    const f = json.fights[0]!;
    expect(typeof f.maxTension).toBe('number');
    expect(Array.isArray(f.events)).toBe(true);
    expect(Array.isArray(f.samples)).toBe(true);
  });
});