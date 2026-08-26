// THE POSTMASTER (systems) — the driver half of the Township boss, plan 05
// §2.2. Runs in its own sim slot AFTER `combat` (so this tick's gaff hits are
// what open the cut window) and BEFORE the run reducer and the run terminal (so
// `deliveredBy` is stamped onto the run in the same tick the drowning happened).
//
// What it does, in the plan's order:
//   1. THE SUMMONS — on foot, on the drowned Post Office's roof, at the
//      letterbox, at night or deeper: hold E. "The letterbox is full."
//   2. THE HOOK-SET — one ORDINARY `TetherFight` with the endpoints filled the
//      other way round: he is the A end (owner 'enemy', reel 'ai', cut
//      'contextual'), the keeper is the B end (reel 'none', cut 'none'). See
//      bosses/postmaster.ts for why that alone is the whole reverse tether.
//   3. THE DELIVERY LOOP — station → telegraph (1.2 s of speech-bubble) →
//      route-drag (he takes line; you go where the route goes) → station.
//      Every route aims past the roof rim, so the route ends in the street.
//   4. THE HAZARD — over the edge is the water phase, and in HIS fight breath
//      is lethal (game/waterPhase.ts `water.lethal`). That is his win.
//   5. THE VICTORY — two landed gaffs knock his grip off the twine; while he is
//      staggered, hold E in reach to CUT HIS LINE. It costs nothing: it is not
//      your line and not your lure. He drops the forwarding address.
//
// Pure logic: no `three` imports, no DOM, no Math.random, no Date.

import type { WorldState } from '../core/world';
import type { TetherFight } from '../game/tether';
import {
  PLAYER_ENTITY,
  POSTMASTER_ENTITY,
  startTetherFight,
} from '../game/tether';
import { pointInConvex } from '../core/poly';
import type { Vec2 } from '../core/poly';
import { createRng, LOOT } from '../core/rngStreams';
import { currentPhase, currentDreadMult } from '../run/reducer';
import { applyDreadGain, landGainByTier, tierFor } from '../game/dread';
import { generateFishParams } from '../gen/fishParams';
import { speciesById, POSTMASTER_SPECIES_ID } from '../data/species';
import { rollGuaranteedDrop, type RollCtx } from '../loot/roller';
import { recordBestiary } from '../bestiary/bestiary';
import { emitTownEvent } from '../meta/townEvents';
import { postOfficeMarker, postOfficeRoof, type Roof } from '../gen/township';
import type { Islet } from '../gen/lakeMap';
import {
  POSTMASTER_TITLE,
  canonicalVerbAt,
  postmasterLineFor,
  FORWARDING_ADDRESS_HEADER,
  FORWARDING_ADDRESS_TEXT,
  type PostmasterVerb,
} from '../content/postmasterLines';
import {
  ARRIVE_SECONDS,
  BOSS_MASS,
  BOSS_RADIUS,
  BOSS_REEL_RATE,
  BOSS_SWIM,
  BRACE_DOT,
  COURTESY_COOLDOWN,
  CUT_HOLD_SECONDS,
  CUT_REACH,
  DRAG_SECONDS,
  GAFF_POOL,
  LINE_LENGTH,
  PAYOUT_RATE,
  POSTMASTER_LINE_ID,
  POSTMASTER_TARGET_ID,
  SINK_SECONDS,
  STAGGER_SECONDS,
  STATION_SECONDS,
  SUMMON_HOLD_SECONDS,
  SUMMON_RANGE,
  TELEGRAPH_SECONDS,
  WHIP_TENSION,
  holdStation,
  postmasterFighting,
  postmasterGaffCost,
  postmasterRng,
  postmasterSummonEligible,
  rollRotationStart,
  rollRouteBearing,
  routeStation,
  swimToward,
} from '../bosses/postmaster';

// Salt for his LOOT draws (the rig, and the parcel he hands over). His
// BEHAVIOUR rides the AI-shaped stream in bosses/postmaster.ts; his ITEMS ride
// the loot stream, like every other item in the game.
const POSTMASTER_LOOT_SALT = 0x504d4c54; // 'PMLT'

// s a speech bubble stays up. A canonical telegraph outlives its own 1.2 s
// window so the card is still readable while the pull lands; a courtesy is a
// shorter aside.
const CANONICAL_CARD_SECONDS = TELEGRAPH_SECONDS + 0.9;
const COURTESY_CARD_SECONDS = 2.2;

// --- the arena --------------------------------------------------------------------

export interface PostmasterArena {
  roof: Roof;
  islet: Islet;
  marker: Vec2;
}

