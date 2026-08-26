// MAREN'S ECHO (systems) — the driver half of the Choir boss, plan 05 §2.3.
// Runs in its own sim slot AFTER `combat` and BEFORE the run reducer, the same
// two constraints the Congregation, the Snatcher, the Postmaster and the
// Whistler slots were placed under. Here the first one is a formality — nothing
// this system reads can be hit — and the second is load-bearing: the LAND she
// ends on is folded by the reducer into a real clean catch in the same tick.
//
// What it does, in the plan's order:
//   1. THE MARKER — the deepest water in the Choir. Hold E and she is there.
//   2. THE HOOK-SET — one ORDINARY TetherFight, with `tensionSource:
//      'proximity'` as its only unusual field. You are the A end and you reel;
//      she is the B end and does nothing at all.
//   3. THE HOLD — she hangs at L on a slowly swaying bearing, facing away, and
//      mirrors the keeper's own sway a half-cycle out of phase. Every few
//      seconds of NOT reeling, she says one of the bible's four sway lines.
//   4. THE REEL — the only verb in the fight. RMB shortens L; the separation
//      drops; the proximity curve writes tension; tension drains stamina on top
//      of the ordinary reel drain. Nothing else in the encounter moves.
//   5. THE DECISION — inside LAND_MARGIN of the L floor the LAND prompt arms.
//      Take her → the truth scene, the Echo's Scale, the bestiary entry, and a
//      `truthSeen` that outlives the run. Keep reeling → tension reaches the
//      ceiling at the floor, the line parts through the ordinary snap path, and
//      she goes home. Walk away (hold F) → the fight ends quietly.
//
// THERE IS NO OTHER BRANCH. No timers that hurt you, no hp, no gaff target, no
// hostile verb of any kind. Search this file for `hp` and the only hit is the
// no-combat assertion's read-only witness.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import {
  BOAT_MASS_DEFAULT,
  BOAT_RADIUS_DEFAULT,
  MARENS_ECHO_ENTITY,
  PLAYER_ENTITY,
  startTetherFight,
} from '../game/tether';
import { STAMINA_DELAY } from '../game/stamina';
import { createRng, LOOT } from '../core/rngStreams';
import { generateFishParams } from '../gen/fishParams';
import { speciesById, MARENS_ECHO_SPECIES_ID } from '../data/species';
import { recordBestiary } from '../bestiary/bestiary';
import { namedDrownedUnique } from '../loot/roller';
import { emitTownEvent } from '../meta/townEvents';
import { keeperPoint, landmarks } from './whistler';
import {
  CHOIR_STAMP,
  ECHOS_SCALE,
  ECHO_SNAP_HEADER,
  ECHO_SNAP_LINE,
  ECHO_SUMMON_HEADER,
  ECHO_SUMMON_TEXT,
  ECHO_TITLE,
  TRUTH_SCENE,
  echoSwayLineAt,
} from '../content/choirLines';
import {
  ARRIVE_SECONDS,
  ECHO_MASS,
  ECHO_RADIUS,
  ECHO_REEL_RATE,
  HOLD_LENGTH,
  SUMMON_HOLD_SECONDS,
  SUMMON_RANGE,
  SWAY_LINE_SECONDS,
  SWAY_RATE,
  createMarensEchoState,
  echoFighting,
  echoMarker,
  echoSummonEligible,
  echoTensionFraction,
  holdPoint,
  isMarensThimble,
  landEligibleAt,
  mirrorDrain,
  swayOffset,
  MARENS_ECHO_ZONE,
  type Landmark,
} from '../bosses/marensEcho';

/** Salt for her one LOOT draw — the rig her body is generated from. */
const ECHO_LOOT_SALT = 0x4543484f; // 'ECHO'

/**
 * The disturbance id her ActiveCatch carries. She never came off a ripple, so
 * she gets a fixed one out of the way of the run's own counter (which starts at
 * 1 and only counts up) — the loot roll it keys is suppressed for her anyway.
 */
