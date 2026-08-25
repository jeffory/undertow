// WATER PHASE (game) — plan 02 §8, T9 acceptance (tests-first).
// Pins the trigger condition exactly (past the islet shoreline + tethered), the
// 15s breath drain/reset (clamped at 0 — not lethal in M2), the restricted verbs
// (dodge and gaff suppressed; reel/cut/struggle allowed), exit at shore, the
// fight-end surface, the damped+drift movement, and byte-identical replay
// determinism. Steps are fixed-DT (FIXED_DT = 1/60); worlds are minimal
// createWorld() constructions — no three, no DOM.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { movement } from '../../src/core/systems';
import {
  updateWaterPhase,
  BREATH_MAX,
  BREATH_DRAIN,
  WATER_DAMP,
} from '../../src/game/waterPhase';
import { updateController, WALK_SPEED, DODGE_COST } from '../../src/game/controller';
import { updateCombat } from '../../src/game/combat';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { startTetherFight, M2_SPECIES } from '../../src/game/tether';

const DT = FIXED_DT;

// Foot-mode world with a fight against a fish on +X; the player is placed a set
// distance from the islet centre (ground.radius 20 → shore at 19.5 with the
// 0.5m player radius).
function fightWorld(opts: { playerR?: number; fishX?: number } = {}) {
  const w = createWorld(1);
  w.mode = 'foot';
  w.fish = createFish();
  w.fish.tether.mass = 1.5;
  w.fish.x = opts.fishX ?? 14;
  w.fish.z = 0;
  const fight = startTetherFight(w, M2_SPECIES, 'player');
  expect(fight).not.toBeNull();
  if (opts.playerR !== undefined) {
    w.player.x = opts.playerR;
    w.player.z = 0;
  }
  return { w, fight: fight! };
}

// 19.5 + 1.5 = 21 → clearly past the shore (deep water); 10 → clearly inside.
const DEEP_R = 21;
const INSIDE_R = 3;

describe('water phase — trigger (plan §8, T9)', () => {
  it('does NOT trigger when the player is inside the boundary, even tethered', () => {
    const { w } = fightWorld({ playerR: INSIDE_R });
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(false);
    expect(w.ui.underwater).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'pulledUnder')).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'enterWaterPhase')).toBe(false);
  });

  it('does NOT trigger when past the boundary but NOT tethered', () => {
    const w = createWorld(1);
    w.mode = 'foot';
    w.fish = createFish();
    w.player.x = DEEP_R;
    w.player.z = 0;
    expect(w.tether.fights).toHaveLength(0); // no fight
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'pulledUnder')).toBe(false);
  });

  it('triggers exactly when a tethered pull puts the player past the boundary', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(true);
    expect(w.ui.underwater).toBe(true);
    expect(w.water.breath).toBe(BREATH_MAX);
    expect(w.water.breathMax).toBe(BREATH_MAX);
    // the base event (run-reducer kind tether/pulledIn) + the enterWaterPhase API event
    expect(w.tetherEvents.some((e) => e.type === 'pulledUnder')).toBe(true);
    expect(w.tetherEvents.some((e) => e.type === 'enterWaterPhase')).toBe(true);
    const ev = w.tetherEvents.find((e) => e.type === 'pulledUnder');
    if (ev && ev.type === 'pulledUnder') {
      expect(ev.breathSec).toBe(BREATH_MAX);
      expect(ev.occupied).toBe(false);
    }
  });
});

describe('water phase — breath (plan §8)', () => {
  it('drains at exactly 1/s while under and clamps at 0 (not lethal in M2)', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // enter
    expect(w.water.breath).toBe(BREATH_MAX);
    for (let i = 0; i < 60; i++) updateWaterPhase(w, DT); // 1s
    expect(w.water.breath).toBeCloseTo(BREATH_MAX - BREATH_DRAIN, 6);
    // drain to 0 and keep going: clamped, hp untouched
    const hpBefore = w.player.hp;
    for (let i = 0; i < 60 * 20; i++) updateWaterPhase(w, DT); // 20 more s
    expect(w.water.breath).toBe(0);
    expect(w.player.hp).toBe(hpBefore); // NO drowning damage in M2
    expect(w.water.active).toBe(true); // still under — surface happens at shore
  });

  it('resets to full on surfacing', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // enter, breath 15
    w.water.breath = 4; // partially drained
    w.player.x = INSIDE_R; // swim back inside the boundary
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(false);
    expect(w.water.breath).toBe(BREATH_MAX); // full again
  });
});

describe('water phase — exit at shore / fight end', () => {
  it('reaching the shore exits the phase with a surfaced event and the ui flag cleared', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(true);
    expect(w.ui.underwater).toBe(true);
    w.player.x = INSIDE_R;
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(false);
    expect(w.ui.underwater).toBe(false);
    expect(w.tetherEvents.some((e) => e.type === 'surfaced')).toBe(true);
    const ev = w.tetherEvents.find((e) => e.type === 'surfaced');
    if (ev && ev.type === 'surfaced') expect(ev.breathSec).toBe(BREATH_MAX);
  });

  it('a fight ending while under (cut) surfaces the player too', () => {
    const { w, fight } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT);
    expect(w.water.active).toBe(true);
    w.intent.cut = true;
    for (let i = 0; i < 31; i++) updateTetherConstraint(w, DT); // 0.5s hold → cut
    expect(w.tether.fights).toHaveLength(0);
    void fight;
    updateWaterPhase(w, DT); // no fight left → surface
    expect(w.water.active).toBe(false);
    expect(w.ui.underwater).toBe(false);
    expect(w.water.breath).toBe(BREATH_MAX);
    expect(w.tetherEvents.some((e) => e.type === 'surfaced')).toBe(true);
  });
});