/** The drowned Post Office, its walkable roof polygon, and its letterbox. */
export function postmasterArena(world: WorldState): PostmasterArena | null {
  const lake = world.lake;
  if (!lake || !lake.street) return null;
  const roof = postOfficeRoof(lake.roofs);
  if (!roof) return null;
  const islet = lake.islets[roof.isletId];
  if (!islet) return null;
  return { roof, islet, marker: postOfficeMarker(lake.street, roof) };
}

/** Standing on the Post Office roof, at its letterbox, on foot. */
export function atLetterbox(world: WorldState, arena: PostmasterArena): boolean {
  if (world.mode !== 'foot') return false;
  if (world.dockedIslet !== arena.roof.isletId) return false;
  const p = world.player;
  return Math.hypot(p.x - arena.marker.x, p.z - arena.marker.z) <= SUMMON_RANGE;
}

// --- the cards --------------------------------------------------------------------
//
// ONE presentation seam, two kinds of card. The sim never names a LINE: it names
// a VERB, and content/postmasterLines.ts owns which words that verb says (which
// is what makes the copy pass a data swap). The bubble itself is
// ui/postmasterTelegraph.ts, projected over his head.

function showCard(world: WorldState, verb: PostmasterVerb, seconds: number): void {
  const s = world.postmaster;
  const line = postmasterLineFor(verb);
  if (!line) return;
  s.card = verb;
  s.cardTimer = seconds;
  emitTownEvent({
    type: 'postmaster.telegraph',
    zone: world.run.zone,
    fightId: s.fightId,
    verb,
    line: line.line,
    canonical: line.isCanonical,
  });
}

// A courtesy never talks over a live telegraph — the card that matters is the
// one that tells you where the next pull is going — and they are rate-limited so
// the comedy stays punctuation.
//
// `force` is for the one courtesy that is not an aside: STAGE_TRANSITION fires
// on a single edge (the water closing over your head) and has no second chance,
// and by then the card that told you where the pull was going has already done
// its job. Dropping that line to protect a telegraph would be protecting the
// wrong one.
function courtesy(world: WorldState, verb: PostmasterVerb, force = false): void {
  const s = world.postmaster;
  if (!force) {
    if (s.courtesyCooldown > 0) return;
    const live = s.card ? postmasterLineFor(s.card) : null;
    if (live && live.isCanonical && s.cardTimer > 0) return;
  }
  showCard(world, verb, COURTESY_CARD_SECONDS);
  s.courtesyCooldown = COURTESY_COOLDOWN;
}

// One toast into the parchment note the barks and the Snatcher moments use — the
// drop text, at the one moment there is a drop.
function dropToast(world: WorldState): void {
  world.township.pendingMoment = {
    trigger: 'forwardingAddress',
    title: `${POSTMASTER_TITLE} — ${FORWARDING_ADDRESS_HEADER}`,
    text: FORWARDING_ADDRESS_TEXT,
  };
}

// --- the summons -------------------------------------------------------------------

function summon(world: WorldState, arena: PostmasterArena): void {
  const s = world.postmaster;
  const rng = postmasterRng(world.seed, arena.roof.id, 0);
  s.rotationStart = rollRotationStart(rng);
  s.angle = rollRouteBearing(rng);

  // THE BODY comes off the ordinary fish pipeline: a species preset through the
  // same generator every catch is built with (no new asset, no new mesh path).
  // He is NOT world.fish — a reverse fight has no catch, and putting him in the
  // catch slot would hand him the butcher check, the LAND prompt and the
  // low-tension exhaustion drain that belong to things you are hauling.
  const loot = createRng(world.seed, LOOT, (POSTMASTER_LOOT_SALT ^ arena.roof.id) >>> 0);
  s.params = generateFishParams(speciesById(POSTMASTER_SPECIES_ID), loot, {
    zone: world.run.zone,
  });

  const at = holdStation(arena.roof.pos, s.angle);
  s.x = at.x;
  s.z = at.z;
  s.facing = Math.atan2(world.player.x - s.x, world.player.z - s.z);
  s.speed = 0;

  // THE REVERSE HOOK-SET. One ordinary fight; the endpoints are the whole trick.
  const fight = startTetherFight(world, POSTMASTER_SPECIES_ID, 'player', {
    a: {
      anchor: { kind: 'entity', entityId: POSTMASTER_ENTITY },
      owner: 'enemy',
      mass: BOSS_MASS,
      radius: BOSS_RADIUS,
      reel: { kind: 'ai' },
      cut: { kind: 'contextual' },
    },
    b: {
      anchor: { kind: 'entity', entityId: PLAYER_ENTITY },
      owner: 'player',
      mass: 1,
      radius: world.player.radius,
      reel: { kind: 'none' },
      cut: { kind: 'none' },
    },
    L: LINE_LENGTH,
    reelRate: BOSS_REEL_RATE,
    snapBehavior: 'hold',
  });
  if (!fight) return;

  s.fightId = fight.id;
  s.roofId = arena.roof.id;
  s.phase = 'arrive';
  s.timer = ARRIVE_SECONDS;
  s.summoned = true;
  s.summonHeld = 0;
  s.drags = 0;
  s.gaffHp = GAFF_POOL;
  s.gaffHits = 0;
  s.cutHeld = 0;
  s.courtesyCooldown = 0;
  s.reeling = false;
  s.cut = false;
  s.delivered = false;
  s.wasUnder = world.water.active;

  // He is met the moment he takes the line — the same 'hooked' credit a catch
  // earns at the hook-set, except that here he is the one doing the hooking.
  recordBestiary(world, POSTMASTER_SPECIES_ID, 'hooked');

  showCard(world, 'APPROACH', COURTESY_CARD_SECONDS);
  s.courtesyCooldown = COURTESY_COOLDOWN;
  emitTownEvent({
    type: 'postmaster.summoned',
    zone: world.run.zone,
    fightId: fight.id,
    roofId: arena.roof.id,
  });
}

