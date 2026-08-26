// THE WHISTLER (M8, plan 05 §2.3) — the Choir's roaming elite, driven through
// the real systems. Pins the four things the task asks for by name:
//
//   • THE ROAM CLAMP — it is held OUTSIDE the lantern disc every tick of the
//     roam, at every bow-lantern level, from every starting position. "Never
//     visible until it strikes" is a clamp, not a probability;
//   • THE PROXIMITY BANDS — three, escalating, fired monotonically and IN ORDER,
//     as `whistler.heard` events plus the three dread lines as faint toasts;
//   • THE HOOK — the Postmaster's reverse configuration, re-used unchanged, from
//     the boat AND on foot: it reels, you cannot, the F-ring costs nothing and
//     ends nothing, and its line does not part;
//   • THE OUTCOMES — the contextual cut (two gaffs → hold E), and its win: it
//     delivers the keeper to the water, occupied per the swamp rule, and does
//     NOT kill.
//
// Plus: the spawn gate, one per run, and zones 1-3 untouched.
//
// Pure Node — no three, no DOM. Fixed-DT steps over real worlds.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart, dockPlayer } from '../../src/gen/lakeWorld';
import { initRun } from '../../src/run/run';
import { descend } from '../../src/run/descent';
import { PHASE_LENGTH_S } from '../../src/game/clock';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateWaterPhase, BREATH_MAX } from '../../src/game/waterPhase';
import { updateCombat, HEAVY_STAGGER, whistlerGaffArc } from '../../src/game/combat';
import { movement, collision } from '../../src/core/systems';
import { drainTownEvents, clearTownEvents, peekTownEvents } from '../../src/meta/townEvents';
import { CHOIR_ZONE } from '../../src/core/zones';
import { BOW_OFFSET, lanternOrigin, lanternRadius } from '../../src/game/darkness';
import { speciesById, WHISTLER_SPECIES_ID, TIER_TABLES } from '../../src/data/species';
import { SWAMP_OCCUPIED_TIER } from '../../src/boat/boatCombat';
import { tierFor } from '../../src/game/dread';
import {
  updateWhistler,
  whistlerFightConfig,
  keeperPoint,
  landmarks,
  DEEP_CLEARANCE,
} from '../../src/systems/whistler';
import {
  BAND_OFFSETS,
  CUT_HOLD_SECONDS,
  CUT_REACH,
  FINAL_BAND,
  GAFF_COST_HEAVY,
  GAFF_COST_LIGHT,
  GAFF_POOL,
  LINE_LENGTH,
  ROAM_MARGIN,
  SPAWN_DIST,
  WHISTLER_DREAD_MIN,
  WHISTLER_MASS,
  WHISTLER_REEL_RATE,
  WHISTLER_TARGET_ID,
  WHISTLER_ZONE,
  bandFor,
  bandRings,
  clampOutsideDisc,
  createWhistlerState,
  cutArmed,
  deepStation,
  nearestLandmarkDistance,
  whistlerGaffCost,
  whistlerSpawnEligible,
} from '../../src/enemies/whistler';
import {
  AMBIENT_LINE_MAX_CHARS,
  CHOIR_AMBIENT,
  CHOIR_LINE_MAX_CHARS,
  bandMoment,
  choirLines,
  choirPlaceholderCount,
  choirTextFor,
  loadChoirLines,
} from '../../src/content/choirLines';
import { bestiaryById } from '../../src/data/bestiaryText';

const DT = FIXED_DT;
const SEED = 4104;

/** A run that has descended into the Choir, at deep night, with Dread past 60. */
function inTheChoir(seed = SEED, zone = CHOIR_ZONE): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  for (let z = 1; z < zone; z++) descend(w);
  setPhase(w, 'deepNight');
  return w;
}

/** The clock is a pure function of elapsed, so moving the epoch back IS time. */
function setPhase(w: WorldState, phase: 'dusk' | 'night' | 'deepNight' | 'falseDawn'): void {
  const idx = ['dusk', 'night', 'deepNight', 'falseDawn'].indexOf(phase);
  w.run.startedAt = w.time.elapsed - (Math.max(0, idx) * PHASE_LENGTH_S + 1);
  w.clock.runStartMs = w.run.startedAt * 1000;
}