const ECHO_CATCH_ID = -404;

/**
 * The tier her CATCH RECORD is filed at. She is a Boss (tier 5) like the other
 * three, but she is the only one that is ever LANDED, and a landed catch rides a
 * CatchRecord whose tier column the save schema bounds at 4 — the Drowned band,
 * which is exactly where plan §2.3 puts her trophy ("a Drowned-tier trophy").
 * So the ladder is narrowed at the receipt and nowhere else.
 */
const ECHO_RECEIPT_TIER = 4;

// --- the marker ---------------------------------------------------------------

/** The deepest water in the current lake, or null when there is no lake. */
export function echoMarkerFor(world: WorldState): { x: number; z: number } | null {
  if (!world.lake) return null;
  const land: Landmark[] = landmarks(world);
  return echoMarker(land);
}

/** Is the keeper (hull or boots) standing at the marker? */
export function atEchoMarker(world: WorldState, marker: { x: number; z: number }): boolean {
  const at = keeperPoint(world);
  return Math.hypot(at.x - marker.x, at.z - marker.z) <= SUMMON_RANGE;
}

// --- the toasts ---------------------------------------------------------------
//
// One presentation seam, the Whistler's: the sim names a MOMENT, the content
// module owns the words, and the note is FAINT because the zone is black.

function note(world: WorldState, trigger: string, title: string, text: string): void {
  world.township.pendingMoment = { trigger, title, text, stamp: CHOIR_STAMP, faint: true };
}

// --- the summons --------------------------------------------------------------

function summon(world: WorldState, marker: { x: number; z: number }): void {
  const s = world.marensEcho;

  // HER BODY comes off the ordinary fish pipeline, like every other boss: a
  // species preset through the same generator every catch is built with. The
  // draw is seeded off the run seed alone (there is one Echo, at one place, per
  // run), so the same seed always meets the same figure.
  const rng = createRng(world.seed, LOOT, ECHO_LOOT_SALT);
  const preset = speciesById(MARENS_ECHO_SPECIES_ID);
  s.params = generateFishParams(preset, rng, { zone: world.run.zone });

  const at = keeperPoint(world);
  // She is already facing away when the light finds her; the bearing she hangs
  // on is simply "out from the keeper, on the far side of the marker" — the
  // direction the boat was travelling when it arrived, which needs no roll.
  s.bearing = Math.atan2(marker.x - at.x, marker.z - at.z);
  if (!Number.isFinite(s.bearing)) s.bearing = 0;
  s.swayPhase = 0;
  const p = holdPoint(at, s.bearing, HOLD_LENGTH);
  s.x = p.x;
  s.z = p.z;
  s.facing = s.bearing; // away from the boat (choir.md §5.6)
  s.marker = { x: marker.x, z: marker.z };

  // THE HOOK-SET. An ordinary fight. The keeper's end is the ordinary keeper's
  // end — player-stance reel, lure-cost cut — because this is YOUR line and YOUR
  // decision; the only unusual thing about the whole construction is where its
  // tension comes from.
  const aboard = world.mode === 'boat';
  const fight = startTetherFight(world, MARENS_ECHO_SPECIES_ID, aboard ? 'boat' : 'player', {
    a: aboard
      ? {
          anchor: { kind: 'boat' },
          owner: 'player',
          mass: BOAT_MASS_DEFAULT,
          radius: BOAT_RADIUS_DEFAULT,
          reel: { kind: 'player-stance' },
          cut: { kind: 'lure' },
        }
      : {
          anchor: { kind: 'entity', entityId: PLAYER_ENTITY },
          owner: 'player',
          mass: 1,
          radius: world.player.radius,
          reel: { kind: 'player-stance' },
          cut: { kind: 'lure' },
        },
    b: {
      anchor: { kind: 'entity', entityId: MARENS_ECHO_ENTITY },
      owner: 'enemy',
      mass: ECHO_MASS,
      radius: ECHO_RADIUS,
      reel: { kind: 'none' }, // she never takes line
      cut: { kind: 'none' }, // and she never lets go
    },
    L: HOLD_LENGTH,
    reelRate: ECHO_REEL_RATE,
    // EXPLICITLY 'free', not the equipped line's behaviour. Widow's Hair deals
    // the keeper 20 damage at the ceiling and Bellwire stuns a catch that does
    // not exist here — either would put a health change inside the one fight in
    // the game whose acceptance criterion is that no hp ever moves. Her line
    // parts the plain way, at the plain cost, whatever is on the reel.
    snapBehavior: 'free',
    tensionSource: 'proximity',
  });
  if (!fight) return;

  s.fightId = fight.id;
  s.floor = Math.max(fight.a.radius, fight.b.radius);
  s.distance = HOLD_LENGTH;
  s.tensionFraction = 0;
  s.phase = 'arrive';
  s.timer = ARRIVE_SECONDS;
  s.summoned = true;
  s.summonHeld = 0;
  s.reeledSeconds = 0;
  s.holdSeconds = 0;
  s.swayIndex = 0;
  s.landed = false;
  s.willing = false;
  s.goneHome = false;

  // THE CATCH SLOT. She is not world.fish (see bosses/marensEcho.ts), but she
  // IS a catch: the run's `activeCatch` is what the reducer banks on a LAND, and
  // filling it here is what makes her landing a real CatchRecord with real
  // Memories on the real receipt, through machinery nobody wrote for her.
  world.run.activeCatch = {
    disturbanceId: ECHO_CATCH_ID,
    tier: ECHO_RECEIPT_TIER,
    weight: s.params.weightKg,
    species: MARENS_ECHO_SPECIES_ID,
    name: preset.name,
  };

  // Met at the hook-set, like anything else you put a hook in.
  recordBestiary(world, MARENS_ECHO_SPECIES_ID, 'hooked');

  note(world, 'echoSummoned', `${ECHO_TITLE} — ${ECHO_SUMMON_HEADER}`, ECHO_SUMMON_TEXT);
  emitTownEvent({
    type: 'echo.summoned',
    zone: world.run.zone,
    fightId: fight.id,
    at: { x: s.x, z: s.z },
  });
}

