// THE POSTMASTER (M7 boss, plan 05 §2.2) — the reverse tether, driven through
// the real systems. Pins the six things the round is made of:
//
//   • THE REVERSE ENDPOINT CONFIG — one ORDINARY TetherFight with the endpoints
//     filled the other way round, and everything the plan promises falling out
//     of it: he reels, you cannot; you brace; the F-ring costs nothing and ends
//     nothing; his twine never parts;
//   • HIS REEL SHORTENS L — on HIS side, at his own rate, through the 'ai' case
//     plan 02 declared and left for this round to fill;
//   • THE ROUTE-DRAG TARGETS THE ROOF EDGE — every station is outside the roof
//     hull, and the haul route from the keeper to it crosses the rim;
//   • TELEGRAPH DETERMINISM — the same seed at the same roof shows the same
//     cards in the same order, 1.2 s before the pull, from the bible's verbatim
//     copy;
//   • CUT HIS LINE — the contextual victory: costs no lure, ends the fight,
//     drops the forwarding address, and the address survives a reload;
//   • HIS WIN — a delivery over the edge, lethal breath, the ordinary death
//     flow, and his name on the run result.
//
// Plus: the summon gate, zones 1-2 untouched, and the copy verbatim.
//
// Pure Node — no three, no DOM. Fixed-DT steps over real worlds.

import { describe, it, expect } from 'vitest';
import { createWorld, createFish } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart, dockPlayer } from '../../src/gen/lakeWorld';
import { initRun, buildRunResult } from '../../src/run/run';
import { descend } from '../../src/run/descent';
import { PHASE_LENGTH_S } from '../../src/game/clock';
import { pointInConvex, circleOutOfHull } from '../../src/core/poly';
import { startTetherFight, toRunKinds } from '../../src/game/tether';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateWaterPhase } from '../../src/game/waterPhase';
import { updateCombat, HEAVY_STAGGER, postmasterGaffArc } from '../../src/game/combat';
import { movement, collision } from '../../src/core/systems';
import { processRunEvents } from '../../src/run/reducer';
import { drainTownEvents } from '../../src/meta/townEvents';
import { applyRunResult, freshSave, freshMetaState, migrate } from '../../src/save/migrate';
import { MetaStateSchema, RunResultSchema } from '../../src/save/schemas';
import { postOfficeMarker, postOfficeRoof, POST_OFFICE_ENV_KEY } from '../../src/gen/township';
import { generateLake } from '../../src/gen/lakeMap';
import { envEntryFor } from '../../src/content/envText';
import { speciesById, POSTMASTER_SPECIES_ID, TIER_TABLES } from '../../src/data/species';
import { bestiaryById } from '../../src/data/bestiaryText';
import {
  updatePostmaster,
  postmasterArena,
  atLetterbox,
  reverseFightConfig,
} from '../../src/systems/postmaster';
import {
  BUBBLE_LINE_MAX_CHARS,
  canonicalVerbAt,
  canonicalVerbs,
  postmasterLines,
  postmasterTextFor,
  postmasterPlaceholderCount,
  FORWARDING_ADDRESS_TEXT,
} from '../../src/content/postmasterLines';
import {
  ARRIVE_SECONDS,
  BOSS_MASS,
  BOSS_RADIUS,
  BOSS_REEL_RATE,
  CUT_HOLD_SECONDS,
  CUT_REACH,
  DRAG_SECONDS,
  EDGE_OVERSHOOT,
  GAFF_COST_HEAVY,
  GAFF_COST_LIGHT,
  GAFF_POOL,
  HOLD_RADIUS,
  LINE_LENGTH,
  POSTMASTER_TARGET_ID,
  POSTMASTER_ZONE,
  STAGGER_SECONDS,
  STATION_SECONDS,
  SUMMON_HOLD_SECONDS,
  SUMMON_RANGE,
  TELEGRAPH_SECONDS,
  createPostmasterState,
  cutArmed,
  holdStation,
  postmasterFighting,
  postmasterGaffCost,
  postmasterRng,
  postmasterSummonEligible,
  rimDistance,
  rollRotationStart,
  rollRouteBearing,
  routeStation,
  summonProgress,
} from '../../src/bosses/postmaster';

const DT = FIXED_DT;
const SEED = 616;

// A run that has descended into the drowned Hollow, at night, with the keeper
// standing on the Post Office roof at its letterbox — the arena, set up the way
// play sets it up (a real dock onto the roof islet).
function atThePostOffice(seed = SEED, zone = POSTMASTER_ZONE): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  for (let z = 1; z < zone; z++) descend(w);
  // night: the clock is a pure function of elapsed, so moving the epoch back is
  // exactly "time passed" (the seam ?debug's __setPhase uses).
  w.run.startedAt = w.time.elapsed - (PHASE_LENGTH_S + 1);
  w.clock.runStartMs = w.run.startedAt * 1000;
  const arena = postmasterArena(w);
  if (arena) dockPlayer(w, arena.roof.isletId, arena.marker);
  return w;
}

function setPhaseDusk(w: WorldState): void {
  w.run.startedAt = w.time.elapsed;
  w.clock.runStartMs = w.time.elapsed * 1000;
}

/** Hold E for as long as it takes to summon him (or give up). */
function summonHim(w: WorldState, maxSeconds = 4): boolean {
  w.intent.extract = true;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    updatePostmaster(w, DT);
    if (w.postmaster.phase !== 'idle') {
      w.intent.extract = false;
      return true;
    }
  }
  w.intent.extract = false;
  return false;
}

