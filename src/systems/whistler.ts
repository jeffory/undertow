// THE WHISTLER (systems) — the driver half of the Choir's roaming elite, plan
// 05 §2.3. Runs in its own sim slot AFTER `combat` (so this tick's gaff hits are
// what open the cut window) and BEFORE the run reducer and the run terminal —
// the same two constraints the Congregation, the Snatcher and the Postmaster
// slots were placed under, for the same reasons.
//
// What it does, in the task's order:
//   1. THE SPAWN — deep-night, in the Choir, at Dread ≥ 60, once per run. It
//      enters the water SPAWN_DIST out on a seeded bearing.
//   2. THE ROAM — it circles inward on seeded wander legs, and every tick its
//      position is CLAMPED back outside the lantern disc. It is not "unlikely to
//      be seen". It cannot be seen.
//   3. THE BANDS — three escalating proximity rings, fired monotonically and in
//      order, as `whistler.heard` events (the audio worker's cue) and as faint
//      parchment toasts carrying choir.md's three dread lines.
//   4. THE STRIKE — at the innermost band, with the keeper's hands free, it
//      commits: it closes (the one moment the clamp is off) and sets its line.
//      That line is the POSTMASTER'S REVERSE CONFIGURATION, unchanged — see
//      bosses/postmaster.ts for the essay on why that alone is the whole thing.
//   5. THE HAUL — rest → haul → rest, every haul routed at a DEEP STATION: the
//      bearing that puts the most water between the keeper and every islet.
//   6. THE ESCAPE — two landed gaffs knock its grip off; hold E in reach cuts
//      its line. It costs nothing: it is not your line and not your lure.
//   7. ITS WIN — it delivers you to the water and lets go. It does NOT kill:
//      `water.lethal` is never set here, and the delivery leaves the keeper
//      ADRIFT (game/waterPhase.ts) — in the deep, in the dark, with a swim home.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import type { TetherFight } from '../game/tether';
import { PLAYER_ENTITY, WHISTLER_ENTITY, startTetherFight, BOAT_MASS_DEFAULT, BOAT_RADIUS_DEFAULT } from '../game/tether';
import { createRng, LOOT } from '../core/rngStreams';
import { currentPhase, currentDreadMult } from '../run/reducer';
import { applyDreadGain, landGainByTier, tierFor } from '../game/dread';
import { generateFishParams } from '../gen/fishParams';
import { speciesById, WHISTLER_SPECIES_ID } from '../data/species';
import { recordBestiary } from '../bestiary/bestiary';
import { emitTownEvent } from '../meta/townEvents';
import { lanternOrigin, lanternRadius } from '../game/darkness';
import { SWAMP_OCCUPIED_TIER } from '../boat/boatCombat';
import { BREATH_MAX } from '../game/waterPhase';
import { enterWaterPhase } from '../game/tether';
import {
  CHOIR_TITLE,
  WHISTLER_TITLE,
  CHOIR_STAMP,
  bandMoment,
  choirTextFor,
  type ChoirMoment,
} from '../content/choirLines';
import {
  CLOSE_PER_LEG,
  CUT_HOLD_SECONDS,
  CUT_REACH,
  DEEP_OVERSHOOT,
  DELIVER_DREAD_GAIN,
  DRAG_SECONDS,
  FINAL_BAND,
  GAFF_POOL,
  LINE_LENGTH,
  PAYOUT_RATE,
  REST_SECONDS,
  ROAM_MARGIN,
  ROAM_SPEED,
  SOUND_SECONDS,
  SPAWN_DIST,
  STRIKE_RANGE,
  STRIKE_SECONDS,
  STRIKE_SPEED,
  WANDER_PERIOD,
  WHISTLER_LINE_ID,
  WHISTLER_MASS,
  WHISTLER_RADIUS,
  WHISTLER_REEL_RATE,
  WHISTLER_TARGET_ID,
  bandFor,
  clampOutsideDisc,
  deepStation,
  nearestLandmarkDistance,
  rollSpawnBearing,
  rollWanderBearing,
  swimToward,
  whistlerFighting,
  whistlerGaffCost,
  whistlerRng,
  whistlerSpawnEligible,
  type Landmark,
} from '../enemies/whistler';