// --- the ends -----------------------------------------------------------------

/** SHE GOES HOME — the snap (tension reached the ceiling) or a quiet walk-away. */
function goneHome(world: WorldState, cause: 'snap' | 'cut'): void {
  const s = world.marensEcho;
  s.goneHome = true;
  s.phase = 'gone';
  s.params = null;
  if (cause === 'snap') {
    // "The line snaps. The Echo does not flee; she drifts backward into the
    // choir of lights, unhooked and at peace. Gone home." It is not a failure
    // screen and it does not end the run — it is a note, and then the dark.
    note(world, 'echoSnap', `${ECHO_TITLE} — ${ECHO_SNAP_HEADER}`, ECHO_SNAP_LINE);
  }
  emitTownEvent({ type: 'echo.goneHome', zone: world.run.zone, fightId: s.fightId, cause });
}

/**
 * THE LANDING — the guaranteed clean catch. The CatchRecord itself is banked by
 * the ordinary run reducer off the ordinary 'landed' event (it runs after this
 * system, on the stream the constraint pushed this tick); what happens HERE is
 * everything that is hers alone: the trophy, the willing credit, the truth.
 */
function land(world: WorldState): void {
  const s = world.marensEcho;
  s.landed = true;
  s.phase = 'landing';
  s.willing = isMarensThimble(world.lure.id);

  // THE ECHO'S SCALE — a named Drowned-tier unique, not a roll. See
  // loot/roller.ts `namedDrownedUnique` for why a story trophy is not in the
  // random pool.
  world.run.inventory.push(
    namedDrownedUnique({
      id: ECHOS_SCALE.id,
      key: 'echos_scale',
      name: ECHOS_SCALE.name,
      slot: 'trinket',
    }),
  );

  // The bestiary credit the landing earns. 'clean' is recorded by the reducer
  // (this was a clean land like any other); 'willing' is the M4 flag that has
  // never had a producer until now, and it swaps her entry for the worse one.
  if (s.willing) recordBestiary(world, MARENS_ECHO_SPECIES_ID, 'willing');

  // THE TRUTH IS OUT. Latched on the LANDING, not on the last card: skipping the
  // scene does not un-tell you. It rides the RunResult onto metaState.truthSeen
  // (save/migrate.ts latches it) and M10's endings read it there.
  world.run.truthSeen = true;

  s.truth.active = true;
  s.truth.beat = 0;
  s.truth.done = false;
  // The press that TOOK her does not also skip her first word: the scene opens
  // already holding the edge, so the first beat costs its own press.
  s.truth.advancePrev = true;

  emitTownEvent({
    type: 'echo.landed',
    zone: world.run.zone,
    fightId: s.fightId,
    willing: s.willing,
    reeledSeconds: s.reeledSeconds,
  });
}