/** One full sim-ish tick: the constraint, then the boss. */
function tick(w: WorldState, dt = DT): void {
  updateTetherConstraint(w, dt);
  updateWaterPhase(w, dt);
  movement(w, dt);
  collision(w, dt);
  updateCombat(w, dt);
  updatePostmaster(w, dt);
}

function stepUntil(w: WorldState, pred: (w: WorldState) => boolean, maxSeconds = 30): number {
  let t = 0;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    tick(w);
    t += DT;
    if (pred(w)) return t;
  }
  return -1;
}

/** Land one gaff hit on him the way combat does: a HitEvent this tick. */
function gaff(w: WorldState, heavy = false): void {
  w.combat.hits.push({
    targetId: POSTMASTER_TARGET_ID,
    damage: heavy ? 18 : 6,
    knockbackX: 0,
    knockbackZ: 0,
    stagger: heavy ? HEAVY_STAGGER : 0,
  });
  updatePostmaster(w, DT);
  w.combat.hits.length = 0;
}

// ---------------------------------------------------------------------------------
describe('postmaster: the arena and the summon gate', () => {
  it('the drowned Post Office is a real roof on EVERY drowned street', () => {
    // The house rotation alone lost it on ~14% of seeds (the steeple and the
    // marquee overwrite two roofs, and a short street can lose the only one), so
    // gen/township.ts guarantees it. A Township with no Postmaster in it is a
    // Township missing a milestone; this test is why the guarantee exists.
    for (let seed = 1; seed <= 120; seed++) {
      const m = generateLake(seed, 3);
      const roof = postOfficeRoof(m.roofs);
      expect(roof).not.toBeNull();
      expect(roof!.building).toBe('post-office');
      expect(roof!.slot).toBe('house');
      // …and exactly one letterbox for it
      expect(m.envPoints.filter((p) => p.key === POST_OFFICE_ENV_KEY)).toHaveLength(1);
    }
  });

  it('its letterbox carries its own env point, appended after everything else', () => {
    const m = generateLake(SEED, 3);
    const roof = postOfficeRoof(m.roofs)!;
    const pts = m.envPoints.filter((p) => p.key === POST_OFFICE_ENV_KEY);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.roofId).toBe(roof.id);
    // last in the array: no existing env point's id moved for it
    expect(pts[0]!.id).toBe(m.envPoints.length - 1);
    // and it stands ON the roof, so the keeper can hold E at it
    expect(pointInConvex(pts[0]!.pos, m.islets[roof.isletId]!.hull)).toBe(true);
    expect(pts[0]!.radius).toBeLessThanOrEqual(SUMMON_RANGE);
  });

  it('the marker copy is township.md verbatim, not a placeholder', () => {
    const entry = envEntryFor(POST_OFFICE_ENV_KEY)!;
    expect(entry.placeholder).toBe(false);
    expect(entry.text).toContain('OUTGOING DISPATCH SUSPENDED DUE TO RISING TIDE.');
    expect(entry.text).toContain('PLEASE DEPOSIT ALL WATERPROOF PARCELS ON THE TOP SORTING SHELF.');
  });

  it('the gate is zone 3 + night+ + on foot at the marker + hands free + once', () => {
    const base = {
      zone: 3,
      phase: 'night',
      onFoot: true,
      atMarker: true,
      fightLive: false,
      submerged: false,
      summoned: false,
    };
    expect(postmasterSummonEligible(base)).toBe(true);
    expect(postmasterSummonEligible({ ...base, zone: 1 })).toBe(false);
    expect(postmasterSummonEligible({ ...base, zone: 2 })).toBe(false);
    expect(postmasterSummonEligible({ ...base, phase: 'dusk' })).toBe(false);
    expect(postmasterSummonEligible({ ...base, phase: 'falseDawn' })).toBe(false);
    expect(postmasterSummonEligible({ ...base, phase: 'deepNight' })).toBe(true);
    expect(postmasterSummonEligible({ ...base, onFoot: false })).toBe(false);
    expect(postmasterSummonEligible({ ...base, atMarker: false })).toBe(false);
    expect(postmasterSummonEligible({ ...base, fightLive: true })).toBe(false);
    expect(postmasterSummonEligible({ ...base, submerged: true })).toBe(false);
    expect(postmasterSummonEligible({ ...base, summoned: true })).toBe(false);
  });

  it('hold E at the letterbox summons him; a tap does not', () => {
    const w = atThePostOffice();
    expect(atLetterbox(w, postmasterArena(w)!)).toBe(true);

    // a tap: one tick of E, then nothing
    w.intent.extract = true;
    updatePostmaster(w, DT);
    w.intent.extract = false;
    updatePostmaster(w, DT);
    expect(w.postmaster.phase).toBe('idle');
    expect(w.postmaster.summonHeld).toBe(0);

    expect(summonHim(w)).toBe(true);
    expect(w.postmaster.phase).toBe('arrive');
    expect(w.tether.fights).toHaveLength(1);
  });

  it('the hold takes SUMMON_HOLD_SECONDS and reads back as progress', () => {
    const w = atThePostOffice();
    w.intent.extract = true;
    let t = 0;
    while (w.postmaster.phase === 'idle' && t < 4) {
      updatePostmaster(w, DT);
      t += DT;
    }
    expect(t).toBeGreaterThanOrEqual(SUMMON_HOLD_SECONDS - DT);
    expect(t).toBeLessThanOrEqual(SUMMON_HOLD_SECONDS + DT * 2);
    expect(summonProgress({ ...createPostmasterState(), summonHeld: SUMMON_HOLD_SECONDS })).toBe(1);
  });

  it('at dusk the letterbox is just a sign', () => {
    const w = atThePostOffice();
    setPhaseDusk(w);
    expect(summonHim(w)).toBe(false);
    expect(w.tether.fights).toHaveLength(0);
  });

  it('one Postmaster per run', () => {
    const w = atThePostOffice();
    expect(summonHim(w)).toBe(true);
    w.tether.fights.length = 0;
    updatePostmaster(w, DT); // the line is gone → he leaves
    expect(w.postmaster.phase).toBe('gone');
    w.postmaster.phase = 'idle';
    expect(summonHim(w)).toBe(false);
  });

  it('zones 1 and 2 never build a Post Office roof, so the gate cannot fire', () => {
    for (const zone of [1, 2]) {
      const m = generateLake(SEED, zone);
      expect(m.roofs).toHaveLength(0);
      expect(postOfficeRoof(m.roofs)).toBeNull();
      const w = createWorld(SEED);
      ensureLake(w);
      spawnAtLakeStart(w);
      initRun(w);
      for (let z = 1; z < zone; z++) descend(w);
      expect(postmasterArena(w)).toBeNull();
      w.intent.extract = true;
      for (let i = 0; i < 300; i++) updatePostmaster(w, DT);
      expect(w.postmaster.phase).toBe('idle');
      expect(w.tether.fights).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: THE REVERSE ENDPOINT CONFIG', () => {
  it('is ONE ordinary fight with the endpoints filled the other way round', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(w.tether.fights).toHaveLength(1);
    expect(reverseFightConfig(w)).toEqual({
      a: 'enemy', // the BOSS holds the A end
      b: 'player', // the keeper is the far end of his line
      aReel: 'ai', // he reels
      bReel: 'none', // you cannot
      aCut: 'contextual', // the close-range action
      bCut: 'none', // and no F-ring cost anywhere on it
    });
    const f = w.tether.fights[0]!;
    expect(f.a.mass).toBe(BOSS_MASS);
    expect(f.a.radius).toBe(BOSS_RADIUS);
    expect(f.b.mass).toBe(1);
    expect(f.L).toBe(LINE_LENGTH);
    expect(f.reelRate).toBe(BOSS_REEL_RATE);
    expect(f.snapBehavior).toBe('hold');
    expect(f.species).toBe(POSTMASTER_SPECIES_ID);
    // and there is NO CATCH: he hooked you
    expect(w.fish).toBeNull();
    expect(w.run.activeCatch).toBeNull();
  });

  it('the PLAYER cannot reel: RMB is inert for the whole fight', () => {
    const w = atThePostOffice();
    summonHim(w);
    const f = w.tether.fights[0]!;
    const L0 = f.L;
    w.intent.secondary = true; // hold RMB
    const stamina0 = w.player.stamina;
    for (let i = 0; i < 120; i++) updateTetherConstraint(w, DT);
    expect(f.reel.active).toBe(false);
    expect(f.L).toBe(L0);
    expect(w.player.stamina).toBe(stamina0); // no reel drain either
  });

  it('the F-ring costs nothing and ends nothing — the player F-cut is untouched', () => {
    const w = atThePostOffice();
    summonHim(w);
    const lure0 = w.lure.count;
    w.intent.cut = true;
    for (let i = 0; i < 120; i++) updateTetherConstraint(w, DT); // 2 s of held F
    expect(w.tether.fights).toHaveLength(1); // the line holds
    expect(w.lure.count).toBe(lure0); // nothing paid
    expect(w.tetherEvents.some((e) => e.type === 'cut')).toBe(false);
    expect(w.tether.fights[0]!.cut.progress).toBe(0);
  });

  it('an ORDINARY fight still cuts for a lure, exactly as before', () => {
    const w = createWorld(SEED);
    ensureLake(w);
    spawnAtLakeStart(w);
    initRun(w);
    w.fish = createFish();
    w.mode = 'foot';
    const f = startTetherFight(w, 'silt-pikelet', 'player')!;
    w.intent.cut = true;
    for (let i = 0; i < 60; i++) {
      updateTetherConstraint(w, DT);
      if (w.tether.fights.length === 0) break;
    }
    expect(w.tether.fights).toHaveLength(0);
    expect(w.lure.count).toBe(0); // the lure was paid
    expect(w.tetherEvents.some((e) => e.type === 'cut' && e.cost === 'lure')).toBe(true);
    void f;
  });

  it('his twine does not part: at the ceiling it HOLDS, costing nothing', () => {
    const w = atThePostOffice();
    summonHim(w);
    const f = w.tether.fights[0]!;
    const lure0 = w.lure.count;
    f.tension = w.line.tensionCeiling;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT);
    expect(w.tether.fights).toHaveLength(1);
    expect(w.lure.count).toBe(lure0);
    expect(w.player.stagger).toBe(0);
    expect(w.tetherEvents.some((e) => e.type === 'snap')).toBe(false);
  });

  it('a reeling BOSS does not halve the keeper’s walk speed', () => {
    const w = atThePostOffice();
    summonHim(w);
    const f = w.tether.fights[0]!;
    f.aiReel = true;
    updateTetherConstraint(w, DT);
    expect(f.reel.active).toBe(true);
    // movement's speed multiplier is the STANCE's, and the stance is not his
    w.player.vx = 4.5;
    w.player.vz = 0;
    w.water.active = false;
    const x0 = w.player.x;
    movement(w, DT);
    expect(w.player.x - x0).toBeCloseTo(4.5 * DT, 6);
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: HIS REEL SHORTENS L', () => {
  it('takes line at his own rate while he is delivering, and floors at his radius', () => {
    const w = atThePostOffice();
    summonHim(w);
    const f = w.tether.fights[0]!;
    f.aiReel = true;
    const L0 = f.L;
    for (let i = 0; i < 60; i++) updateTetherConstraint(w, DT);
    expect(L0 - f.L).toBeCloseTo(BOSS_REEL_RATE * 60 * DT, 4);

    for (let i = 0; i < 2000; i++) updateTetherConstraint(w, DT);
    expect(f.L).toBeCloseTo(BOSS_RADIUS, 6); // never below the hook radius
  });

  it('shortening L drags the KEEPER, not him — the mass split is 9:1', () => {
    const w = atThePostOffice();
    summonHim(w);
    const s = w.postmaster;
    const f = w.tether.fights[0]!;
    // park them apart, line taut, and let him take one metre
    w.player.x = s.x + 12;
    w.player.z = s.z;
    f.L = 12;
    const px0 = w.player.x;
    const bx0 = s.x;
    f.aiReel = true;
    for (let i = 0; i < 30; i++) updateTetherConstraint(w, DT);
    const playerMoved = Math.abs(w.player.x - px0);
    const bossMoved = Math.abs(s.x - bx0);
    expect(playerMoved).toBeGreaterThan(0.3);
    expect(playerMoved / (playerMoved + bossMoved)).toBeCloseTo(BOSS_MASS / (BOSS_MASS + 1), 2);
  });

  it('he pays line back out between deliveries — you are RETURNED, then sent again', () => {
    const w = atThePostOffice();
    summonHim(w);
    const f = w.tether.fights[0]!;
    f.L = 4;
    // ARRIVE → STATION, where the payout happens
    expect(stepUntil(w, (x) => x.postmaster.phase === 'station', 6)).toBeGreaterThan(0);
    const L0 = f.L;
    for (let i = 0; i < 30; i++) tick(w);
    expect(f.L).toBeGreaterThan(L0);
    expect(f.L).toBeLessThanOrEqual(LINE_LENGTH);
  });

  it('bracing into the pull costs him ground (the constraint’s own brace term)', () => {
    const braced = atThePostOffice();
    const loose = atThePostOffice();
    for (const w of [braced, loose]) {
      summonHim(w);
      const s = w.postmaster;
      const f = w.tether.fights[0]!;
      w.player.x = s.x + 12;
      w.player.z = s.z;
      f.L = 12;
      f.aiReel = true;
    }
    // The brace the constraint has always implemented (tests/game/tether.test.ts
    // "moving into the pull reduces displacement by exactly the dial"): you set
    // your feet INTO the yank rather than being dragged by it. Here the pull is
    // toward him, so bracing is stepping toward him — and it costs him ground.
    braced.intent.moveX = -1;
    braced.intent.moveY = 0;
    for (let i = 0; i < 60; i++) {
      updateTetherConstraint(braced, DT);
      updateTetherConstraint(loose, DT);
    }
    expect(braced.player.x).toBeGreaterThan(loose.player.x); // dragged less far in
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: THE ROUTE-DRAG TARGETS THE ROOF EDGE', () => {
  it('rimDistance finds the roof rim along a bearing', () => {
    const m = generateLake(SEED, 3);
    const roof = postOfficeRoof(m.roofs)!;
    const hull = m.islets[roof.isletId]!.hull;
    const inside = (p: { x: number; z: number }) => pointInConvex(p, hull);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const d = rimDistance(hull, roof.pos, a, inside);
      expect(d).toBeGreaterThan(0);
      // just inside is on the roof, just outside is not
      const inPt = { x: roof.pos.x + Math.cos(a) * (d - 0.4), z: roof.pos.z + Math.sin(a) * (d - 0.4) };
      const outPt = { x: roof.pos.x + Math.cos(a) * (d + 0.4), z: roof.pos.z + Math.sin(a) * (d + 0.4) };
      expect(inside(inPt)).toBe(true);
      expect(inside(outPt)).toBe(false);
    }
  });

  it('every route station is OFF the roof, past the rim by the overshoot', () => {
    const m = generateLake(SEED, 3);
    const roof = postOfficeRoof(m.roofs)!;
    const hull = m.islets[roof.isletId]!.hull;
    const inside = (p: { x: number; z: number }) => pointInConvex(p, hull);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const st = routeStation(hull, roof.pos, a, inside);
      expect(inside(st)).toBe(false);
      const rim = rimDistance(hull, roof.pos, a, inside);
      expect(Math.hypot(st.x - roof.pos.x, st.z - roof.pos.z)).toBeCloseTo(rim + EDGE_OVERSHOOT, 5);
    }
  });

  it('the live fight routes him past the rim, and the haul route CROSSES it', () => {
    const w = atThePostOffice();
    summonHim(w);
    const arena = postmasterArena(w)!;
    const hull = arena.islet.hull;
    const inside = (p: { x: number; z: number }) => pointInConvex(p, hull);

    expect(stepUntil(w, (x) => x.postmaster.phase === 'telegraph', 12)).toBeGreaterThan(0);
    const s = w.postmaster;
    expect(inside({ x: s.routeX, z: s.routeZ })).toBe(false);

    // the keeper is on the roof; the straight line to the station leaves it
    let leftTheRoof = false;
    for (let i = 1; i <= 40; i++) {
      const t = i / 40;
      const p = {
        x: w.player.x + (s.routeX - w.player.x) * t,
        z: w.player.z + (s.routeZ - w.player.z) * t,
      };
      if (!inside(p)) leftTheRoof = true;
    }
    expect(leftTheRoof).toBe(true);
  });

  it('a delivery actually hauls the keeper off the slates and into the street', () => {
    const w = atThePostOffice();
    summonHim(w);
    const arena = postmasterArena(w)!;
    // let the loop run: arrive → station → telegraph → drag, unresisted
    const t = stepUntil(w, (x) => x.water.active, 40);
    expect(t).toBeGreaterThan(0);
    expect(w.ui.underwater).toBe(true);
    // the keeper's own circle is over the rim — the trigger the water phase uses
    expect(
      circleOutOfHull({ x: w.player.x, z: w.player.z, radius: w.player.radius }, arena.islet.hull),
    ).toBeGreaterThan(0);
    expect(w.tetherEvents.some((e) => e.type === 'pulledUnder')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: THE TELEGRAPHS', () => {
  it('the eight bible rows are verbatim, verb-tagged, and inside the audit', () => {
    const rows = postmasterLines();
    expect(rows).toHaveLength(8);
    expect(postmasterPlaceholderCount()).toBe(0);
    expect(postmasterTextFor('REVERSE_PULL')).toBe('SPECIAL DELIVERY.');
    expect(postmasterTextFor('LINE_WHIP')).toBe('RETURN TO SENDER.');
    expect(postmasterTextFor('HAZARD_DRAG')).toBe('SIGN HERE.');
    expect(postmasterTextFor('APPROACH')).toBe('POSTAGE DUE UPON RECEIPT.');
    expect(postmasterTextFor('TENSION_SPIKE')).toBe('PLEASE INITIAL THE MARGIN.');
    expect(postmasterTextFor('REPOSITION')).toBe('FORWARDING SERVICE REQUESTED.');
    expect(postmasterTextFor('BRACE_CHECK')).toBe('FRAGILE: DO NOT BEND.');
    expect(postmasterTextFor('STAGE_TRANSITION')).toBe('SIGNATURE REQUIRED UPON SUBMERSION.');
    for (const r of rows) expect(r.line.length).toBeLessThanOrEqual(BUBBLE_LINE_MAX_CHARS);
    expect(rows.filter((r) => r.isCanonical)).toHaveLength(3);
  });

  it('the canonical three rotate, in the bible’s own order', () => {
    expect(canonicalVerbs()).toEqual(['REVERSE_PULL', 'LINE_WHIP', 'HAZARD_DRAG']);
    expect(canonicalVerbAt(0, 0)).toBe('REVERSE_PULL');
    expect(canonicalVerbAt(1, 0)).toBe('LINE_WHIP');
    expect(canonicalVerbAt(2, 0)).toBe('HAZARD_DRAG');
    expect(canonicalVerbAt(3, 0)).toBe('REVERSE_PULL');
    expect(canonicalVerbAt(0, 2)).toBe('HAZARD_DRAG'); // a seeded start offsets it
    expect(canonicalVerbAt(1, 2)).toBe('REVERSE_PULL');
  });

  it('a card goes up 1.2 s BEFORE the pull, and it is a canonical one', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(stepUntil(w, (x) => x.postmaster.phase === 'telegraph', 12)).toBeGreaterThan(0);
    const s = w.postmaster;
    const line = postmasterTextFor(s.card!);
    expect(['SPECIAL DELIVERY.', 'RETURN TO SENDER.', 'SIGN HERE.']).toContain(line);
    expect(s.timer).toBeCloseTo(TELEGRAPH_SECONDS, 5);

    // and the drag begins exactly TELEGRAPH_SECONDS later
    const t = stepUntil(w, (x) => x.postmaster.phase === 'drag', 4);
    expect(t).toBeGreaterThan(TELEGRAPH_SECONDS - DT * 2);
    expect(t).toBeLessThan(TELEGRAPH_SECONDS + DT * 3);
    expect(w.tether.fights[0]!.aiReel).toBe(true); // and only NOW does he take line
  });

  it('the same seed at the same roof shows the same cards in the same order', () => {
    const cardsFor = (seed: number): string[] => {
      const w = atThePostOffice(seed);
      summonHim(w);
      const seen: string[] = [];
      for (let i = 0; i < Math.ceil(45 / DT); i++) {
        const before = w.postmaster.phase;
        tick(w);
        if (w.postmaster.phase === 'telegraph' && before !== 'telegraph') {
          seen.push(postmasterTextFor(w.postmaster.card!));
        }
        if (seen.length >= 4) break;
      }
      return seen;
    };
    const a = cardsFor(SEED);
    const b = cardsFor(SEED);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a).toEqual(b);
  });

  it('the rotation START and the route bearings are seeded, not fixed', () => {
    const starts = new Set<number>();
    const bearings = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const rng = postmasterRng(seed, 3, 0);
      starts.add(rollRotationStart(rng));
      bearings.add(Math.round(rollRouteBearing(rng) * 1000));
    }
    expect(starts.size).toBeGreaterThan(1);
    expect(bearings.size).toBeGreaterThan(6);
    // and re-rolling the same key gives the same answer
    const r1 = postmasterRng(SEED, 3, 2);
    const r2 = postmasterRng(SEED, 3, 2);
    expect(rollRouteBearing(r1)).toBe(rollRouteBearing(r2));
  });

  it('a courtesy fires when the street closes over your head', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(stepUntil(w, (x) => x.water.active, 40)).toBeGreaterThan(0);
    // SIGNATURE REQUIRED UPON SUBMERSION — the bible's STAGE_TRANSITION verb
    const cards = drainTownEvents().filter((e) => e.type === 'postmaster.telegraph');
    expect(cards.some((e) => e.type === 'postmaster.telegraph' && e.verb === 'STAGE_TRANSITION')).toBe(
      true,
    );
  });

  it('a courtesy never talks over a live canonical telegraph', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(stepUntil(w, (x) => x.postmaster.phase === 'telegraph', 12)).toBeGreaterThan(0);
    const card = w.postmaster.card;
    // force the tension ceiling, which would otherwise raise TENSION_SPIKE
    w.postmaster.courtesyCooldown = 0;
    w.tether.fights[0]!.tension = w.line.tensionCeiling;
    updatePostmaster(w, DT);
    expect(w.postmaster.card).toBe(card);
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: THE GAFF AND THE CUT', () => {
  it('two landed gaffs stagger him and arm the cut', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(w.postmaster.gaffHp).toBe(GAFF_POOL);
    expect(cutArmed(w.postmaster)).toBe(false);
    gaff(w);
    expect(w.postmaster.gaffHp).toBe(GAFF_POOL - GAFF_COST_LIGHT);
    expect(cutArmed(w.postmaster)).toBe(false);
    gaff(w);
    expect(cutArmed(w.postmaster)).toBe(true);
    expect(w.postmaster.gaffHits).toBe(2);
  });

  it('one HEAVY is worth both', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    expect(postmasterGaffCost(HEAVY_STAGGER)).toBe(GAFF_COST_HEAVY);
    expect(cutArmed(w.postmaster)).toBe(true);
    expect(w.postmaster.gaffHits).toBe(1);
  });

  it('the swing that lands is the ORDINARY one, through updateCombat', () => {
    const w = atThePostOffice();
    summonHim(w);
    const s = w.postmaster;
    // stand him at arm's length, dead ahead
    s.x = w.player.x;
    s.z = w.player.z + 1.2;
    w.player.facing = 0;
    expect(postmasterGaffArc(w)).not.toBeNull();
    // a real light tap: press, release, then let the swing's active window open
    w.intent.primary = true;
    updateCombat(w, DT);
    w.intent.primary = false;
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      updateCombat(w, DT);
      hit = w.combat.hits.some((h) => h.targetId === POSTMASTER_TARGET_ID);
      if (hit) updatePostmaster(w, DT);
    }
    expect(hit).toBe(true);
    expect(w.postmaster.gaffHits).toBe(1);
  });

  it('he is out of the arc when there is no fight, and aboard the boat', () => {
    const w = atThePostOffice();
    expect(postmasterGaffArc(w)).toBeNull(); // idle
    summonHim(w);
    expect(postmasterGaffArc(w)).not.toBeNull();
    w.mode = 'boat';
    expect(postmasterGaffArc(w)).toBeNull();
  });

  it('the stagger window LAPSES: his grip comes back and the delivery resumes', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    expect(cutArmed(w.postmaster)).toBe(true);
    // stand out of reach so the hold cannot fire, and wait it out
    w.postmaster.x = w.player.x + 40;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    const t = stepUntil(w, (x) => !cutArmed(x.postmaster), STAGGER_SECONDS + 2);
    w.intent.extract = false;
    expect(t).toBeGreaterThan(STAGGER_SECONDS - DT * 3);
    expect(w.postmaster.gaffHp).toBe(GAFF_POOL);
    expect(w.tether.fights).toHaveLength(1);
  });

  it('CUT HIS LINE: hold E in reach while he is staggered', () => {
    const w = atThePostOffice();
    summonHim(w);
    const lure0 = w.lure.count;
    const inv0 = w.run.inventory.length;
    gaff(w, true);
    // in reach
    w.postmaster.x = w.player.x + 1;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    const t = stepUntil(w, (x) => x.postmaster.cut, 3);
    w.intent.extract = false;

    expect(t).toBeGreaterThan(0);
    expect(t).toBeGreaterThanOrEqual(CUT_HOLD_SECONDS - DT * 2);
    expect(w.tether.fights).toHaveLength(0); // the line is gone
    expect(w.postmaster.phase).toBe('sinking'); // he goes down courteously
    expect(w.lure.count).toBe(lure0); // IT COST NOTHING
    expect(w.run.forwardingAddress).toBe(true); // the drop
    expect(w.run.inventory.length).toBe(inv0 + 1); // …and one parcel
    expect(['R', 'E', 'Drowned']).toContain(w.run.inventory[inv0]!.rarity);
    const cut = w.tetherEvents.find((e) => e.type === 'cut');
    expect(cut && cut.type === 'cut' && cut.cost).toBe('contextual');
    expect(w.tetherEvents.some((e) => e.type === 'bossLineCut')).toBe(true);
    expect(toRunKinds(cut!)).toBe('tether/cut');
    // the bestiary met him and then beat him
    const events = w.run.bestiaryEvents.filter((e) => e.speciesId === POSTMASTER_SPECIES_ID);
    expect(events.map((e) => e.event)).toEqual(['hooked', 'butchered']);
    // the drop text is on the parchment note
    expect(w.township.pendingMoment?.text).toBe(FORWARDING_ADDRESS_TEXT);
  });

  it('out of reach, the hold banks nothing', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    w.postmaster.x = w.player.x + CUT_REACH + 2;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    for (let i = 0; i < 30; i++) updatePostmaster(w, DT);
    expect(w.postmaster.cutHeld).toBe(0);
    expect(w.postmaster.cut).toBe(false);
  });

  it('the cut is not armed before the stagger, however close you stand', () => {
    const w = atThePostOffice();
    summonHim(w);
    w.postmaster.x = w.player.x;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    for (let i = 0; i < 120; i++) updatePostmaster(w, DT);
    expect(w.postmaster.cut).toBe(false);
    expect(w.tether.fights).toHaveLength(1);
  });

  it('he sinks, then stops being drawn', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    w.postmaster.x = w.player.x;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    stepUntil(w, (x) => x.postmaster.cut, 3);
    w.intent.extract = false;
    expect(stepUntil(w, (x) => x.postmaster.phase === 'gone', 6)).toBeGreaterThan(0);
    expect(w.postmaster.params).toBeNull();
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: the forwarding address persists', () => {
  it('rides the RunResult onto metaState, and latches there', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    w.postmaster.x = w.player.x;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    stepUntil(w, (x) => x.postmaster.cut, 3);

    const result = buildRunResult(w, true);
    expect(result.forwardingAddress).toBe(true);
    expect(RunResultSchema.parse(result).forwardingAddress).toBe(true);

    const save = applyRunResult(freshSave(), result);
    expect(save.metaState.forwardingAddress).toBe(true);

    // survives a serialize / migrate round trip (the reload path)
    const reloaded = migrate(JSON.parse(JSON.stringify(save)));
    expect(reloaded.metaState.forwardingAddress).toBe(true);

    // and a LATER run that never met him cannot un-post the slip
    const plain = { ...result, forwardingAddress: false };
    expect(applyRunResult(save, plain).metaState.forwardingAddress).toBe(true);
  });

  it('a run that never cut his line does not post it', () => {
    const w = atThePostOffice();
    const result = buildRunResult(w, true);
    expect(result.forwardingAddress).toBe(false);
    expect(applyRunResult(freshSave(), result).metaState.forwardingAddress).toBe(false);
  });

  it('every save that predates the field loads with the address unposted', () => {
    expect(freshMetaState().forwardingAddress).toBe(false);
    expect(MetaStateSchema.parse({}).forwardingAddress).toBe(false);
    // an M5-era metaState blob, verbatim, with no such key
    const legacy = {
      buildings: {},
      memories: 40,
      notesRead: [],
      decants: 0,
      damKeyUsed: false,
      breadcrumbs: [],
      endingsSeen: {},
      nplus: false,
    };
    expect(MetaStateSchema.parse(legacy).forwardingAddress).toBe(false);
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: HIS WIN — the delivery that lands', () => {
  it('breath is lethal in HIS water phase, and only in his', () => {
    // his fight: lethal
    const w = atThePostOffice();
    summonHim(w);
    expect(stepUntil(w, (x) => x.water.active, 40)).toBeGreaterThan(0);
    expect(w.water.lethal).toBe(true);

    // an ORDINARY zone-1 water phase: still merely clamps at zero
    const o = createWorld(SEED);
    ensureLake(o);
    spawnAtLakeStart(o);
    initRun(o);
    o.mode = 'foot';
    o.fish = createFish();
    startTetherFight(o, 'silt-pikelet', 'player');
    o.water.active = true;
    o.water.breath = 0.02;
    o.water.breathMax = 15;
    o.player.x = 9999; // far out in deep water
    for (let i = 0; i < 20; i++) updateWaterPhase(o, DT);
    expect(o.water.lethal).toBe(false);
    expect(o.water.breath).toBe(0);
    expect(o.player.hp).toBe(100); // NOT lethal, exactly as before
  });

  it('breath 0 under his line ends the run, and the receipt names the deliverer', () => {
    const w = atThePostOffice();
    summonHim(w);
    expect(stepUntil(w, (x) => x.water.active, 40)).toBeGreaterThan(0);
    w.water.breath = 0.02; // stand at the end of the timer
    expect(stepUntil(w, (x) => x.player.hp <= 0, 4)).toBeGreaterThan(0);

    expect(w.postmaster.delivered).toBe(true);
    expect(w.postmaster.phase).toBe('gone');
    expect(w.tether.fights).toHaveLength(0);
    expect(w.run.deliveredBy).toBe('postmaster');
    expect(w.tetherEvents.some((e) => e.type === 'delivered' && e.by === 'postmaster')).toBe(true);

    const result = buildRunResult(w, false);
    expect(result.deliveredBy).toBe('postmaster');
    expect(RunResultSchema.parse(result).deliveredBy).toBe('postmaster');
    // he does not hand over the address for winning
    expect(result.forwardingAddress).toBe(false);
  });

  it('an ordinary run result carries no deliverer at all', () => {
    const w = atThePostOffice();
    const result = buildRunResult(w, true);
    expect(result.deliveredBy).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: the body, the record, and the town queue', () => {
  it('the body is the fish pipeline with a distinctive preset', () => {
    const preset = speciesById(POSTMASTER_SPECIES_ID);
    expect(preset.name).toBe('The Postmaster');
    expect(preset.rarity).toBe('Boss');
    expect(preset.category).toBe('boss');
    expect(preset.humanRatio).toBeGreaterThan(0.8); // a man, mostly
    expect(preset.palette).toBe(5); // the deep-dark: a long dark coat
    // The mailbag hump: one girth bump near the HEAD end (render stands the rig
    // on end, so head-end == shoulder), standing proud of the coat's flat line.
    const g = preset.girthCurve;
    expect(g).toHaveLength(preset.spineSegments);
    const peak = Math.max(...g);
    const at = g.indexOf(peak);
    expect(at).toBeGreaterThanOrEqual(Math.floor(g.length / 2)); // the shoulder half
    expect(peak).toBeGreaterThan(g[at - 2]! * 1.25); // proud of the flat coat
    expect(g[0]!).toBeLessThan(peak * 0.5); // and narrow at the other end
  });

  it('no ripple can ever roll him — he is summoned, never hooked', () => {
    for (const rows of Object.values(TIER_TABLES)) {
      expect(rows.some((r) => r.id === POSTMASTER_SPECIES_ID)).toBe(false);
    }
  });

  it('the bestiary record is township.md verbatim', () => {
    const rec = bestiaryById(POSTMASTER_SPECIES_ID)!;
    expect(rec.zone).toBe(3);
    expect(rec.rarity).toBe('Boss');
    expect(rec.eligibility).toBe(2);
    expect(rec.category).toBe('boss');
    expect(rec.silhouette).toBe(
      'A tall, waterlogged figure in a brass-buttoned coat, sorting parcels in the current.',
    );
    expect(rec.entryFought).toBe(
      'He carried thirty years of unread letters through forty fathoms of dark water. He is not angry about the flood; he is merely glad to finally clear his sorting bag.',
    );
    expect(rec.entryWilling).toBeUndefined(); // there is no willing way to meet him
  });

  it('the drop text is township.md verbatim', () => {
    expect(FORWARDING_ADDRESS_TEXT).toContain(
      "'The Keeper, Sluice House No. 1, Greywater Basin. All future correspondence to be tendered directly.'",
    );
    expect(FORWARDING_ADDRESS_TEXT).toContain(
      'The Post Office on dry land can now resume direct sorting.',
    );
  });

  it('the town queue carries the summons, the telegraphs and the cut', () => {
    drainTownEvents();
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    w.postmaster.x = w.player.x;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    stepUntil(w, (x) => x.postmaster.cut, 3);
    const kinds = drainTownEvents().map((e) => e.type);
    expect(kinds).toContain('postmaster.summoned');
    expect(kinds).toContain('postmaster.telegraph');
    expect(kinds).toContain('postmaster.cut');
  });

  it('the reducer folds his cut as an abandon, and pays no land gain', () => {
    const w = atThePostOffice();
    summonHim(w);
    gaff(w, true);
    w.postmaster.x = w.player.x;
    w.postmaster.z = w.player.z;
    w.intent.extract = true;
    stepUntil(w, (x) => x.postmaster.cut, 3);
    const haul0 = w.run.haul.length;
    processRunEvents(w);
    expect(w.run.haul.length).toBe(haul0);
    expect(w.run.activeCatch).toBeNull();
  });
});

// ---------------------------------------------------------------------------------
describe('postmaster: the fight loop, timed', () => {
  it('arrive → station → telegraph → drag → station, at the declared durations', () => {
    const w = atThePostOffice();
    summonHim(w);
    const seen: Array<{ phase: string; at: number }> = [];
    let t = 0;
    let last = w.postmaster.phase;
    for (let i = 0; i < Math.ceil(30 / DT) && seen.length < 5; i++) {
      tick(w);
      t += DT;
      if (w.postmaster.phase !== last) {
        seen.push({ phase: w.postmaster.phase, at: t });
        last = w.postmaster.phase;
      }
    }
    expect(seen.map((s) => s.phase).slice(0, 4)).toEqual([
      'station',
      'telegraph',
      'drag',
      'station',
    ]);
    expect(seen[0]!.at).toBeCloseTo(ARRIVE_SECONDS, 1);
    expect(seen[1]!.at - seen[0]!.at).toBeCloseTo(STATION_SECONDS, 1);
    expect(seen[2]!.at - seen[1]!.at).toBeCloseTo(TELEGRAPH_SECONDS, 1);
    expect(seen[3]!.at - seen[2]!.at).toBeCloseTo(DRAG_SECONDS, 1);
  });

  it('he only takes line during a DRAG', () => {
    const w = atThePostOffice();
    summonHim(w);
    for (let i = 0; i < Math.ceil(20 / DT); i++) {
      tick(w);
      const f = w.tether.fights[0];
      if (!f) break;
      expect(f.aiReel).toBe(w.postmaster.phase === 'drag');
    }
  });

  it('he holds station off the roof between deliveries', () => {
    const w = atThePostOffice();
    summonHim(w);
    const arena = postmasterArena(w)!;
    const at = holdStation(arena.roof.pos, w.postmaster.angle);
    expect(Math.hypot(at.x - arena.roof.pos.x, at.z - arena.roof.pos.z)).toBeCloseTo(HOLD_RADIUS, 6);
    expect(pointInConvex(at, arena.islet.hull)).toBe(false);
  });

  it('postmasterFighting is true for exactly the phases that hold a line', () => {
    const s = createPostmasterState();
    for (const p of ['arrive', 'station', 'telegraph', 'drag', 'staggered'] as const) {
      expect(postmasterFighting({ ...s, phase: p })).toBe(true);
    }
    for (const p of ['idle', 'sinking', 'gone'] as const) {
      expect(postmasterFighting({ ...s, phase: p })).toBe(false);
    }
  });
});