// Salt for its LOOT draw (the rig). Its BEHAVIOUR rides the AI-shaped stream in
// enemies/whistler.ts; its BODY rides the loot stream like every other rig.
const WHISTLER_LOOT_SALT = 0x574c4c54; // 'WLLT'

/**
 * m — how far from every islet counts as "the deep". The delivery is not
 * complete until the keeper is at least this far from anything they could
 * stand on: being pulled off a rock is not the point, being a long way from
 * one is.
 */
export const DEEP_CLEARANCE = 24;

/** Hauls it must land before it will take an ABOARD keeper over the side. */
export const BOAT_DELIVER_HAULS = 2;

// --- the arena ---------------------------------------------------------------------
//
// There is no arena. That is the difference between this and the Postmaster: it
// happens wherever you are. What the open water DOES supply is the land the
// route has to steer away from.

/** Every islet centre in the current lake — what a deep station steers away from. */
export function landmarks(world: WorldState): Landmark[] {
  const lake = world.lake;
  if (!lake) return [];
  return lake.islets.map((i) => ({ x: i.center.x, z: i.center.z }));
}

/** The body the keeper is IN: the hull aboard, the keeper on foot. */
export function keeperPoint(world: WorldState): { x: number; z: number } {
  return world.mode === 'boat'
    ? { x: world.boat.x, z: world.boat.z }
    : { x: world.player.x, z: world.player.z };
}

/** Which anchor a strike would use. The one branch the two modes cost. */
export function strikeAnchor(world: WorldState): 'player' | 'boat' {
  return world.mode === 'boat' ? 'boat' : 'player';
}

// --- the toasts ---------------------------------------------------------------------
//
// ONE presentation seam. The sim names a MOMENT; content/choirLines.ts owns the
// words, so the copy pass (docs/story/choir.md, still unwritten) is a data swap.
// They are FAINT: in a zone whose whole look is black, a full-strength toast
// would be the brightest object on screen.

function toast(world: WorldState, moment: ChoirMoment, title: string): void {
  const text = choirTextFor(moment);
  if (!text) return;
  world.township.pendingMoment = {
    trigger: moment,
    title,
    text,
    stamp: CHOIR_STAMP,
    faint: true,
  };
}

// --- 1. THE SPAWN ---------------------------------------------------------------------

function spawn(world: WorldState): void {
  const s = world.whistler;
  const rng = whistlerRng(world.seed, 0);
  const bearing = rollSpawnBearing(rng);
  const at = keeperPoint(world);

  s.x = at.x + Math.cos(bearing) * SPAWN_DIST;
  s.z = at.z + Math.sin(bearing) * SPAWN_DIST;
  s.facing = Math.atan2(at.x - s.x, at.z - s.z);
  s.speed = 0;

  // THE BODY comes off the ordinary fish pipeline — a species preset through the
  // same generator every catch is built with. No new asset, no new mesh path.
  // It is NOT world.fish: a reverse fight has no catch (see WHISTLER_ENTITY).
  const loot = createRng(world.seed, LOOT, WHISTLER_LOOT_SALT);
  s.params = generateFishParams(speciesById(WHISTLER_SPECIES_ID), loot, {
    zone: world.run.zone,
  });

  s.phase = 'roam';
  s.spawned = true;
  s.wanderTimer = 0;
  s.wanderAngle = bearing;
  s.wanderRing = SPAWN_DIST;
  s.legs = 0;
  s.band = 0;
  s.bandDistance = SPAWN_DIST;
  s.drags = 0;
  s.gaffHp = GAFF_POOL;
  s.gaffHits = 0;
  s.cutHeld = 0;
  s.cut = false;
  s.delivered = false;
  s.reeling = false;
}

// --- 2/3. THE ROAM AND THE BANDS --------------------------------------------------------

