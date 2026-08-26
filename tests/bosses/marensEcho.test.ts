// MAREN'S ECHO (M8 boss, plan 05 §2.3) — the tonal pivot, driven through the
// real systems. The plan's acceptance for this round is unusual, and so is this
// file: it asks for a NO-COMBAT CHECK ("no HP reaches zero anywhere in the
// fight") and a scene checklist, so those are the two things it proves hardest.
//
//   • THE STATE MACHINE — hold / sway / mirror, and NOTHING ELSE: no lunge, no
//     drag, no attack state, no phase she can enter that the keeper did not put
//     her in;
//   • THE PROXIMITY CURVE — tension from distance alone, 0 at the length she
//     holds at and the line's ceiling at the L floor, with the constraint's own
//     tension dynamics provably switched off for her fight and provably
//     untouched for everyone else's;
//   • THE STAMINA MIRROR — a drain proportional to reel activity, on top of the
//     ordinary reel drain, that can empty the pool and can never touch hp;
//   • SNAP AT THE CEILING — she "goes home" through the ordinary snap path; the
//     run continues;
//   • THE FULL REEL — LAND, a guaranteed clean catch, the Echo's Scale, the
//     truth scene's three beats, and `truthSeen` surviving a reload;
//   • THE NO-COMBAT INVARIANT — player hp and her hp, sampled EVERY TICK of
//     both endings, never move; gaff swings through the fight do nothing.
//
// Plus the summon gate, the copy verbatim from docs/story/choir.md, and zones
// 1-3 untouched.
//
// Pure Node — no three, no DOM. Fixed-DT steps over real worlds.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import type { WorldState } from '../../src/core/world';
import { FIXED_DT } from '../../src/core/time';
import { ensureLake, spawnAtLakeStart } from '../../src/gen/lakeWorld';
import { initRun, buildRunResult } from '../../src/run/run';
import { descend } from '../../src/run/descent';
import { generateLake } from '../../src/gen/lakeMap';
import { movement, collision } from '../../src/core/systems';
import { updateTetherConstraint } from '../../src/game/tetherConstraint';
import { updateWaterPhase } from '../../src/game/waterPhase';
import { updateCombat, HEAVY_STAGGER, FISH_TARGET_ID } from '../../src/game/combat';
import { updateStamina } from '../../src/game/stamina';
import { processRunEvents } from '../../src/run/reducer';
import { startTetherFight, PLAYER_ENTITY, FISH_ENTITY } from '../../src/game/tether';
import { drainTownEvents } from '../../src/meta/townEvents';
import { applyRunResult, freshSave, freshMetaState, migrate } from '../../src/save/migrate';
import { MetaStateSchema, RunResultSchema } from '../../src/save/schemas';
import { applyBestiaryEvents, emptyBestiary } from '../../src/bestiary/bestiary';
import { bestiaryById } from '../../src/data/bestiaryText';
import { speciesById, MARENS_ECHO_SPECIES_ID } from '../../src/data/species';
import { createFish } from '../../src/core/world';
import {
  updateMarensEcho,
  echoMarkerFor,
  atEchoMarker,
  echoFightConfig,
} from '../../src/systems/marensEcho';
import {
  ARRIVE_SECONDS,
  ECHO_MASS,
  ECHO_RADIUS,
  ECHO_REEL_RATE,
  HOLD_LENGTH,
  LAND_MARGIN,
  MARENS_ECHO_ZONE,
  MIRROR_DRAIN_MAX,
  SUMMON_HOLD_SECONDS,
  SUMMON_RANGE,
  SWAY_ARC,
  SWAY_LINE_SECONDS,
  choirDim,
  createMarensEchoState,
  echoMarker,
  echoSummonEligible,
  echoTensionFraction,
  isMarensThimble,
  landEligibleAt,
  landWindowFraction,
  mirrorDrain,
  nearestLandmark,
  swayOffset,
} from '../../src/bosses/marensEcho';
import {
  ECHOS_SCALE,
  ECHO_SNAP_LINE,
  ECHO_SUMMON_TEXT,
  ECHO_SWAY_LINES,
  SWAY_LINE_MAX_CHARS,
  TRUTH_BEAT_MAX_WORDS,
  TRUTH_SCENE,
  echoSwayLineAt,
} from '../../src/content/choirLines';

const DT = FIXED_DT;
const SEED = 4104;

// --- the arena ----------------------------------------------------------------

/** A run that has descended into the Choir, with the hull sitting at the marker. */
function atTheMarker(seed = SEED, zone = MARENS_ECHO_ZONE): WorldState {
  const w = createWorld(seed);
  ensureLake(w);
  spawnAtLakeStart(w);
  initRun(w);
  for (let z = 1; z < zone; z++) descend(w);
  const marker = echoMarkerFor(w);
  if (marker) {
    w.boat.x = marker.x;
    w.boat.z = marker.z;
    w.boat.speed = 0;
  }
  return w;
}