// --- the delivery loop ----------------------------------------------------------------

function enterStation(world: WorldState, arena: PostmasterArena): void {
  const s = world.postmaster;
  s.phase = 'station';
  s.timer = STATION_SECONDS;
  s.reeling = false;
  // The NEXT delivery's bearing, off his own point in seed space. Rolled here
  // so the reposition and the route agree: he walks to where he is about to
  // pull you, which is what makes the telegraph honest.
  s.angle = rollRouteBearing(postmasterRng(world.seed, arena.roof.id, s.drags + 1));
  courtesy(world, 'REPOSITION');
}

function enterTelegraph(world: WorldState, arena: PostmasterArena): void {
  const s = world.postmaster;
  s.phase = 'telegraph';
  s.timer = TELEGRAPH_SECONDS;
  s.reeling = false;
  // "the drag ROUTES aim at the roof edge — going over = water phase entry"
  const station = routeStation(arena.islet.hull, arena.roof.pos, s.angle, (p) =>
    pointInConvex(p, arena.islet.hull),
  );
  s.routeX = station.x;
  s.routeZ = station.z;
  showCard(world, canonicalVerbAt(s.drags, s.rotationStart), CANONICAL_CARD_SECONDS);
}

function enterDrag(world: WorldState, fight: TetherFight): void {
  const s = world.postmaster;
  s.phase = 'drag';
  s.timer = DRAG_SECONDS;
  s.reeling = true; // the constraint's 'ai' reel case reads fight.aiReel
  s.drags++;
  // HE TAKES UP THE SLACK FIRST. Without this the delivery spends most of its
  // 2.6 s winding in line that was hanging loose after the last payout, and the
  // pull lands as a shrug. Snapping L to the live separation on the frame the
  // card comes down means every metre he reels from here is a metre you travel
  // — which is what makes the telegraph worth reading.
  const d = Math.hypot(s.x - world.player.x, s.z - world.player.z);
  fight.L = Math.min(fight.L, Math.max(BOSS_RADIUS, d));
}

function stagger(world: WorldState): void {
  const s = world.postmaster;
  s.phase = 'staggered';
  s.timer = STAGGER_SECONDS;
  s.reeling = false;
  s.cutHeld = 0;
  s.speed = 0;
}

// --- the ends ---------------------------------------------------------------------------

function endFight(world: WorldState): TetherFight | null {
  const s = world.postmaster;
  const idx = world.tether.fights.findIndex((f) => f.id === s.fightId);
  if (idx < 0) return null;
  const fight = world.tether.fights[idx]!;
  world.tether.fights.splice(idx, 1);
  return fight;
}