function roam(world: WorldState, dt: number): void {
  const s = world.whistler;
  const keeper = keeperPoint(world);

  // A wander LEG: a bearing and a ring radius, rolled from its own seed stream.
  // Each leg holds a slightly tighter ring than the last, so an unanswered
  // Whistler closes — the pressure is a clock, not a coin.
  s.wanderTimer -= dt;
  if (s.wanderTimer <= 0) {
    s.legs++;
    s.wanderTimer = WANDER_PERIOD;
    s.wanderAngle = rollWanderBearing(whistlerRng(world.seed, s.legs));
    s.wanderRing = Math.max(discFloor(world), s.wanderRing - CLOSE_PER_LEG);
  }

  // Where this leg wants to be: on the leg's bearing, at the leg's ring.
  const target = {
    x: keeper.x + Math.cos(s.wanderAngle) * s.wanderRing,
    z: keeper.z + Math.sin(s.wanderAngle) * s.wanderRing,
  };
  const step = swimToward({ x: s.x, z: s.z }, target, ROAM_SPEED, dt);
  s.x = step.x;
  s.z = step.z;
  if (step.moved > 1e-6) s.facing = step.facing;
  s.speed = step.moved / Math.max(dt, 1e-9);

  // THE CLAMP. Whatever the wander wanted, it is put back outside the light.
  // Read off game/darkness.ts's ONE radius function, so a Chandlery bow lantern
  // widens the exclusion ring by the same metre it widens the pool.
  const at = lanternOrigin(world);
  const held = clampOutsideDisc(s.x, s.z, at.x, at.z, discFloor(world));
  s.x = held.x;
  s.z = held.z;
}

/** m — the ring the roam is never allowed inside: the disc plus its margin. */
function discFloor(world: WorldState): number {
  return lanternRadius(world) + ROAM_MARGIN;
}

function stepBands(world: WorldState): void {
  const s = world.whistler;
  const keeper = keeperPoint(world);
  const dist = Math.hypot(s.x - keeper.x, s.z - keeper.z);
  const want = bandFor(dist, discFloor(world));
  // MONOTONIC, ONE AT A TIME. A band never re-fires, and band 2 can never be the
  // first thing you hear — even if it crossed two rings inside one tick.
  if (want <= s.band) return;
  const band = s.band + 1;
  s.band = band;
  s.bandDistance = dist;
  emitTownEvent({ type: 'whistler.heard', zone: world.run.zone, band, distance: dist });
  const moment = bandMoment(band);
  if (moment) toast(world, moment, WHISTLER_TITLE);
}

// --- 4. THE STRIKE ----------------------------------------------------------------------

/** Hands free: no line already out, not already in the water. */
function handsFree(world: WorldState): boolean {
  return world.tether.fights.length === 0 && !world.water.active;
}

function hook(world: WorldState): void {
  const s = world.whistler;
  const anchor = strikeAnchor(world);

  // THE REVERSE HOOK-SET, second use. Identical configuration to the Postmaster
  // (bosses/postmaster.ts): the elite is the A end and owns the line, the keeper
  // is the B end and owns nothing. The only difference is WHICH BODY the B end
  // is — the hull aboard, the keeper on foot — which is one object literal.
  const fight = startTetherFight(world, WHISTLER_SPECIES_ID, anchor, {
    a: {
      anchor: { kind: 'entity', entityId: WHISTLER_ENTITY },
      owner: 'enemy',
      mass: WHISTLER_MASS,
      radius: WHISTLER_RADIUS,
      reel: { kind: 'ai' },
      cut: { kind: 'contextual' },
    },
    b:
      anchor === 'boat'
        ? {
            anchor: { kind: 'boat' },
            owner: 'player',
            mass: BOAT_MASS_DEFAULT,
            radius: BOAT_RADIUS_DEFAULT,
            reel: { kind: 'none' },
            cut: { kind: 'none' },
          }
        : {
            anchor: { kind: 'entity', entityId: PLAYER_ENTITY },
            owner: 'player',
            mass: 1,
            radius: world.player.radius,
            reel: { kind: 'none' },
            cut: { kind: 'none' },
          },
    L: LINE_LENGTH,
    reelRate: WHISTLER_REEL_RATE,
    snapBehavior: 'hold',
  });
  if (!fight) return;

  s.fightId = fight.id;
  s.gaffHp = GAFF_POOL;
  s.cutHeld = 0;
  enterRest(world);

  recordBestiary(world, WHISTLER_SPECIES_ID, 'hooked');
  toast(world, 'hooked', CHOIR_TITLE);
  emitTownEvent({
    type: 'whistler.hooked',
    zone: world.run.zone,
    fightId: fight.id,
    anchor,
  });
}