/** One full sim-ish tick, in the real update order (echo before the reducer). */
function tick(w: WorldState, dt = DT): void {
  w.tetherEvents.length = 0; // the real stream is cleared by the first producer
  updateStamina(w, dt);
  updateTetherConstraint(w, dt);
  updateWaterPhase(w, dt);
  movement(w, dt);
  collision(w, dt);
  updateCombat(w, dt);
  updateMarensEcho(w, dt);
  processRunEvents(w);
}

/** Hold E until she is summoned (or give up). */
function summonHer(w: WorldState, maxSeconds = 4): boolean {
  w.intent.extract = true;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    updateMarensEcho(w, DT);
    if (w.marensEcho.phase !== 'idle') {
      w.intent.extract = false;
      return true;
    }
  }
  w.intent.extract = false;
  return false;
}

/**
 * Reel her in the way the fight is actually played: pull until the pool gives
 * out, let go, let it come back, pull again. (Holding RMB through an empty pool
 * is the same 0.8 s regen-delay thrash every long fight in the game has; a
 * player releases, and so does this.)
 */
function reel(w: WorldState, until: (w: WorldState) => boolean, maxSeconds = 90): number {
  let t = 0;
  let resting = false;
  for (let i = 0; i < Math.ceil(maxSeconds / DT); i++) {
    if (!resting && w.player.stamina <= 1) resting = true;
    if (resting && w.player.stamina >= w.player.maxStamina - 1) resting = false;
    w.intent.secondary = !resting;
    tick(w);
    t += DT;
    if (until(w)) {
      w.intent.secondary = false;
      return t;
    }
  }
  w.intent.secondary = false;
  return -1;
}

/** A watcher that samples the two hp pools every tick of whatever it wraps. */
function noCombatWitness(w: WorldState): { check: () => void; samples: number } {
  const hp0 = w.player.hp;
  const echoHp0 = w.marensEcho.hp;
  const witness = { samples: 0, check: (): void => {} };
  witness.check = () => {
    witness.samples++;
    expect(w.player.hp, 'keeper hp').toBe(hp0);
    expect(w.marensEcho.hp, 'her hp').toBe(echoHp0);
  };
  return witness;
}

// ------------------------------------------------------------------------------
describe("maren's echo: the marker and the summon gate", () => {
  it('the marker is the deepest water in the lake, and the same one every time', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const map = generateLake(seed, MARENS_ECHO_ZONE);
      const land = map.islets.map((i) => ({ x: i.center.x, z: i.center.z }));
      const a = echoMarker(land);
      const b = echoMarker(land);
      expect(a).toEqual(b); // pure: no RNG, no state
      const clear = nearestLandmark(a.x, a.z, land);
      // nothing on the search grid is further from land than the point it picked
      for (let x = -99; x <= 99; x += 11) {
        for (let z = -99; z <= 99; z += 11) {
          expect(nearestLandmark(x, z, land)).toBeLessThanOrEqual(clear + 1e-9);
        }
      }
    }
  });

  it('the gate: the Choir, at the marker, hands free, once per run', () => {
    const base = {
      zone: MARENS_ECHO_ZONE,
      atMarker: true,
      fightLive: false,
      hasCatch: false,
      submerged: false,
      summoned: false,
    };
    expect(echoSummonEligible(base)).toBe(true);
    expect(echoSummonEligible({ ...base, zone: 1 })).toBe(false);
    expect(echoSummonEligible({ ...base, zone: 3 })).toBe(false);
    expect(echoSummonEligible({ ...base, atMarker: false })).toBe(false);
    expect(echoSummonEligible({ ...base, fightLive: true })).toBe(false);
    expect(echoSummonEligible({ ...base, hasCatch: true })).toBe(false);
    expect(echoSummonEligible({ ...base, submerged: true })).toBe(false);
    expect(echoSummonEligible({ ...base, summoned: true })).toBe(false);
  });

  it('holding E at the marker summons her — and only after the full hold', () => {
    const w = atTheMarker();
    const marker = echoMarkerFor(w)!;
    expect(atEchoMarker(w, marker)).toBe(true);

    w.intent.extract = true;
    // one tick short of the hold: still nothing in the water
    for (let i = 0; i < Math.floor(SUMMON_HOLD_SECONDS / DT) - 1; i++) updateMarensEcho(w, DT);
    expect(w.marensEcho.phase).toBe('idle');
    expect(w.tether.fights).toHaveLength(0);

    updateMarensEcho(w, DT);
    updateMarensEcho(w, DT);
    expect(w.marensEcho.phase).toBe('arrive');
    expect(w.tether.fights).toHaveLength(1);
    expect(w.marensEcho.summoned).toBe(true);
  });

  it('she cannot be summoned outside the Choir, or twice in one run', () => {
    const shallows = atTheMarker(SEED, 1);
    expect(summonHer(shallows, 3)).toBe(false);

    const township = atTheMarker(SEED, 3);
    expect(summonHer(township, 3)).toBe(false);

    const choir = atTheMarker();
    expect(summonHer(choir)).toBe(true);
    // her line ends, and the marker will not give her back this run: the latch
    // is `summoned`, and it outlives the phase.
    choir.marensEcho.phase = 'idle';
    choir.tether.fights.length = 0;
    expect(choir.marensEcho.summoned).toBe(true);
    choir.intent.extract = true;
    for (let i = 0; i < 300; i++) updateMarensEcho(choir, DT);
    choir.intent.extract = false;
    expect(choir.marensEcho.phase).toBe('idle');
    expect(choir.tether.fights).toHaveLength(0);
  });

  it('rowing away from the marker parks the hold at zero', () => {
    const w = atTheMarker();
    const marker = echoMarkerFor(w)!;
    w.intent.extract = true;
    updateMarensEcho(w, DT);
    expect(w.marensEcho.summonHeld).toBeGreaterThan(0);
    w.boat.x = marker.x + SUMMON_RANGE + 5;
    updateMarensEcho(w, DT);
    expect(w.marensEcho.summonHeld).toBe(0);
    expect(w.marensEcho.phase).toBe('idle');
  });
});