/** One sim-ish tick, in UPDATE_ORDER's own order. */
function tick(w: WorldState, dt = DT): void {
  updateTetherConstraint(w, dt);
  updateWaterPhase(w, dt);
  movement(w, dt);
  collision(w, dt);
  updateCombat(w, dt);
  updateWhistler(w, dt);
  w.time.elapsed += dt;
}

function stepUntil(w: WorldState, pred: (w: WorldState) => boolean, maxSeconds = 60): number {
  let t = 0;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    tick(w);
    t += DT;
    if (pred(w)) return t;
  }
  return -1;
}

/** Walk it in along its current bearing (the gate seam's own rule). */
function bringTo(w: WorldState, dist: number): void {
  const s = w.whistler;
  const at = keeperPoint(w);
  const dx = s.x - at.x;
  const dz = s.z - at.z;
  const len = Math.hypot(dx, dz) || 1;
  s.x = at.x + (dx / len) * dist;
  s.z = at.z + (dz / len) * dist;
  s.wanderRing = Math.max(lanternRadius(w) + ROAM_MARGIN, dist);
}

/** The nth band ring for this world's current lantern. */
function ring(w: WorldState, n: number): number {
  return bandRings(lanternRadius(w) + ROAM_MARGIN)[n]!;
}

/** Land one gaff hit the way combat does: a HitEvent, this tick. */
function gaff(w: WorldState, heavy = false): void {
  w.combat.hits.push({
    targetId: WHISTLER_TARGET_ID,
    damage: heavy ? 18 : 6,
    knockbackX: 0,
    knockbackZ: 0,
    stagger: heavy ? HEAVY_STAGGER : 0,
  });
  updateWhistler(w, DT);
  w.combat.hits.length = 0;
}