// --- 5. THE HAUL --------------------------------------------------------------------------

function enterRest(world: WorldState): void {
  const s = world.whistler;
  s.phase = 'drag';
  s.timer = REST_SECONDS;
  s.reeling = false;
}

function enterHaul(world: WorldState, fight: TetherFight): void {
  const s = world.whistler;
  s.timer = DRAG_SECONDS;
  s.reeling = true;
  s.drags++;
  // THE DEEP STATION: not "away from me", but "away from LAND". Of a fixed fan of
  // bearings out of where the keeper is now, the one whose station has the most
  // open water around it. A haul can therefore never conveniently beach you.
  const from = keeperPoint(world);
  const station = deepStation(from.x, from.z, landmarks(world), DEEP_OVERSHOOT);
  s.routeX = station.x;
  s.routeZ = station.z;
  // Take up the slack first, exactly as the Postmaster's delivery does: without
  // this the haul spends most of its 3.2 s winding in line that was hanging
  // loose after the last payout, and the pull lands as a shrug.
  const d = Math.hypot(s.x - from.x, s.z - from.z);
  fight.L = Math.min(fight.L, Math.max(WHISTLER_RADIUS, d));
}

function stagger(world: WorldState): void {
  const s = world.whistler;
  s.phase = 'staggered';
  s.timer = 3.5;
  s.reeling = false;
  s.cutHeld = 0;
  s.speed = 0;
}

// --- the ends -------------------------------------------------------------------------------

function endFight(world: WorldState): number {
  const s = world.whistler;
  const idx = world.tether.fights.findIndex((f) => f.id === s.fightId);
  if (idx >= 0) world.tether.fights.splice(idx, 1);
  const id = s.fightId;
  s.fightId = -1;
  s.reeling = false;
  return id;
}

function sound(world: WorldState): void {
  const s = world.whistler;
  s.phase = 'sounding';
  s.fightId = -1;
  s.reeling = false;
  s.timer = SOUND_SECONDS;
  s.speed = 0;
  s.cutHeld = 0;
}

// THE ESCAPE — "close-range contextual action" again. It costs nothing, because
// nothing here is yours: not the line, not the lure, not the hook.
function cutItsLine(world: WorldState): void {
  const s = world.whistler;
  const fightId = endFight(world);

  world.tetherEvents.push({
    type: 'cut',
    fightId,
    lineId: WHISTLER_LINE_ID,
    cost: 'contextual',
  });
  world.tetherEvents.push({ type: 'bossLineCut' });

  recordBestiary(world, WHISTLER_SPECIES_ID, 'butchered');
  world.dread = applyDreadGain(world.dread, landGainByTier(4), currentDreadMult(world));
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  toast(world, 'escaped', CHOIR_TITLE);
  emitTownEvent({
    type: 'whistler.cut',
    zone: world.run.zone,
    fightId,
    drags: s.drags,
    gaffHits: s.gaffHits,
  });

  s.cut = true;
  sound(world);
}

/**
 * ITS WIN. "It does NOT kill outright — it delivers you to the water."
 *
 * So: no `water.lethal`, no hp write, no run end. The keeper is left ADRIFT in
 * the deep — the extended water phase game/waterPhase.ts has run since 03 §6.1,
 * minus the swamp's lethality and minus its sinking haul. The exit is a walkable
 * shore, and in the Choir, in the black, at Dread 75+, the swim home IS the
 * punishment. `occupied` is the existing swamp rule: dread tier ≥ 3.
 */