describe("maren's echo: the fight has no verbs", () => {
  it('the endpoints: you reel and can cut; she does neither', () => {
    const w = atTheMarker();
    summonHer(w);
    const cfg = echoFightConfig(w)!;
    expect(cfg.a).toBe('player');
    expect(cfg.b).toBe('enemy');
    expect(cfg.aReel).toBe('player-stance'); // the ONE verb in the fight
    expect(cfg.bReel).toBe('none'); // she never takes line
    expect(cfg.aCut).toBe('lure'); // walking away costs what walking away costs
    expect(cfg.bCut).toBe('none'); // she never lets go
    expect(cfg.tensionSource).toBe('proximity');
    expect(cfg.snapBehavior).toBe('free');

    const fight = w.tether.fights[0]!;
    expect(fight.L).toBe(HOLD_LENGTH);
    expect(fight.reelRate).toBe(ECHO_REEL_RATE);
    expect(fight.b.mass).toBe(ECHO_MASS);
    expect(fight.b.radius).toBe(ECHO_RADIUS);
    expect(fight.rider ?? null).toBeNull();
    expect(fight.aiReel ?? false).toBe(false); // nothing on her side ever reels
    expect(w.fish).toBeNull(); // she is NOT the catch slot
  });

  it('left alone she holds forever: no phase but `hold`, no tension, no cost', () => {
    const w = atTheMarker();
    summonHer(w);
    const witness = noCombatWitness(w);
    const stamina0 = w.player.stamina;
    const phases = new Set<string>();

    for (let i = 0; i < Math.ceil(90 / DT); i++) {
      tick(w);
      witness.check();
      phases.add(w.marensEcho.phase);
      expect(w.tether.fights).toHaveLength(1);
    }

    expect([...phases].sort()).toEqual(['arrive', 'hold']); // there is no third state
    expect(w.marensEcho.distance).toBeCloseTo(HOLD_LENGTH, 3);
    expect(w.tether.fights[0]!.tension).toBeCloseTo(0, 6);
    expect(w.player.stamina).toBe(stamina0); // holding costs nothing at all
    expect(w.run.ended).toBe(false);
    expect(witness.samples).toBeGreaterThan(5000);
  });

  it('she sways across the line and never closes or retreats an inch', () => {
    const w = atTheMarker();
    summonHer(w);
    let min = Infinity;
    let max = -Infinity;
    const bearings: number[] = [];
    for (let i = 0; i < Math.ceil(40 / DT); i++) {
      tick(w);
      const d = Math.hypot(w.marensEcho.x - w.boat.x, w.marensEcho.z - w.boat.z);
      min = Math.min(min, d);
      max = Math.max(max, d);
      bearings.push(Math.atan2(w.marensEcho.x - w.boat.x, w.marensEcho.z - w.boat.z));
    }
    expect(max - min).toBeLessThan(1e-6); // the distance NEVER changes on its own
    const spread = Math.max(...bearings) - Math.min(...bearings);
    expect(spread).toBeGreaterThan(SWAY_ARC); // …but the bearing does
    expect(spread).toBeLessThanOrEqual(2 * SWAY_ARC + 1e-9);
  });

  it('the mirror is sim state: the sway phase is a bounded, deterministic function', () => {
    expect(swayOffset(0)).toBeCloseTo(0, 9);
    expect(swayOffset(Math.PI / 2)).toBeCloseTo(SWAY_ARC, 9);
    expect(swayOffset(Math.PI * 1.5)).toBeCloseTo(-SWAY_ARC, 9);
    // a half cycle apart is what "mirrored by your own silhouette" costs
    for (let p = 0; p < 6; p += 0.37) {
      expect(swayOffset(p + Math.PI)).toBeCloseTo(-swayOffset(p), 9);
    }
  });

  it('the four sway lines arrive while you hold, in the bible\'s rotation', () => {
    const w = atTheMarker();
    summonHer(w);
    drainTownEvents();
    const seen: string[] = [];
    for (let i = 0; i < Math.ceil(SWAY_LINE_SECONDS * 4.5 / DT); i++) {
      tick(w);
      const m = w.township.pendingMoment;
      if (m && m.trigger === 'echoSway' && !seen.includes(m.text)) {
        seen.push(m.text);
        expect(m.faint).toBe(true); // the void is black; a loud toast would be the brightest thing on it
      }
    }
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen.slice(0, 4)).toEqual(ECHO_SWAY_LINES.map((l) => l.text));
    const evs = drainTownEvents().filter((e) => e.type === 'echo.sway');
    expect(evs.length).toBeGreaterThanOrEqual(4);
  });

  it('the choir dims while she holds, and only while she holds', () => {
    const w = atTheMarker();
    expect(choirDim(w.marensEcho)).toBe(1);
    summonHer(w);
    expect(choirDim(w.marensEcho)).toBeLessThan(1);
    w.marensEcho.phase = 'gone';
    expect(choirDim(w.marensEcho)).toBe(1);
    expect(choirDim(createMarensEchoState())).toBe(1);
  });
});