// --- the truth scene's clock --------------------------------------------------
//
// The Congregation invoice's shape exactly: the sim owns the beat index and the
// input edge, ui/truthScene.ts paints it. Three beats, each advanced by the same
// E the whole game acknowledges things with; the last one closes the scene and
// hands over the drop toast.

function stepTruth(world: WorldState, s = world.marensEcho): void {
  const t = s.truth;
  if (!t.active) return;
  // E, either way the player gives it. game/input.ts binds ONE key to two
  // intents — `acceptLand` is the tap (a consumed one-tick edge) and `extract`
  // is the hold — and a card sequence that only listened to the hold would be
  // un-advanceable by the same quick press that took her aboard.
  const down = world.intent.extract || world.intent.acceptLand;
  const press = down && !t.advancePrev;
  t.advancePrev = down;
  if (!press) return;

  if (t.beat < TRUTH_SCENE.length - 1) {
    t.beat++;
    return;
  }
  t.active = false;
  t.done = true;
  s.phase = 'gone';
  s.params = null;
  // …and the drop, in the parchment note every other trophy arrives in. The
  // scene ends and the run simply continues, in the dark, holding a scale that
  // weighs nothing.
  note(world, 'echosScale', `${ECHOS_SCALE.name} — ${ECHOS_SCALE.flavorHeader}`, ECHOS_SCALE.dropText);
}

// --- the system ---------------------------------------------------------------