function deliver(world: WorldState): void {
  const s = world.whistler;
  const fightId = endFight(world);
  const occupied = tierFor(world.dread) >= SWAMP_OCCUPIED_TIER;

  // Aboard, it has to take you over the side first. The hull stays where it is —
  // it is not swamped, and B near the boat still boards it. The keeper is simply
  // no longer in it.
  if (!world.water.active) {
    world.mode = 'foot';
    world.player.x = world.boat.x;
    world.player.z = world.boat.z;
    world.player.vx = 0;
    world.player.vz = 0;
    enterWaterPhase(world, { breathSec: BREATH_MAX, occupied });
    world.tetherEvents.push({ type: 'pulledUnder', breathSec: BREATH_MAX, occupied });
  }
  // Not docked to anything any more, and adrift: the fight is over but the water
  // does not simply hand the keeper back to the rock they were standing on.
  world.dockedIslet = null;
  world.water.adrift = true;
  world.water.lethal = false; // it is not a drowning. It is a delivery.
  world.water.breath = BREATH_MAX;
  world.water.breathMax = BREATH_MAX;
  world.ui.underwater = true;

  world.tetherEvents.push({ type: 'delivered', by: 'whistler' });
  world.run.deliveredBy = 'whistler';
  world.dread = applyDreadGain(world.dread, DELIVER_DREAD_GAIN, currentDreadMult(world));
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  toast(world, 'delivered', CHOIR_TITLE);
  emitTownEvent({
    type: 'whistler.delivered',
    zone: world.run.zone,
    fightId,
    drags: s.drags,
    occupied,
  });

  s.delivered = true;
  sound(world);
}

/**
 * Is the delivery complete? The keeper is in the water AND a long way from
 * anything they could stand on. One predicate, both modes — aboard, the "in the
 * water" half is what the Whistler itself supplies when the hull reaches the
 * deep (see the haul loop).
 */
export function deliveryReady(world: WorldState): boolean {
  if (!world.water.active) return false;
  const land = landmarks(world);
  if (land.length === 0) return true;
  return nearestLandmarkDistance(world.player.x, world.player.z, land) >= DEEP_CLEARANCE;
}

/** Aboard: has the haul dragged the hull out into the deep yet? */
function hullInTheDeep(world: WorldState): boolean {
  const land = landmarks(world);
  if (land.length === 0) return true;
  return nearestLandmarkDistance(world.boat.x, world.boat.z, land) >= DEEP_CLEARANCE;
}

// --- the system ---------------------------------------------------------------------------