describe("maren's echo: proximity is the tension", () => {
  it('the curve: 0 at the length she holds at, 1 at the floor, monotone between', () => {
    const floor = ECHO_RADIUS;
    expect(echoTensionFraction(HOLD_LENGTH, floor)).toBeCloseTo(0, 9);
    expect(echoTensionFraction(floor, floor)).toBeCloseTo(1, 9);
    expect(echoTensionFraction(HOLD_LENGTH + 5, floor)).toBe(0); // clamped
    expect(echoTensionFraction(0, floor)).toBe(1);
    let prev = -1;
    for (let d = HOLD_LENGTH; d >= floor; d -= 0.25) {
      const t = echoTensionFraction(d, floor);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    // the LAND window opens high and still short of the ceiling — the decision
    expect(landWindowFraction(floor)).toBeGreaterThan(0.7);
    expect(landWindowFraction(floor)).toBeLessThan(1);
    expect(landEligibleAt(floor + LAND_MARGIN, floor)).toBe(true);
    expect(landEligibleAt(floor + LAND_MARGIN + 0.01, floor)).toBe(false);
  });

  it('reeling closes the distance and raises the tension; nothing else does', () => {
    const w = atTheMarker();
    summonHer(w);
    for (let i = 0; i < Math.ceil(ARRIVE_SECONDS / DT) + 2; i++) tick(w);
    const d0 = w.marensEcho.distance;
    const t0 = w.tether.fights[0]!.tension;

    w.intent.secondary = true;
    for (let i = 0; i < Math.ceil(2 / DT); i++) tick(w);
    w.intent.secondary = false;

    const fight = w.tether.fights[0]!;
    expect(w.marensEcho.distance).toBeLessThan(d0);
    // the reel moved L at HER rate, not the hand-line's
    expect(d0 - w.marensEcho.distance).toBeGreaterThan(ECHO_REEL_RATE * 1.5);
    expect(fight.tension).toBeGreaterThan(t0);
    expect(fight.tension).toBeCloseTo(
      echoTensionFraction(w.marensEcho.distance, w.marensEcho.floor) * w.line.tensionCeiling,
      6,
    );

    // …and letting go does not decay it: the tension IS the distance
    const held = fight.tension;
    for (let i = 0; i < Math.ceil(4 / DT); i++) tick(w);
    expect(w.tether.fights[0]!.tension).toBeCloseTo(held, 6);
  });

  it('the constraint keeps its ordinary tension dynamics for everyone else', () => {
    // The gated branch must be invisible to a plain M2 fight: taut gains,
    // slack decays, exactly as before.
    const w = createWorld(7);
    w.mode = 'foot';
    w.fish = createFish();
    const fight = startTetherFight(w, 'capsule', 'player')!;
    expect(fight.tensionSource).toBeUndefined();
    fight.L = 2;
    w.player.x = 0;
    w.player.z = 0;
    w.fish!.x = 0;
    w.fish!.z = 8; // way past L → taut
    updateTetherConstraint(w, DT);
    expect(fight.tension).toBeGreaterThan(0);
    const taut = fight.tension;
    fight.L = 40; // slack
    updateTetherConstraint(w, DT);
    expect(fight.tension).toBeLessThan(taut);
  });
});

describe("maren's echo: the stamina mirror", () => {
  it('the drain scales with tension and is paid only while reeling', () => {
    expect(mirrorDrain(0)).toBe(0);
    expect(mirrorDrain(1)).toBe(MIRROR_DRAIN_MAX);
    expect(mirrorDrain(0.5)).toBeCloseTo(MIRROR_DRAIN_MAX / 2, 9);
    expect(mirrorDrain(-3)).toBe(0);
    expect(mirrorDrain(9)).toBe(MIRROR_DRAIN_MAX);
  });

  it('reeling her costs MORE than an ordinary reel, and more the closer she gets', () => {
    const w = atTheMarker();
    summonHer(w);
    for (let i = 0; i < Math.ceil(ARRIVE_SECONDS / DT) + 2; i++) tick(w);

    // one second of reeling far out (low tension)
    const far0 = w.player.stamina;
    w.intent.secondary = true;
    for (let i = 0; i < Math.ceil(1 / DT); i++) tick(w);
    const farCost = far0 - w.player.stamina;

    // …and one second of reeling close in (high tension)
    w.player.stamina = w.player.maxStamina;
    w.tether.fights[0]!.L = w.marensEcho.floor + LAND_MARGIN + 0.4;
    tick(w);
    const near0 = w.player.stamina;
    for (let i = 0; i < Math.ceil(1 / DT); i++) tick(w);
    const nearCost = near0 - w.player.stamina;
    w.intent.secondary = false;

    expect(farCost).toBeGreaterThan(9); // the ordinary 10/s reel drain, at least
    expect(nearCost).toBeGreaterThan(farCost + 5); // …plus the mirror, and rising
    expect(nearCost).toBeLessThan(10 + MIRROR_DRAIN_MAX + 1);
  });

  it('an empty pool stops the reel — and takes nothing else with it', () => {
    const w = atTheMarker();
    summonHer(w);
    const witness = noCombatWitness(w);
    w.intent.secondary = true;
    let emptied = false;
    for (let i = 0; i < Math.ceil(30 / DT) && !emptied; i++) {
      tick(w);
      witness.check();
      if (w.player.stamina <= 0) emptied = true;
    }
    expect(emptied).toBe(true);
    const d = w.marensEcho.distance;
    // the reel gates itself off: nothing moves while the pool is empty
    for (let i = 0; i < 20; i++) {
      tick(w);
      witness.check();
    }
    expect(w.marensEcho.distance).toBeLessThanOrEqual(d + 1e-9);
    expect(w.player.hp).toBe(w.player.maxHp);
    expect(w.run.ended).toBe(false);
    w.intent.secondary = false;
  });
});

describe("maren's echo: the two endings of a fight with no failure state", () => {
  it('reeling PAST the land window snaps the line and she goes home — the run continues', () => {
    const w = atTheMarker();
    summonHer(w);
    const witness = noCombatWitness(w);
    const lure0 = w.lure.count;
    drainTownEvents();

    // reel through the window without ever pressing LAND
    const t = reel(w, (ww) => ww.marensEcho.phase === 'gone');
    expect(t).toBeGreaterThan(0);
    witness.check();

    expect(w.marensEcho.goneHome).toBe(true);
    expect(w.marensEcho.landed).toBe(false);
    expect(w.tether.fights).toHaveLength(0);
    expect(w.run.ended).toBe(false); // NOT a failure screen
    expect(w.player.hp).toBe(w.player.maxHp);
    expect(w.marensEcho.hp).toBe(createMarensEchoState().hp);
    expect(w.run.haul).toHaveLength(0);
    expect(w.run.truthSeen).toBe(false);
    expect(w.lure.count).toBe(Math.max(0, lure0 - 1)); // the ordinary cost of a parted line

    // the bible's snap line, verbatim, as a faint note
    const moment = w.township.pendingMoment!;
    expect(moment.text).toBe(ECHO_SNAP_LINE);
    expect(moment.text).toContain('Gone home.');
    expect(moment.faint).toBe(true);
    const evs = drainTownEvents().filter((e) => e.type === 'echo.goneHome');
    expect(evs).toHaveLength(1);
    expect((evs[0] as { cause: string }).cause).toBe('snap');
  });

  it('the full reel LANDS her: a clean catch, the Scale, and the truth', () => {
    const w = atTheMarker();
    summonHer(w);
    const witness = noCombatWitness(w);
    drainTownEvents();

    const reeled = reel(w, (ww) => {
      const f = ww.tether.fights[0];
      return !!f && f.land.eligible;
    });
    expect(reeled).toBeGreaterThan(0);
    witness.check();
    expect(w.marensEcho.tensionFraction).toBeGreaterThan(0.7);
    expect(w.tether.fights[0]!.tension).toBeLessThan(w.line.tensionCeiling);

    // TAKE HER — the same contextual verb every catch is landed with
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;
    witness.check();

    expect(w.marensEcho.landed).toBe(true);
    expect(w.marensEcho.phase).toBe('landing');
    expect(w.tether.fights).toHaveLength(0);

    // a REAL clean catch on the receipt, through the ordinary reducer
    expect(w.run.haul).toHaveLength(1);
    const rec = w.run.haul[0]!;
    expect(rec.clean).toBe(true);
    expect(rec.tier).toBe(4); // the Drowned band the receipt tops out at
    expect(rec.memories).toBeGreaterThan(0);
    expect(rec.species).toBe(speciesById(MARENS_ECHO_SPECIES_ID).name.toLowerCase());
    expect(w.run.activeCatch).toBeNull();

    // THE ECHO'S SCALE — named, guaranteed, and the only thing she drops
    const scales = w.run.inventory.filter((i) => i.id === ECHOS_SCALE.id);
    expect(scales).toHaveLength(1);
    expect(scales[0]!.name).toBe(ECHOS_SCALE.name);
    expect(scales[0]!.rarity).toBe('Drowned');
    expect(scales[0]!.effects[0]!.key).toBe('echos_scale');
    expect(w.run.inventory).toHaveLength(1); // no random sundry alongside her

    expect(w.run.truthSeen).toBe(true);
    const evs = drainTownEvents().filter((e) => e.type === 'echo.landed');
    expect(evs).toHaveLength(1);
  });

  it('the truth scene: three beats, advanced by the player, then the drop', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;

    tick(w); // the player lets the key up — the tap that took her is not a skip

    const t = w.marensEcho.truth;
    expect(t.active).toBe(true);
    expect(t.beat).toBe(0);

    const press = (): void => {
      w.intent.extract = true;
      tick(w);
      w.intent.extract = false;
      tick(w);
    };

    press();
    expect(t.beat).toBe(1);
    press();
    expect(t.beat).toBe(2);
    expect(t.active).toBe(true); // the third beat is not skipped past
    press();
    expect(t.active).toBe(false);
    expect(t.done).toBe(true);
    expect(w.marensEcho.phase).toBe('gone');

    // …and the trophy's own note closes the scene
    expect(w.township.pendingMoment!.text).toBe(ECHOS_SCALE.dropText);
    expect(w.run.ended).toBe(false); // credits into the run, not out of it
  });

  it('the press that TOOK her does not also skip her first word', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    w.intent.extract = true; // the same physical key, held down
    tick(w);
    for (let i = 0; i < 30; i++) tick(w); // still held
    expect(w.marensEcho.truth.active).toBe(true);
    expect(w.marensEcho.truth.beat).toBe(0);
    w.intent.acceptLand = false;
    w.intent.extract = false;
  });

  it('a HELD E does not skip the scene — each beat costs a press', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;

    tick(w); // the key comes up once…
    w.intent.extract = true;
    for (let i = 0; i < 200; i++) tick(w);
    expect(w.marensEcho.truth.active).toBe(true);
    expect(w.marensEcho.truth.beat).toBe(1); // …and then exactly one edge is pressed
  });

  it('hold F and she stays out there: the fight ends quietly, nothing is told', () => {
    const w = atTheMarker();
    summonHer(w);
    const witness = noCombatWitness(w);
    drainTownEvents();
    w.intent.cut = true;
    for (let i = 0; i < Math.ceil(1.2 / DT); i++) {
      tick(w);
      witness.check();
    }
    w.intent.cut = false;
    expect(w.tether.fights).toHaveLength(0);
    expect(w.marensEcho.goneHome).toBe(true);
    expect(w.marensEcho.landed).toBe(false);
    expect(w.run.truthSeen).toBe(false);
    expect(w.run.haul).toHaveLength(0);
    const evs = drainTownEvents().filter((e) => e.type === 'echo.goneHome');
    expect((evs[0] as { cause: string }).cause).toBe('cut');
  });
});