export function updateMarensEcho(world: WorldState, dt: number): void {
  const s = world.marensEcho;

  // The truth scene outlives the fight that caused it, and runs whatever the
  // phase is doing.
  if (s.truth.active) {
    stepTruth(world, s);
    return;
  }
  if (s.phase === 'gone') return;

  // --- 1. THE SUMMONS ---------------------------------------------------------
  if (s.phase === 'idle') {
    const marker = echoMarkerFor(world);
    if (!marker) {
      s.summonHeld = 0;
      return;
    }
    s.marker = marker;
    const eligible = echoSummonEligible({
      zone: world.run.zone,
      atMarker: atEchoMarker(world, marker),
      fightLive: world.tether.fights.length > 0,
      hasCatch: world.run.activeCatch !== null,
      submerged: world.water.active,
      summoned: s.summoned,
    });
    if (!eligible || !world.intent.extract) {
      s.summonHeld = 0;
      return;
    }
    s.summonHeld += dt;
    if (s.summonHeld >= SUMMON_HOLD_SECONDS) summon(world, marker);
    return;
  }

  // --- the live fight ---------------------------------------------------------
  const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
  if (!fight) {
    // The fight ended this tick. WHICH end it was is read off the same event
    // stream the reducer reads, so the sim and the receipt can never disagree.
    let landed = false;
    let snapped = false;
    for (const ev of world.tetherEvents) {
      if (ev.type === 'landed') landed = true;
      else if (ev.type === 'snap' && ev.fightId === s.fightId) snapped = true;
    }
    if (landed) land(world);
    else goneHome(world, snapped ? 'snap' : 'cut');
    return;
  }

  // --- 2/3. THE HOLD, THE SWAY, THE MIRROR ------------------------------------
  //
  // Her position is OWNED here and rewritten every tick: she hangs exactly L
  // metres off the keeper on a swaying bearing. That is what "holds at max line
  // length" means when the line can be shortened — she does not swim toward you
  // when you reel, the water between you simply stops existing.
  s.swayPhase += SWAY_RATE * dt;
  const at = keeperPoint(world);
  const bearing = s.bearing + swayOffset(s.swayPhase);
  const p = holdPoint(at, bearing, fight.L);
  s.x = p.x;
  s.z = p.z;
  s.facing = bearing; // still facing away, all the way in

  s.distance = Math.hypot(s.x - at.x, s.z - at.z);

  if (s.phase === 'arrive') {
    s.timer -= dt;
    if (s.timer <= 0) s.phase = 'hold';
  }

  // --- 4. THE REEL: PROXIMITY → TENSION → STAMINA -----------------------------
  //
  // The one number the fight is made of, written once, here. `tensionSource:
  // 'proximity'` is what stops the constraint from also having an opinion.
  s.tensionFraction = echoTensionFraction(s.distance, s.floor);
  fight.tension = s.tensionFraction * world.line.tensionCeiling;

  const reeling = fight.reel.active;
  if (reeling) {
    s.reeledSeconds += dt;
    s.holdSeconds = 0;
    // The mirror: she is not pulling, she is COSTING. On top of the ordinary
    // 10/s reel-stance drain the constraint already took this tick.
    const drain = mirrorDrain(s.tensionFraction) * dt;
    if (drain > 0) {
      world.player.stamina = Math.max(0, world.player.stamina - drain);
      world.player.staminaRegenDelay = STAMINA_DELAY;
    }
  } else if (s.phase === 'hold') {
    // …and if you DON'T pull, she talks. Patient, unhurried, forever.
    s.holdSeconds += dt;
    if (s.holdSeconds >= SWAY_LINE_SECONDS) {
      s.holdSeconds -= SWAY_LINE_SECONDS;
      const line = echoSwayLineAt(s.swayIndex);
      emitTownEvent({
        type: 'echo.sway',
        zone: world.run.zone,
        fightId: fight.id,
        index: s.swayIndex,
      });
      s.swayIndex++;
      note(world, 'echoSway', ECHO_TITLE, line.text);
    }
  }

  // --- 5. THE DECISION --------------------------------------------------------
  //
  // The LAND prompt arms a couple of metres before the line's own floor, so the
  // window is a real window: the tension gauge is already high and still
  // climbing, and taking her or reeling on are both live choices with the same
  // button-shaped cost. The constraint's ordinary LAND branch does the rest —
  // and its ordinary SNAP branch does the other rest, at the floor.
  fight.land.eligible = s.phase === 'hold' && landEligibleAt(s.distance, s.floor);
}

// --- test / probe seams -------------------------------------------------------

/** Is her fight live, and how is it configured? The gate driver's readout. */
export function echoFightConfig(
  world: WorldState,
): {
  a: string;
  b: string;
  aReel: string;
  bReel: string;
  aCut: string;
  bCut: string;
  tensionSource: string;
  snapBehavior: string;
} | null {
  const s = world.marensEcho;
  if (!echoFighting(s)) return null;
  const fight = world.tether.fights.find((f) => f.id === s.fightId);
  if (!fight) return null;
  return {
    a: fight.a.owner,
    b: fight.b.owner,
    aReel: fight.a.reel.kind,
    bReel: fight.b.reel.kind,
    aCut: fight.a.cut.kind,
    bCut: fight.b.cut.kind,
    tensionSource: fight.tensionSource ?? 'overshoot',
    snapBehavior: fight.snapBehavior ?? 'line',
  };
}

/** Reset her slice — used by the run reset, next to the other bosses. */
export function resetMarensEcho(world: WorldState): void {
  world.marensEcho = createMarensEchoState();
}

export { MARENS_ECHO_ZONE };