// VICTORY — "close-range contextual action CUTS THE BOSS'S LINE (distinct from
// the player's F-cut which costs a lure)". It costs nothing, because nothing
// here is yours: not the line, not the lure, not the hook.
function cutHisLine(world: WorldState): void {
  const s = world.postmaster;
  const fightId = s.fightId;
  endFight(world);

  world.tetherEvents.push({
    type: 'cut',
    fightId,
    lineId: POSTMASTER_LINE_ID,
    cost: 'contextual',
  });
  world.tetherEvents.push({ type: 'bossLineCut' });

  // THE DROP. The address is a META fact, not a sundry: it rides the RunResult
  // onto metaState.forwardingAddress (save/migrate.ts latches it), which is what
  // plan §1.4's `forwardingAddress:true` unlock condition reads.
  world.run.forwardingAddress = true;

  // …and one guaranteed Rare-or-better parcel, the way a boss pays out.
  const rng = createRng(world.seed, LOOT, ((POSTMASTER_LOOT_SALT ^ 0x5052) + fightId) >>> 0);
  const ctx: RollCtx = {
    zoneDepth: world.run.zone,
    catchTier: speciesById(POSTMASTER_SPECIES_ID).tier,
    dreadTier: tierFor(world.dread),
    licenseGrade: world.run.licenseGrade,
    qualityBonus: 1,
  };
  world.run.inventory.push(rollGuaranteedDrop(rng, ctx, 'R'));

  recordBestiary(world, POSTMASTER_SPECIES_ID, 'butchered');
  world.dread = applyDreadGain(world.dread, landGainByTier(4), currentDreadMult(world));
  world.run.dreadPeak = Math.max(world.run.dreadPeak, world.dread);

  dropToast(world);
  emitTownEvent({
    type: 'postmaster.cut',
    zone: world.run.zone,
    fightId,
    drags: s.drags,
    gaffHits: s.gaffHits,
  });

  s.cut = true;
  s.phase = 'sinking';
  s.timer = SINK_SECONDS;
  s.reeling = false;
  s.cutHeld = 0;
  s.card = null;
  s.cardTimer = 0;
  world.water.lethal = false;
}

// HIS WIN — the keeper drowned in the street a delivery put them in. The run
// ends through the ordinary death flow (systems/runTerminal.ts reads hp 0); all
// this does is put his name on it.
function delivered(world: WorldState): void {
  const s = world.postmaster;
  const fightId = s.fightId;
  endFight(world);
  world.tetherEvents.push({ type: 'delivered', by: 'postmaster' });
  world.run.deliveredBy = 'postmaster';
  s.delivered = true;
  s.phase = 'gone';
  s.reeling = false;
  s.card = null;
  s.cardTimer = 0;
  emitTownEvent({
    type: 'postmaster.delivered',
    zone: world.run.zone,
    fightId,
    drags: s.drags,
  });
}

// --- the system ----------------------------------------------------------------------------