export function updateWhistler(world: WorldState, dt: number): void {
  const s = world.whistler;

  // It goes down without a sound. No line, no fight — just a length of something
  // leaving.
  if (s.phase === 'sounding') {
    s.timer -= dt;
    s.speed = 0;
    if (s.timer <= 0) {
      s.phase = 'gone';
      s.params = null;
    }
    return;
  }
  if (s.phase === 'gone') return;

  // --- 1. THE SPAWN -----------------------------------------------------------------
  if (s.phase === 'idle') {
    const eligible = whistlerSpawnEligible({
      zone: world.run.zone,
      phase: currentPhase(world),
      dread: world.dread,
      spawned: s.spawned,
    });
    if (eligible) spawn(world);
    return;
  }

  // --- 2/3. THE ROAM AND ITS BANDS --------------------------------------------------
  if (s.phase === 'roam') {
    roam(world, dt);
    stepBands(world);
    // At the innermost band it commits — but only with the keeper's hands free.
    // Otherwise it holds at the ring and keeps whistling: it is patient, and a
    // second line in the water is not a fight this round is prepared to resolve.
    if (s.band >= FINAL_BAND && handsFree(world)) {
      s.phase = 'strike';
      s.timer = STRIKE_SECONDS;
    }
    return;
  }

  // --- 4. THE STRIKE ------------------------------------------------------------------
  // The one moment the clamp is off. It closes at STRIKE_SPEED, and either the
  // timer runs out or it reaches STRIKE_RANGE — whichever happens first.
  if (s.phase === 'strike') {
    const keeper = keeperPoint(world);
    const step = swimToward({ x: s.x, z: s.z }, keeper, STRIKE_SPEED, dt);
    s.x = step.x;
    s.z = step.z;
    if (step.moved > 1e-6) s.facing = step.facing;
    s.speed = step.moved / Math.max(dt, 1e-9);
    s.timer -= dt;
    const dist = Math.hypot(s.x - keeper.x, s.z - keeper.z);
    if (dist <= STRIKE_RANGE || s.timer <= 0) {
      if (handsFree(world)) hook(world);
      else {
        // Hands filled during the approach. It backs off to the ring and waits.
        s.phase = 'roam';
        s.wanderTimer = 0;
      }
    }
    return;
  }

  // --- the live fight -------------------------------------------------------------------
  const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
  if (!fight) {
    // The line is gone and it was not cut here — a run reset or a teardown.
    // Leave without comment.
    sound(world);
    return;
  }

  // --- THE GAFF — this tick's fresh hits, the same array combat refills ---------------
  for (const hit of world.combat.hits) {
    if (hit.targetId !== WHISTLER_TARGET_ID) continue;
    s.gaffHits++;
    s.gaffHp -= whistlerGaffCost(hit.stagger);
  }
  if (s.gaffHp <= 0 && s.phase !== 'staggered') stagger(world);

  // --- 6. THE CUT ----------------------------------------------------------------------
  if (s.phase === 'staggered') {
    const at = keeperPoint(world);
    const inReach = Math.hypot(at.x - s.x, at.z - s.z) <= CUT_REACH;
    if (inReach && world.intent.extract) {
      s.cutHeld += dt;
      if (s.cutHeld >= CUT_HOLD_SECONDS) {
        cutItsLine(world);
        return;
      }
    } else {
      s.cutHeld = 0;
    }
    s.timer -= dt;
    if (s.timer <= 0) {
      // It gets its grip back. The window closed; the pool refills; the haul
      // resumes. Nothing you landed is refunded to it but the grip.
      s.gaffHp = GAFF_POOL;
      s.cutHeld = 0;
      enterRest(world);
    }
    fight.aiReel = s.reeling;
    return;
  }

  // --- 7. THE DELIVERY -------------------------------------------------------------------
  if (deliveryReady(world)) {
    deliver(world);
    return;
  }

  // --- 5. THE HAUL LOOP --------------------------------------------------------------------
  s.timer -= dt;
  const target = s.reeling ? { x: s.routeX, z: s.routeZ } : farSide(world);
  const step = swimToward({ x: s.x, z: s.z }, target, ROAM_SPEED, dt);
  s.x = step.x;
  s.z = step.z;
  if (step.moved > 1e-6) s.facing = step.facing;
  s.speed = step.moved / Math.max(dt, 1e-9);

  if (!s.reeling) {
    // It pays line back out between hauls — you are RETURNED, then taken again.
    fight.L = Math.min(LINE_LENGTH, fight.L + PAYOUT_RATE * dt);
    if (s.timer <= 0) enterHaul(world, fight);
  } else if (s.timer <= 0) {
    // A haul has finished. Aboard, once it has landed BOAT_DELIVER_HAULS of them
    // AND the hull is out in the deep, it takes the keeper over the side — which
    // is the "in the water" half of `deliveryReady` that a boat cannot supply on
    // its own (the ordinary water-phase trigger is foot-only, by design).
    if (
      world.mode === 'boat' &&
      s.drags >= BOAT_DELIVER_HAULS &&
      hullInTheDeep(world)
    ) {
      deliver(world);
      return;
    }
    enterRest(world);
  }

  // The one write into the constraint: whether it is taking line this tick.
  fight.aiReel = s.reeling;
}

/** Where it holds between hauls: on the far side of the keeper, out at the rim. */
function farSide(world: WorldState): { x: number; z: number } {
  const s = world.whistler;
  const at = keeperPoint(world);
  const dx = s.x - at.x;
  const dz = s.z - at.z;
  const len = Math.hypot(dx, dz) || 1;
  const hold = LINE_LENGTH * 0.75;
  return { x: at.x + (dx / len) * hold, z: at.z + (dz / len) * hold };
}

/** Test/probe seam: is the reverse fight live, and is it configured reversed? */
export function whistlerFightConfig(
  world: WorldState,
): { a: string; b: string; aReel: string; bReel: string; aCut: string; bCut: string; anchor: string } | null {
  const s = world.whistler;
  if (!whistlerFighting(s)) return null;
  const fight = world.tether.fights.find((f) => f.id === s.fightId);
  if (!fight) return null;
  return {
    a: fight.a.owner,
    b: fight.b.owner,
    aReel: fight.a.reel.kind,
    bReel: fight.b.reel.kind,
    aCut: fight.a.cut.kind,
    bCut: fight.b.cut.kind,
    anchor: fight.anchor,
  };
}