describe("maren's echo: THE NO-COMBAT CHECK (plan 05 §2.3 acceptance)", () => {
  it('no hp moves anywhere, in either ending, on any tick', () => {
    for (const ending of ['land', 'snap'] as const) {
      const w = atTheMarker();
      summonHer(w);
      const hp0 = w.player.hp;
      const echoHp0 = w.marensEcho.hp;
      let ticks = 0;
      const guard = (): void => {
        ticks++;
        expect(w.player.hp, `${ending}: keeper hp`).toBe(hp0);
        expect(w.marensEcho.hp, `${ending}: her hp`).toBe(echoHp0);
        expect(w.fish, `${ending}: there is no catch to butcher`).toBeNull();
      };
      const done = (ww: WorldState): boolean =>
        ending === 'snap'
          ? ww.marensEcho.phase === 'gone'
          : !!ww.tether.fights[0]?.land.eligible;
      let resting = false;
      for (let i = 0; i < Math.ceil(90 / DT); i++) {
        if (!resting && w.player.stamina <= 1) resting = true;
        if (resting && w.player.stamina >= w.player.maxStamina - 1) resting = false;
        w.intent.secondary = !resting;
        tick(w);
        guard();
        if (done(w)) break;
      }
      w.intent.secondary = false;
      if (ending === 'land') {
        w.intent.acceptLand = true;
        tick(w);
        guard();
        w.intent.acceptLand = false;
        for (let i = 0; i < 30; i++) {
          tick(w);
          guard();
        }
      }
      expect(ticks).toBeGreaterThan(200);
    }
  });

  it('gaff swings during the fight do nothing to her — there is nothing to hit', () => {
    const w = atTheMarker();
    summonHer(w);
    for (let i = 0; i < Math.ceil(ARRIVE_SECONDS / DT) + 2; i++) tick(w);
    const before = {
      hp: w.marensEcho.hp,
      x: w.marensEcho.x,
      z: w.marensEcho.z,
      phase: w.marensEcho.phase,
      distance: w.marensEcho.distance,
      fights: w.tether.fights.length,
    };

    // REAL swings, light and heavy, over and over — the same producer every
    // other encounter is hit through. Her hit box does not exist: she is not
    // world.fish and she owns no target id, so `world.combat.hits` never names
    // her and the swing completes over empty water.
    for (let i = 0; i < 12; i++) {
      w.intent.primary = true;
      tick(w);
      w.intent.primary = false;
      tick(w);
      // and the bluntest possible version: a hit event aimed at the CATCH slot,
      // which in her fight is nobody
      w.combat.hits.push({
        targetId: FISH_TARGET_ID,
        damage: 40,
        knockbackX: 0,
        knockbackZ: 0,
        stagger: HEAVY_STAGGER,
      });
      updateMarensEcho(w, DT);
      w.combat.hits.length = 0;
    }

    expect(w.marensEcho.hp).toBe(before.hp);
    expect(w.marensEcho.phase).toBe(before.phase);
    expect(w.tether.fights).toHaveLength(before.fights);
    expect(w.marensEcho.distance).toBeCloseTo(before.distance, 6);
    expect(w.player.hp).toBe(w.player.maxHp);
    expect(w.run.haul).toHaveLength(0); // no butcher, no landing, no record
  });

  it('her line parts the plain way whatever is on the reel (no Widow\'s Hair damage)', () => {
    const w = atTheMarker();
    w.line.snap = 'damagePlayer'; // Widow's Hair: 20 hp at the ceiling
    summonHer(w);
    const fight = w.tether.fights[0]!;
    expect(fight.snapBehavior).toBe('free'); // her fight overrides it, deliberately
    fight.L = w.marensEcho.floor;
    for (let i = 0; i < 8; i++) tick(w);
    expect(w.player.hp).toBe(w.player.maxHp);
    expect(w.marensEcho.goneHome).toBe(true);
  });
});