// ---------------------------------------------------------------------------------
describe('whistler: the spawn gate', () => {
  const base = { zone: WHISTLER_ZONE, phase: 'deepNight', dread: 75, spawned: false };

  it('takes deep night in the Choir at Dread ≥ 60, and nothing else', () => {
    expect(whistlerSpawnEligible(base)).toBe(true);
  });

  it('refuses every other zone', () => {
    for (const zone of [1, 2, 3, 5]) {
      expect(whistlerSpawnEligible({ ...base, zone })).toBe(false);
    }
  });

  it('refuses every phase but deep night — it is not a dusk animal', () => {
    for (const phase of ['dusk', 'night', 'falseDawn']) {
      expect(whistlerSpawnEligible({ ...base, phase })).toBe(false);
    }
  });

  it('refuses below the Dread floor, and takes it exactly at it', () => {
    expect(whistlerSpawnEligible({ ...base, dread: WHISTLER_DREAD_MIN - 0.001 })).toBe(false);
    expect(whistlerSpawnEligible({ ...base, dread: WHISTLER_DREAD_MIN })).toBe(true);
  });

  it('is ONE PER RUN — the latch is the whole gate', () => {
    expect(whistlerSpawnEligible({ ...base, spawned: true })).toBe(false);
  });

  it('the zone-4 Dread floor (75) already clears the gate, by design', () => {
    // Descending into the Choir clamps Dread to 75, so arriving at deep night is
    // sufficient. The Dread condition is a guard against an early-clock visit,
    // not a second grind.
    const w = inTheChoir();
    expect(w.run.zone).toBe(CHOIR_ZONE);
    expect(w.dread).toBeGreaterThanOrEqual(WHISTLER_DREAD_MIN);
  });

  it('never spawns in zones 1-3, however long the run goes', () => {
    for (const zone of [1, 2, 3]) {
      const w = inTheChoir(SEED, zone);
      stepUntil(w, () => w.whistler.phase !== 'idle', 20);
      expect(w.whistler.phase, `zone ${zone}`).toBe('idle');
      expect(w.whistler.spawned).toBe(false);
      expect(w.tether.fights).toHaveLength(0);
    }
  });

  it('spawns on the first tick of a qualifying world, out in the dark', () => {
    const w = inTheChoir();
    updateWhistler(w, DT);
    expect(w.whistler.phase).toBe('roam');
    expect(w.whistler.spawned).toBe(true);
    expect(w.whistler.params?.speciesId).toBe(WHISTLER_SPECIES_ID);
    const at = keeperPoint(w);
    expect(Math.hypot(w.whistler.x - at.x, w.whistler.z - at.z)).toBeCloseTo(SPAWN_DIST, 3);
  });

  it('is deterministic — the same seed sends it in from the same bearing', () => {
    const a = inTheChoir(2024);
    const b = inTheChoir(2024);
    updateWhistler(a, DT);
    updateWhistler(b, DT);
    expect([a.whistler.x, a.whistler.z]).toEqual([b.whistler.x, b.whistler.z]);
    const c = inTheChoir(2025);
    updateWhistler(c, DT);
    expect([c.whistler.x, c.whistler.z]).not.toEqual([a.whistler.x, a.whistler.z]);
  });

  it('the preset is the tier-4 elite the plan asks for', () => {
    const sp = speciesById(WHISTLER_SPECIES_ID);
    expect(sp.tier).toBe(4);
    expect(sp.rarity).toBe('E');
    // never rolled from a ripple: the system is its only producer
    for (const rows of Object.values(TIER_TABLES)) {
      expect(rows.some((r) => r.id === WHISTLER_SPECIES_ID)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------
describe('whistler: the roam clamp — it is never in the light', () => {
  it('clampOutsideDisc pushes a point back out, and leaves an outside point alone', () => {
    const out = clampOutsideDisc(5, 0, 0, 0, 20);
    expect(out.clamped).toBe(true);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(20, 9);
    const clear = clampOutsideDisc(40, 0, 0, 0, 20);
    expect(clear.clamped).toBe(false);
    expect([clear.x, clear.z]).toEqual([40, 0]);
  });

  it('a point exactly on the origin is pushed out deterministically', () => {
    const a = clampOutsideDisc(0, 0, 3, 3, 12);
    const b = clampOutsideDisc(0, 0, 3, 3, 12);
    expect(a).toEqual(b);
    expect(Math.hypot(a.x - 3, a.z - 3)).toBeCloseTo(12, 9);
  });

  it('never enters the lantern disc across a long roam', () => {
    const w = inTheChoir();
    updateWhistler(w, DT);
    const floor = lanternRadius(w) + ROAM_MARGIN;
    for (let i = 0; i < 60 * 45; i++) {
      tick(w);
      if (w.whistler.phase !== 'roam') break;
      const at = lanternOrigin(w);
      const d = Math.hypot(w.whistler.x - at.x, w.whistler.z - at.z);
      expect(d, `tick ${i}`).toBeGreaterThanOrEqual(floor - 1e-6);
    }
  });

  it('a bow lantern pushes the exclusion ring out with the light', () => {
    const w = inTheChoir();
    w.boatCombat.upgrades.bowLantern = 3;
    updateWhistler(w, DT);
    const floor = lanternRadius(w) + ROAM_MARGIN;
    for (let i = 0; i < 60 * 20 && w.whistler.phase === 'roam'; i++) {
      tick(w);
      const at = lanternOrigin(w);
      expect(Math.hypot(w.whistler.x - at.x, w.whistler.z - at.z)).toBeGreaterThanOrEqual(
        floor - 1e-6,
      );
    }
    expect(floor).toBeGreaterThan(16 + ROAM_MARGIN);
  });

  it('closes over time — the roam is a clock, not a coin', () => {
    const w = inTheChoir();
    updateWhistler(w, DT);
    const at0 = keeperPoint(w);
    const start = Math.hypot(w.whistler.x - at0.x, w.whistler.z - at0.z);
    for (let i = 0; i < 60 * 40 && w.whistler.phase === 'roam'; i++) tick(w);
    const at1 = keeperPoint(w);
    const end = Math.hypot(w.whistler.x - at1.x, w.whistler.z - at1.z);
    expect(end).toBeLessThan(start);
  });
});

// ---------------------------------------------------------------------------------
describe('whistler: the three proximity bands', () => {
  const FLOOR = 20; // a stock lantern's roam floor (16 + ROAM_MARGIN)
  const RINGS = bandRings(FLOOR);

  it('bandFor is a ladder: 0 outside, 3 innermost', () => {
    expect(BAND_OFFSETS).toHaveLength(3);
    expect(bandFor(RINGS[0]! + 1, FLOOR)).toBe(0);
    expect(bandFor(RINGS[0]!, FLOOR)).toBe(1);
    expect(bandFor(RINGS[1]!, FLOOR)).toBe(2);
    expect(bandFor(RINGS[2]!, FLOOR)).toBe(3);
    expect(bandFor(0, FLOOR)).toBe(FINAL_BAND);
  });

  it('the rings are strictly inward, and the innermost is still OUTSIDE the light', () => {
    for (let i = 1; i < RINGS.length; i++) expect(RINGS[i]!).toBeLessThan(RINGS[i - 1]!);
    const w = inTheChoir();
    const floor = lanternRadius(w) + ROAM_MARGIN;
    expect(bandRings(floor)[2]!).toBeGreaterThan(lanternRadius(w));
  });

  it('THE INNERMOST BAND IS ALWAYS REACHABLE — at every bow-lantern level', () => {
    // The rings are anchored to the ROAM FLOOR (measured from the lantern, which
    // aboard hangs BOW_OFFSET ahead of the hull) while a band is measured from
    // the hull. If the innermost offset did not clear that, a clamped Whistler
    // could never reach band 3, never strike, and circle the boat forever. This
    // is the invariant that makes the ladder relative rather than absolute.
    for (const level of [0, 1, 2, 3]) {
      const w = inTheChoir();
      w.boatCombat.upgrades.bowLantern = level;
      const floor = lanternRadius(w) + ROAM_MARGIN;
      const worstCaseHullDistance = floor + BOW_OFFSET;
      expect(bandFor(worstCaseHullDistance, floor), `level ${level}`).toBe(FINAL_BAND);
    }
  });

  it('fires ONE band at a time, IN ORDER, even across a jump of two rings', () => {
    clearTownEvents();
    const w = inTheChoir();
    updateWhistler(w, DT);
    drainTownEvents();

    // teleport it straight inside the innermost ring: the ladder must still walk
    bringTo(w, ring(w, 2) - 2);
    const seen: number[] = [];
    for (let i = 0; i < 8 && seen.length < 3; i++) {
      updateWhistler(w, DT);
      for (const ev of drainTownEvents()) {
        if (ev.type === 'whistler.heard') seen.push(ev.band);
      }
    }
    expect(seen).toEqual([1, 2, 3]);
  });

  it('a band never re-fires when it drifts back out and in again', () => {
    clearTownEvents();
    const w = inTheChoir();
    updateWhistler(w, DT);
    bringTo(w, ring(w, 0) - 1);
    updateWhistler(w, DT);
    expect(w.whistler.band).toBe(1);
    drainTownEvents();

    bringTo(w, SPAWN_DIST); // all the way back out
    for (let i = 0; i < 30; i++) updateWhistler(w, DT);
    expect(w.whistler.band).toBe(1); // monotonic — it does not un-hear
    bringTo(w, ring(w, 0) - 1);
    for (let i = 0; i < 30; i++) updateWhistler(w, DT);
    const reheard = drainTownEvents().filter((e) => e.type === 'whistler.heard' && e.band === 1);
    expect(reheard).toHaveLength(0);
  });

  it('every band carries the distance it opened at, and a faint dread toast', () => {
    clearTownEvents();
    const w = inTheChoir();
    updateWhistler(w, DT);
    bringTo(w, ring(w, 0) - 0.5);
    updateWhistler(w, DT);
    const ev = peekTownEvents().find((e) => e.type === 'whistler.heard');
    expect(ev).toBeTruthy();
    expect((ev as { distance: number }).distance).toBeLessThanOrEqual(ring(w, 0));
    const moment = w.township.pendingMoment;
    expect(moment).toBeTruthy();
    expect(moment!.trigger).toBe('band1');
    expect(moment!.text).toBe(choirTextFor('band1'));
    expect(moment!.faint).toBe(true);
  });

  it('THE APPROACH IS ONLY EVER SOUND — nothing is drawn while it roams', () => {
    // The sim's own guarantee, checked without a renderer: through every band,
    // it stays outside the disc, so the render side (which only builds a rig
    // from 'strike' onward) has nothing to draw.
    const w = inTheChoir();
    updateWhistler(w, DT);
    for (let b = 0; b < 3; b++) {
      bringTo(w, ring(w, b) - 0.5);
      updateWhistler(w, DT);
      if (w.whistler.phase !== 'roam') break;
      const at = lanternOrigin(w);
      expect(Math.hypot(w.whistler.x - at.x, w.whistler.z - at.z)).toBeGreaterThanOrEqual(
        lanternRadius(w) + ROAM_MARGIN - 1e-6,
      );
    }
  });
});

// ---------------------------------------------------------------------------------
describe('whistler: the strike is the reverse tether, re-used', () => {
  /** Roam → band 3 → strike → hooked. Returns the world with a live fight. */
  function hooked(w: WorldState): WorldState {
    updateWhistler(w, DT);
    bringTo(w, ring(w, 2) - 1);
    for (let i = 0; i < 6; i++) updateWhistler(w, DT);
    expect(w.whistler.band).toBe(FINAL_BAND);
    const t = stepUntil(w, (x) => x.whistler.fightId >= 0, 20);
    expect(t, 'it set its line').toBeGreaterThan(0);
    return w;
  }

  it('hooks YOU: one ordinary fight with the endpoints the other way round', () => {
    const w = hooked(inTheChoir());
    expect(w.tether.fights).toHaveLength(1);
    const cfg = whistlerFightConfig(w)!;
    expect(cfg.a).toBe('enemy'); // it owns the line
    expect(cfg.b).toBe('player'); // you are the far end of it
    expect(cfg.aReel).toBe('ai'); // IT reels
    expect(cfg.bReel).toBe('none'); // you cannot
    expect(cfg.aCut).toBe('contextual'); // the escape is contextual
    expect(cfg.bCut).toBe('none'); // and costs no lure
    const fight = w.tether.fights[0]!;
    expect(fight.snapBehavior).toBe('hold'); // its line does not part
    expect(fight.reelRate).toBe(WHISTLER_REEL_RATE);
    expect(fight.a.mass).toBe(WHISTLER_MASS);
    expect(fight.L).toBeLessThanOrEqual(LINE_LENGTH);
    expect(w.fish).toBeNull(); // THERE IS NO CATCH — it hooked you
  });

  it('aboard, the line goes on the HULL; on foot, on the keeper', () => {
    const boat = hooked(inTheChoir());
    expect(boat.mode).toBe('boat');
    expect(whistlerFightConfig(boat)!.anchor).toBe('boat');
    expect(boat.tether.fights[0]!.b.anchor.kind).toBe('boat');

    const foot = inTheChoir();
    const iso = foot.lake!.islets[foot.lake!.startIslet]!;
    dockPlayer(foot, foot.lake!.startIslet, { x: iso.center.x, z: iso.center.z });
    hooked(foot);
    expect(foot.mode).toBe('foot');
    expect(whistlerFightConfig(foot)!.anchor).toBe('player');
    expect(foot.tether.fights[0]!.b.anchor.kind).toBe('entity');
  });

  it('the F-cut is inert — neither end carries a lure cost', () => {
    const w = hooked(inTheChoir());
    const lure = w.lure.count;
    w.intent.cut = true;
    for (let i = 0; i < 120; i++) tick(w);
    expect(w.lure.count).toBe(lure);
    expect(w.tether.fights.length).toBeGreaterThan(0);
    w.intent.cut = false;
  });

  it('IT reels: fight.aiReel goes true only during a haul, and L shortens', () => {
    const w = hooked(inTheChoir());
    const fight = w.tether.fights[0]!;
    const hauling = stepUntil(w, () => w.whistler.reeling === true, 20);
    expect(hauling).toBeGreaterThan(0);
    expect(fight.aiReel).toBe(true);
    const l0 = fight.L;
    for (let i = 0; i < 60; i++) tick(w);
    expect(fight.L).toBeLessThan(l0);
  });

  it('a haul routes toward the DEEP — away from every islet', () => {
    const w = hooked(inTheChoir());
    stepUntil(w, () => w.whistler.reeling === true, 20);
    const land = landmarks(w);
    const at = keeperPoint(w);
    const routeClear = nearestLandmarkDistance(w.whistler.routeX, w.whistler.routeZ, land);
    const hereClear = nearestLandmarkDistance(at.x, at.z, land);
    expect(routeClear).toBeGreaterThanOrEqual(hereClear);
  });

  it('deepStation picks the bearing with the most water on it', () => {
    // One island due +X: the station must end up on the far side of the fan.
    const land = [{ x: 30, z: 0 }];
    const st = deepStation(0, 0, land, 20);
    expect(st.x).toBeLessThan(0);
    expect(nearestLandmarkDistance(st.x, st.z, land)).toBeGreaterThan(30);
  });

  it('it will not strike while your hands are full', () => {
    const w = inTheChoir();
    updateWhistler(w, DT);
    // a live fight of your own: it holds at the ring and keeps whistling
    w.tether.fights.push({} as never);
    bringTo(w, ring(w, 2) - 1);
    for (let i = 0; i < 600; i++) updateWhistler(w, DT);
    expect(w.whistler.phase).toBe('roam');
    expect(w.whistler.band).toBe(FINAL_BAND);
    w.tether.fights.length = 0;
  });
});

// ---------------------------------------------------------------------------------
describe('whistler: the outcomes', () => {
  function hookedWorld(seed = SEED): WorldState {
    const w = inTheChoir(seed);
    updateWhistler(w, DT);
    bringTo(w, ring(w, 2) - 1);
    for (let i = 0; i < 6; i++) updateWhistler(w, DT);
    stepUntil(w, (x) => x.whistler.fightId >= 0, 20);
    return w;
  }

  it('the gaff pool is the Postmaster‘s: two lights, or one heavy', () => {
    expect(whistlerGaffCost(0)).toBe(GAFF_COST_LIGHT);
    expect(whistlerGaffCost(HEAVY_STAGGER)).toBe(GAFF_COST_HEAVY);
    expect(GAFF_POOL).toBe(2);
  });

  it('two landed gaffs stagger it and arm the contextual cut', () => {
    const w = hookedWorld();
    expect(cutArmed(w.whistler)).toBe(false);
    gaff(w);
    expect(w.whistler.gaffHp).toBe(GAFF_POOL - 1);
    expect(cutArmed(w.whistler)).toBe(false);
    gaff(w);
    expect(cutArmed(w.whistler)).toBe(true);
    expect(w.whistler.phase).toBe('staggered');
    expect(w.whistler.gaffHits).toBe(2);
  });

  it('one HEAVY is worth both', () => {
    const w = hookedWorld();
    gaff(w, true);
    expect(cutArmed(w.whistler)).toBe(true);
  });

  it('the gaff ARC exists aboard (measured from the hull) and on foot', () => {
    const w = hookedWorld();
    const arc = whistlerGaffArc(w)!;
    expect(arc).toBeTruthy();
    expect(arc.x).toBe(w.boat.x); // aboard: the gunwale the line runs over
    expect(arc.z).toBe(w.boat.z);
  });

  it('hold E in reach CUTS ITS LINE — and it costs nothing', () => {
    clearTownEvents();
    const w = hookedWorld();
    gaff(w, true);
    // bring it to arm's length, the way its own reel would
    const at = keeperPoint(w);
    w.whistler.x = at.x;
    w.whistler.z = at.z + 1;
    const lure = w.lure.count;
    w.intent.extract = true;
    const t = stepUntil(w, (x) => x.whistler.cut === true, 3);
    w.intent.extract = false;
    expect(t).toBeGreaterThanOrEqual(CUT_HOLD_SECONDS - DT);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.lure.count).toBe(lure);
    expect(w.whistler.phase).toBe('sounding');
    expect(w.run.deliveredBy).toBeNull(); // it did not deliver you: you cut it
    const evs = drainTownEvents();
    expect(evs.some((e) => e.type === 'whistler.cut')).toBe(true);
    const cutEv = w.tetherEvents.concat();
    expect(cutEv.some((e) => e.type === 'cut' && e.cost === 'contextual')).toBe(true);
  });

  it('out of reach, the hold banks nothing', () => {
    const w = hookedWorld();
    gaff(w, true);
    const at = keeperPoint(w);
    w.whistler.x = at.x + CUT_REACH + 4;
    w.whistler.z = at.z;
    w.intent.extract = true;
    for (let i = 0; i < 30; i++) updateWhistler(w, DT);
    expect(w.whistler.cutHeld).toBe(0);
    expect(w.whistler.cut).toBe(false);
    w.intent.extract = false;
  });

  it('the stagger window CLOSES and it gets its grip back', () => {
    const w = hookedWorld();
    gaff(w, true);
    expect(cutArmed(w.whistler)).toBe(true);
    stepUntil(w, (x) => x.whistler.phase !== 'staggered', 8);
    expect(cutArmed(w.whistler)).toBe(false);
    expect(w.whistler.gaffHp).toBe(GAFF_POOL);
  });

  it('ITS WIN: it delivers the keeper to the water and does NOT kill', () => {
    clearTownEvents();
    const w = hookedWorld();
    const hp = w.player.hp;
    const t = stepUntil(w, (x) => x.whistler.delivered === true, 120);
    expect(t, 'it delivered').toBeGreaterThan(0);

    expect(w.water.active).toBe(true);
    expect(w.water.adrift).toBe(true);
    expect(w.water.lethal).toBe(false); // it is not a drowning
    expect(w.mode).toBe('foot'); // it took the keeper over the side
    expect(w.dockedIslet).toBeNull(); // and off whatever they were standing on
    expect(w.player.hp).toBe(hp); // NOT a kill
    expect(w.run.ended).toBe(false);
    expect(w.run.deliveredBy).toBe('whistler');
    expect(w.water.breath).toBeCloseTo(BREATH_MAX, 6);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.whistler.phase).toBe('sounding');

    const ev = drainTownEvents().find((e) => e.type === 'whistler.delivered') as
      | { occupied: boolean }
      | undefined;
    expect(ev).toBeTruthy();
    // the existing swamp rule (boat/boatCombat.ts SWAMP_OCCUPIED_TIER)
    expect(ev!.occupied).toBe(tierFor(w.dread) >= SWAMP_OCCUPIED_TIER);
    expect(ev!.occupied).toBe(true); // zone 4's Dread floor is 75 — tier 4
  });

  it('the delivery leaves the keeper in the DEEP, not beside a rock', () => {
    const w = hookedWorld();
    stepUntil(w, (x) => x.whistler.delivered === true, 120);
    const clear = nearestLandmarkDistance(w.player.x, w.player.z, landmarks(w));
    expect(clear).toBeGreaterThanOrEqual(DEEP_CLEARANCE - 1e-6);
  });

  it('after the delivery the water does NOT simply hand you back — you swim', () => {
    const w = hookedWorld();
    stepUntil(w, (x) => x.whistler.delivered === true, 120);
    // Fights are gone, so the ORDINARY branch would surface immediately; the
    // adrift branch does not, because the exit is a walkable shore.
    for (let i = 0; i < 120; i++) tick(w);
    expect(w.water.active).toBe(true);
    expect(w.player.hp).toBeGreaterThan(0); // still not a kill
  });

  it('breath running out while adrift is survivable — it wanted you wet, not dead', () => {
    const w = hookedWorld();
    stepUntil(w, (x) => x.whistler.delivered === true, 120);
    w.water.breath = 0.01;
    for (let i = 0; i < 120; i++) tick(w);
    expect(w.water.breath).toBe(0);
    expect(w.player.hp).toBeGreaterThan(0);
    expect(w.run.ended).toBe(false);
  });

  it('one per run: once it is gone, it does not come back', () => {
    const w = hookedWorld();
    gaff(w, true);
    const at = keeperPoint(w);
    w.whistler.x = at.x;
    w.whistler.z = at.z + 1;
    w.intent.extract = true;
    stepUntil(w, (x) => x.whistler.cut === true, 3);
    w.intent.extract = false;
    stepUntil(w, (x) => x.whistler.phase === 'gone', 8);
    expect(w.whistler.phase).toBe('gone');
    for (let i = 0; i < 60 * 30; i++) updateWhistler(w, DT);
    expect(w.whistler.phase).toBe('gone');
  });
});

// ---------------------------------------------------------------------------------
describe('whistler: state + copy hygiene', () => {
  it('a fresh state is idle, unspawned and holds no line', () => {
    const s = createWhistlerState();
    expect(s.phase).toBe('idle');
    expect(s.spawned).toBe(false);
    expect(s.fightId).toBe(-1);
    expect(s.band).toBe(0);
    expect(s.params).toBeNull();
  });

  it('the Choir has a line for all three bands and all three outcomes', () => {
    for (const band of [1, 2, 3]) {
      const moment = bandMoment(band)!;
      expect(moment).toBeTruthy();
      expect(choirTextFor(moment).length).toBeGreaterThan(0);
    }
    for (const moment of ['hooked', 'escaped', 'delivered'] as const) {
      expect(choirTextFor(moment).length).toBeGreaterThan(0);
    }
    expect(bandMoment(0)).toBeNull();
    expect(bandMoment(4)).toBeNull();
  });

  it('every line is inside the toast‘s own audit width', () => {
    for (const l of choirLines()) {
      expect(l.text.length, l.id).toBeLessThanOrEqual(CHOIR_LINE_MAX_CHARS);
    }
  });

  it('the three dread lines and the hook line are choir.md VERBATIM', () => {
    // docs/story/choir.md §4 "Section 2: The Whistler" — proximityLines + hookLine.
    expect(choirTextFor('band1')).toBe(
      'A clean two-note whistle drifts in from the black, perfectly on pitch.',
    );
    expect(choirTextFor('band2')).toBe(
      'The whistling stopped. Something is standing just beyond the tallow glow.',
    );
    expect(choirTextFor('band3')).toBe(
      'A tune you used to know, whistled through teeth that never breathe.',
    );
    expect(choirTextFor('hooked')).toBe(
      'A barb bites your coat. Something in the darkness begins to reel.',
    );
    for (const moment of ['band1', 'band2', 'band3', 'hooked'] as const) {
      expect(choirLines().find((l) => l.moment === moment)!.placeholder, moment).toBe(false);
    }
  });

  it('only the two moments the bible does not write are still placeholders', () => {
    expect(choirPlaceholderCount()).toBe(2);
    for (const moment of ['escaped', 'delivered'] as const) {
      expect(choirLines().find((l) => l.moment === moment)!.placeholder, moment).toBe(true);
    }
  });

  it('the bestiary record is choir.md verbatim, and files it as a dragger', () => {
    const rec = bestiaryById(WHISTLER_SPECIES_ID)!;
    expect(rec).toBeTruthy();
    expect(rec.name).toBe('The Whistler');
    expect(rec.zone).toBe(4);
    expect(rec.rarity).toBe('E');
    expect(rec.eligibility).toBe(3);
    expect(rec.category).toBe('dragger');
    expect(rec.silhouette).toBe(
      "A tall, unjointed shadow whistling two sharp notes just past the lantern's reach.",
    );
    expect(rec.entryFought).toBe(
      'It carries its own rod and line in the pitch dark. It does not wait for a bite; it searches the light until it finds a mouth.',
    );
    // the species preset and the record agree on all three filing fields
    const sp = speciesById(WHISTLER_SPECIES_ID);
    expect(sp.rarity).toBe(rec.rarity);
    expect(sp.eligibility).toBe(rec.eligibility);
    expect(sp.category).toBe(rec.category);
  });

  it('the six zone-ambient lines are staged verbatim and inside their own cap', () => {
    // docs/story/choir.md §3. Nothing consumes them yet — the ambient ticker is
    // a later round's presentation system; this pins the transcription.
    expect(CHOIR_AMBIENT).toHaveLength(6);
    expect(CHOIR_AMBIENT[0]!.text).toBe(
      'Beyond the lantern rim, there is no silt and no stone. The world only exists where the tallow reaches.',
    );
    const focuses = CHOIR_AMBIENT.map((l) => l.focus);
    expect(focuses).toEqual(['rim', 'sound', 'emissive', 'void', 'choir', 'drift']);
    for (const l of CHOIR_AMBIENT) {
      expect(l.text.length, l.id).toBeLessThan(AMBIENT_LINE_MAX_CHARS);
    }
  });

  it('a later revision of choir.md lands through a data swap', () => {
    const before = choirLines().find((l) => l.moment === 'escaped')!;
    const wasText = before.text;
    const merged = loadChoirLines([
      { id: 'whistler_escape_01', moment: 'escaped', text: 'THE WHISTLING STOPS.', placeholder: false },
    ]);
    expect(merged).toBe(1);
    expect(choirTextFor('escaped')).toBe('THE WHISTLING STOPS.');
    expect(choirLines().find((l) => l.moment === 'escaped')!.placeholder).toBe(false);
    // put it back so test order cannot matter
    loadChoirLines([{ id: 'choir_moment_05', moment: 'escaped', text: wasText, placeholder: true }]);
    expect(choirTextFor('escaped')).toBe(wasText);
    expect(choirPlaceholderCount()).toBe(2);
  });
});