describe('water phase — verb restrictions (plan §8)', () => {
  it('dodge is suppressed while under: no roll, no stamina spend', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // enter
    const staminaBefore = w.player.stamina;
    w.intent.dodge = true;
    w.intent.moveX = 1;
    updateController(w, DT);
    expect(w.player.dodge.active).toBe(false);
    expect(w.player.stamina).toBe(staminaBefore); // no DODGE_COST spent
    // sanity: with the water phase off, the same tap rolls
    const dry = createWorld();
    dry.mode = 'foot';
    dry.intent.dodge = true;
    dry.intent.moveX = 1;
    updateController(dry, DT);
    expect(dry.player.dodge.active).toBe(true);
    expect(dry.player.stamina).toBe(100 - DODGE_COST);
  });

  it('gaff is suppressed while under: a held LMB neither swings nor damages', () => {
    const { w } = fightWorld({ playerR: DEEP_R, fishX: 3 });
    updateWaterPhase(w, DT); // enter
    const hpBefore = w.fish!.hp;
    w.intent.primary = true;
    for (let i = 0; i < 40; i++) updateCombat(w, DT); // hold LMB through wind-up + swing
    w.intent.primary = false;
    updateCombat(w, DT);
    expect(w.fish!.hp).toBe(hpBefore);
    expect(w.combat.comboStage).toBe(0);
    expect(w.combat.attackTimer).toBe(0);
  });

  it('reel stays available while under (it is one of the three water verbs)', () => {
    const { w, fight } = fightWorld({ playerR: DEEP_R, fishX: 14 });
    updateWaterPhase(w, DT); // enter
    w.intent.secondary = true;
    const L0 = fight.L;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT); // 1s
    expect(fight.L).toBeLessThan(L0); // line shrinks — reeling works under water
    expect(fight.reel.active).toBe(true);
  });

  it('cut stays available while under (F-ring still costs the lure)', () => {
    const { w, fight } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // enter
    w.intent.cut = true;
    for (let i = 0; i < 31; i++) updateTetherConstraint(w, DT); // 0.5s hold
    expect(fight.cut.fired).toBe(true);
    expect(w.tetherEvents.some((e) => e.type === 'cut')).toBe(true);
    expect(w.lure.count).toBe(0);
  });
});

describe('water phase — movement (plan §8: slow and drifty)', () => {
  it('integrates damped velocity plus the sinusoidal drift', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // entry tick
    updateWaterPhase(w, DT); // active tick — drift set at elapsed≈0: x=0, z=DRIFT_AMP
    const x0 = w.player.x;
    const z0 = w.player.z;
    w.player.vx = WALK_SPEED; // full walk input
    w.player.vz = 0;
    movement(w, DT);
    // x: damped walk (0.85 × 4.5) + drift.x(0); z: drift.z only (cos 0 × 0.3)
    expect(w.player.x - x0).toBeCloseTo(WALK_SPEED * WATER_DAMP * DT, 9);
    expect(w.player.z - z0).toBeCloseTo(0.3 * DT, 9);
  });

  it('is slower than the same walk on land', () => {
    const wet = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(wet.w, DT);
    const wetX0 = wet.w.player.x;
    wet.w.player.vx = WALK_SPEED;
    wet.w.player.vz = 0;
    movement(wet.w, DT);
    const wetDelta = wet.w.player.x - wetX0;

    const dry = createWorld();
    dry.mode = 'foot';
    dry.player.vx = WALK_SPEED;
    dry.player.vz = 0;
    movement(dry, DT);
    expect(wetDelta).toBeLessThan(dry.player.x); // damped (0.85×) < full walk
  });

  it('exposes the toward-shore struggle vector', () => {
    const { w } = fightWorld({ playerR: DEEP_R });
    updateWaterPhase(w, DT); // entry tick — state + pulledUnder event
    updateWaterPhase(w, DT); // active tick — drift + towardShore updated
    const len = Math.hypot(w.water.towardShore.x, w.water.towardShore.z);
    expect(len).toBeCloseTo(1, 6);
    // player at +X of the centre → toward shore points −X
    expect(w.water.towardShore.x).toBeLessThan(0);
  });
});

describe('water phase — replay determinism (spec 8.3)', () => {
  it('same seed + same script → byte-identical water state', () => {
    function run() {
      const w = createWorld(7);
      w.mode = 'foot';
      w.fish = createFish();
      w.fish.tether.mass = 3;
      w.fish.x = 30;
      w.fish.z = 0;
      startTetherFight(w, M2_SPECIES, 'player');
      w.player.x = 22; // past the shore — the trigger fires on the first step
      for (let i = 0; i < 600; i++) {
        updateWaterPhase(w, DT);
        w.player.x += 0.02 * Math.sin(i * 0.1); // deterministic struggle script
      }
      return w;
    }
    const a = run();
    const b = run();
    expect(a.water.active).toBe(b.water.active);
    expect(a.water.breath).toBe(b.water.breath);
    expect(a.water.drift.x).toBe(b.water.drift.x);
    expect(a.water.drift.z).toBe(b.water.drift.z);
    expect(a.water.towardShore.x).toBe(b.water.towardShore.x);
    expect(a.water.towardShore.z).toBe(b.water.towardShore.z);
    expect(a.ui.underwater).toBe(b.ui.underwater);
    expect(a.tetherEvents.length).toBe(b.tetherEvents.length);
  });
});