describe("maren's echo: the willing variant", () => {
  it('the thimble predicate matches the gimmick key, the pool name and the id', () => {
    expect(isMarensThimble('marens_thimble')).toBe(true);
    expect(isMarensThimble('marens-thimble')).toBe(true);
    expect(isMarensThimble("Maren's Thimble")).toBe(true);
    expect(isMarensThimble('basic-lure')).toBe(false);
    expect(isMarensThimble(null)).toBe(false);
  });

  it('landed on the thimble, the record turns into the worse one', () => {
    const w = atTheMarker();
    w.lure.id = 'marens_thimble';
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;

    expect(w.marensEcho.willing).toBe(true);
    const kinds = w.run.bestiaryEvents
      .filter((e) => e.speciesId === MARENS_ECHO_SPECIES_ID)
      .map((e) => e.event);
    expect(kinds).toContain('hooked');
    expect(kinds).toContain('clean');
    expect(kinds).toContain('willing');

    const folded = applyBestiaryEvents({}, w.run.bestiaryEvents);
    const entry = folded[MARENS_ECHO_SPECIES_ID]!;
    expect(entry.fought).toBe(true);
    expect(entry.cleanCatch).toBe(true);
    expect(entry.willing).toBe(true);

    const rec = bestiaryById(MARENS_ECHO_SPECIES_ID)!;
    expect(rec.entryWilling).toBeTruthy();
    expect(rec.entryWilling).not.toBe(rec.entryFought);
    expect(rec.entryWilling).toContain('the child fell asleep before the water touched the crib');
  });

  it('landed on anything else, the willing flag stays down', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;
    expect(w.marensEcho.willing).toBe(false);
    const folded = applyBestiaryEvents({}, w.run.bestiaryEvents);
    expect(folded[MARENS_ECHO_SPECIES_ID]!.willing).toBe(false);
  });

  it('the fold never invents a willing flag from the other three kinds', () => {
    const base = { 'marens-echo': emptyBestiary('marens-echo') };
    const out = applyBestiaryEvents(base, [
      { speciesId: 'marens-echo', event: 'hooked' },
      { speciesId: 'marens-echo', event: 'clean' },
      { speciesId: 'marens-echo', event: 'butchered' },
    ]);
    expect(out['marens-echo']!.willing).toBe(false);
  });
});