export function updatePostmaster(world: WorldState, dt: number): void {
  const s = world.postmaster;

  // The card's own clock, always (it outlives the phase that raised it).
  if (s.cardTimer > 0) {
    s.cardTimer = Math.max(0, s.cardTimer - dt);
    if (s.cardTimer === 0) s.card = null;
  }
  if (s.courtesyCooldown > 0) s.courtesyCooldown = Math.max(0, s.courtesyCooldown - dt);

  // He goes down courteously. No line, no fight — just a body leaving.
  if (s.phase === 'sinking') {
    s.timer -= dt;
    s.speed = 0;
    if (s.timer <= 0) {
      s.phase = 'gone';
      s.params = null;
    }
    return;
  }
  if (s.phase === 'gone') return;

  const arena = postmasterArena(world);

  // --- 1. THE SUMMONS ------------------------------------------------------------------
  if (s.phase === 'idle') {
    if (!arena) {
      s.summonHeld = 0;
      return;
    }
    const eligible = postmasterSummonEligible({
      zone: world.run.zone,
      phase: currentPhase(world),
      onFoot: world.mode === 'foot',
      atMarker: atLetterbox(world, arena),
      fightLive: world.tether.fights.length > 0,
      submerged: world.water.active,
      summoned: s.summoned,
    });
    if (!eligible || !world.intent.extract) {
      s.summonHeld = 0;
      return;
    }
    s.summonHeld += dt;
    if (s.summonHeld >= SUMMON_HOLD_SECONDS) summon(world, arena);
    return;
  }

  // --- the live fight -------------------------------------------------------------------
  const fight = world.tether.fights.find((f) => f.id === s.fightId) ?? null;
  if (!fight || !arena) {
    // The line is gone and it was not cut here — the only other producers are a
    // run reset or a world teardown. Leave courteously.
    s.phase = 'gone';
    s.reeling = false;
    s.card = null;
    s.cardTimer = 0;
    world.water.lethal = false;
    return;
  }

  // --- 4. THE HAZARD ---------------------------------------------------------------------
  // Over the roof edge is the flooded street. In HIS fight breath is lethal —
  // `water.lethal` is the flag game/waterPhase.ts has read on the swamp branch
  // since 03 §6.1, and this is the second thing in the game to set it. Nothing
  // else raises it, so an ordinary drag still merely clamps breath at zero.
  world.water.lethal = world.water.active;
  if (world.water.active) {
    if (!s.wasUnder) courtesy(world, 'STAGE_TRANSITION', true);
    s.wasUnder = true;
  } else {
    s.wasUnder = false;
  }

  if (world.player.hp <= 0) {
    delivered(world);
    return;
  }

  // --- THE GAFF — this tick's fresh hits, the same array combat refills --------------------
  for (const hit of world.combat.hits) {
    if (hit.targetId !== POSTMASTER_TARGET_ID) continue;
    s.gaffHits++;
    s.gaffHp -= postmasterGaffCost(hit.stagger);
  }
  if (s.gaffHp <= 0 && s.phase !== 'staggered') stagger(world);

  // --- 5. THE CUT ------------------------------------------------------------------------
  if (s.phase === 'staggered') {
    const p = world.player;
    const inReach = Math.hypot(p.x - s.x, p.z - s.z) <= CUT_REACH;
    if (inReach && world.intent.extract) {
      s.cutHeld += dt;
      if (s.cutHeld >= CUT_HOLD_SECONDS) {
        cutHisLine(world);
        return;
      }
    } else {
      s.cutHeld = 0;
    }
  }

  // --- his twine's own read ----------------------------------------------------------------
  // It does not part (snapBehavior 'hold'); what a ceiling buys you is a
  // courtesy. TENSION_SPIKE is the bible's own verb for exactly this moment.
  if (fight.tension >= WHIP_TENSION) courtesy(world, 'TENSION_SPIKE');

  // --- 3. THE DELIVERY LOOP ------------------------------------------------------------------
  s.timer -= dt;
  const target =
    s.phase === 'telegraph' || s.phase === 'drag'
      ? { x: s.routeX, z: s.routeZ }
      : holdStation(arena.roof.pos, s.angle);

  if (s.phase !== 'staggered') {
    const step = swimToward({ x: s.x, z: s.z }, target, BOSS_SWIM, dt);
    s.x = step.x;
    s.z = step.z;
    if (step.moved > 1e-6) s.facing = step.facing;
    s.speed = step.moved / Math.max(dt, 1e-9);
  }

  switch (s.phase) {
    case 'arrive':
      if (s.timer <= 0) enterStation(world, arena);
      break;
    case 'station':
      // He pays line back out between deliveries — you are RETURNED, then sent
      // again. Without this the first delivery would end the fight at the floor.
      fight.L = Math.min(LINE_LENGTH, fight.L + PAYOUT_RATE * dt);
      if (s.timer <= 0) enterTelegraph(world, arena);
      break;
    case 'telegraph':
      if (s.timer <= 0) enterDrag(world, fight);
      break;
    case 'drag': {
      // "you set your feet against the delivery" — the bible's BRACE_CHECK. The
      // same dot the constraint's brace term uses, read back for the comedy.
      const mx = world.intent.moveX;
      const my = world.intent.moveY;
      const mlen = Math.hypot(mx, my);
      if (mlen > 1e-6) {
        const px = s.x - world.player.x;
        const pz = s.z - world.player.z;
        const plen = Math.hypot(px, pz) || 1;
        const dot = (mx / mlen) * (-px / plen) + (my / mlen) * (-pz / plen);
        if (dot > BRACE_DOT) courtesy(world, 'BRACE_CHECK');
      }
      if (s.timer <= 0) enterStation(world, arena);
      break;
    }
    case 'staggered':
      if (s.timer <= 0) {
        // He gets his grip back. The window closed; the pool refills; the
        // delivery resumes. Nothing you landed is refunded to him but the grip.
        s.gaffHp = GAFF_POOL;
        s.cutHeld = 0;
        enterStation(world, arena);
      }
      break;
    default:
      break;
  }

  // The one write into the constraint: whether he is taking line this tick.
  fight.aiReel = s.reeling;
}

/** Test/probe seam: is the reverse fight live, and is it configured reversed? */
export function reverseFightConfig(
  world: WorldState,
): { a: string; b: string; aReel: string; bReel: string; aCut: string; bCut: string } | null {
  const s = world.postmaster;
  if (!postmasterFighting(s)) return null;
  const fight = world.tether.fights.find((f) => f.id === s.fightId);
  if (!fight) return null;
  return {
    a: fight.a.owner,
    b: fight.b.owner,
    aReel: fight.a.reel.kind,
    bReel: fight.b.reel.kind,
    aCut: fight.a.cut.kind,
    bCut: fight.b.cut.kind,
  };
}