describe("maren's echo: truthSeen survives the run", () => {
  it('rides the RunResult onto metaState, is latched, and reloads', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => !!ww.tether.fights[0]?.land.eligible);
    w.intent.acceptLand = true;
    tick(w);
    w.intent.acceptLand = false;

    const result = buildRunResult(w, true);
    expect(result.truthSeen).toBe(true);
    expect(RunResultSchema.parse(result).truthSeen).toBe(true);

    const save = applyRunResult(freshSave(), result);
    expect(save.metaState.truthSeen).toBe(true);
    const reloaded = migrate(JSON.parse(JSON.stringify(save)));
    expect(reloaded.metaState.truthSeen).toBe(true);

    // LATCHED: a later run that never met her cannot un-tell you
    const plain = { ...result, truthSeen: false };
    expect(applyRunResult(save, plain).metaState.truthSeen).toBe(true);

    // and a fresh save has never heard it
    expect(freshMetaState().truthSeen).toBe(false);
    expect(MetaStateSchema.parse({}).truthSeen).toBe(false);
  });

  it('a run that snapped her line tells the save nothing', () => {
    const w = atTheMarker();
    summonHer(w);
    reel(w, (ww) => ww.marensEcho.phase === 'gone');
    const result = buildRunResult(w, true);
    expect(result.truthSeen).toBe(false);
    expect(applyRunResult(freshSave(), result).metaState.truthSeen).toBe(false);
  });

  it('a legacy save with no truthSeen loads with the keeper still not knowing', () => {
    const legacy = {
      buildings: {},
      memories: 12,
      notesRead: [],
      decants: 0,
      damKeyUsed: false,
      breadcrumbs: [],
      endingsSeen: {},
      nplus: false,
    };
    expect(MetaStateSchema.parse(legacy).truthSeen).toBe(false);
  });
});

describe("maren's echo: the copy is the bible's, verbatim", () => {
  it('four sway lines, inside the audit, in order', () => {
    expect(ECHO_SWAY_LINES).toHaveLength(4);
    for (const l of ECHO_SWAY_LINES) {
      expect(l.text.length).toBeLessThanOrEqual(SWAY_LINE_MAX_CHARS);
      expect(l.id).toMatch(/^sway_state_0\d$/);
    }
    expect(ECHO_SWAY_LINES[0]!.text).toBe(
      'It sways with the slow pulse of the basin, mirroring the rise and fall of your shoulders.',
    );
    expect(ECHO_SWAY_LINES[3]!.text).toBe(
      'No struggle on the cord. If you do not reel, both of you will stand here until the oil burns dry.',
    );
    // the rotation cycles rather than running out
    expect(echoSwayLineAt(4)).toEqual(ECHO_SWAY_LINES[0]);
    expect(echoSwayLineAt(7)).toEqual(ECHO_SWAY_LINES[3]);
  });

  it('three truth beats, each strictly under sixty words, in the right order', () => {
    expect(TRUTH_SCENE).toHaveLength(3);
    expect(TRUTH_SCENE.map((b) => b.theme)).toEqual(['the_warden', 'the_shocked', 'the_willing']);
    for (const b of TRUTH_SCENE) {
      expect(b.text.trim().split(/\s+/).length).toBeLessThan(TRUTH_BEAT_MAX_WORDS);
    }
    expect(TRUTH_SCENE[0]!.text).toContain('It is a warden');
    expect(TRUTH_SCENE[1]!.text).toContain('they pity the man who cannot stop pulling');
    expect(TRUTH_SCENE[2]!.text).toContain('they are not waiting to be retrieved');
  });

  it('the summon marker, the snap line and the Scale', () => {
    expect(ECHO_SUMMON_TEXT).toContain('wrapped in drenched white linen');
    expect(ECHO_SNAP_LINE).toContain('unhooked and at peace');
    expect(ECHOS_SCALE.id).toBe('echos-scale');
    expect(ECHOS_SCALE.flavorHeader).toBe('EXHIBIT 4-E: RESIDUAL CASTING');
    expect(ECHOS_SCALE.dropText).toContain('14 Willow Street');
  });

  it('her bestiary record is the bible\'s, with both entries', () => {
    const rec = bestiaryById('marens-echo')!;
    expect(rec.name).toBe("Maren's Echo");
    expect(rec.zone).toBe(4);
    expect(rec.rarity).toBe('Boss');
    expect(rec.category).toBe('boss');
    expect(rec.silhouette).toContain('facing away from the boat');
    expect(rec.entryFought).toContain('it mirrors the exhaustion in your wrists');
  });

  it('her preset is the one species with no mouth, no eyes and no pull', () => {
    const sp = speciesById(MARENS_ECHO_SPECIES_ID);
    expect(sp.eyeCount).toBe(0);
    expect(sp.jawSplit).toBe(0);
    expect(sp.stats.pullForce).toBe(0);
    expect(sp.stats.swimSpeed).toBe(0);
    expect(sp.patterns).toEqual({ orbit: 1, lunge: 0, dive: 0, drag: 0 });
    expect(sp.humanRatio).toBeGreaterThan(0.9);
  });
});

describe("maren's echo: the rest of the game is untouched", () => {
  it('her system is a no-op outside the Choir', () => {
    for (const zone of [1, 2, 3]) {
      const w = atTheMarker(SEED, zone);
      const before = JSON.stringify(w.marensEcho);
      w.intent.extract = true;
      for (let i = 0; i < 300; i++) tick(w);
      w.intent.extract = false;
      expect(w.marensEcho.phase).toBe('idle');
      expect(w.tether.fights).toHaveLength(0);
      // only the marker readout is filled in — no state, no fight, no events
      const after = { ...w.marensEcho, marker: JSON.parse(before).marker };
      expect(JSON.stringify(after)).toBe(before);
    }
  });

  it('an ordinary fight still snaps, cuts and lands exactly as it always did', () => {
    const w = createWorld(11);
    w.mode = 'foot';
    w.fish = createFish();
    const fight = startTetherFight(w, 'capsule', 'player')!;
    expect(fight.tensionSource).toBeUndefined();
    expect(fight.a.anchor).toEqual({ kind: 'entity', entityId: PLAYER_ENTITY });
    expect(fight.b.anchor).toEqual({ kind: 'entity', entityId: FISH_ENTITY });
    // the ordinary land path: exhausted + inside 2 m
    w.fish!.stamina = 0;
    w.fish!.x = w.player.x + 1;
    w.fish!.z = w.player.z;
    updateTetherConstraint(w, DT);
    expect(fight.land.eligible).toBe(true);
    w.intent.acceptLand = true;
    updateTetherConstraint(w, DT);
    expect(w.tetherEvents.some((e) => e.type === 'landed')).toBe(true);
  });
});
