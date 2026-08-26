// BOAT COMBAT (systems) — plan 03 §6, spec §3.3. The night boat fight, driven
// off the SAME tether the keeper uses on foot: a Dragger surfaces, hooks the
// boat (`startTetherFight(world, 'dragger', 'boat')`), and every verb — reel,
// brace, cut, land — resolves through the M2 constraint at boat scale.
//
// Runs after `collision` in the update order, so it sees:
//   • this tick's fresh tether event stream (drag / cut / landed / snap), and
//   • this tick's obstacle thud (boatPhysics wrote boatCombat.impactSpeed),
// and it writes the winch/cleat stance flags the constraint reads on the NEXT
// tick (a deterministic one-fixed-step lag, the same convention fishAI uses for
// gaff hits).
//
// Gating (plan §5.3 phase table + §6.3 acceptance): no Dragger spawns, hooks or
// hull damage before `night`; deep night raises the rate ×1.5; false dawn is
// "safe again, if it still floats".
//
// Pure logic: no `three` imports, no Math.random, no Date.

import type { WorldState } from '../core/world';
import { createFish } from '../core/world';
import { createRng, AI, LOOT } from '../core/rngStreams';
import { startTetherFight } from '../game/tether';
import { enterWaterPhase } from '../game/tether';
import { speciesById, DRAGGER_SPECIES_ID } from '../data/species';
import { generateFishParams } from '../gen/fishParams';
import { applySpeciesParams } from './castFlow';
import { currentPhase } from '../run/reducer';
import { draggerEligible, draggerIntervalFor } from '../spawn/budgets';
import { tierFor } from '../game/dread';
import { rollGuaranteedDrop, type RollCtx } from '../loot/roller';
import { recordBestiary } from '../bestiary/bestiary';
import {
  DRAGGER_LINE_LENGTH,
  DRAGGER_SPAWN_DIST,
  DRAGGER_REPAIR_SEGMENTS,
  DRAGGER_TEETH_PER_LAND,
  HULL_DAMAGE_PER_DRAG_M,
  HULL_DAMAGE_PER_LUNGE,
  HULL_DAMAGE_PER_IMPACT,
  SWAMP_BREATH_SEC,
  SWAMP_OCCUPIED_TIER,
  WINCH_DRAG_MULT,
  cleatCut,
  damageHull,
  hullSwamped,
  repairHull,
  stepTilt,
} from '../boat/boatCombat';

// Salt for the Dragger stream on the AI channel (player-independent, plan §1.2).
const DRAGGER_SALT = 0x0d1a66;
// Radius the sinking haul scatters over when the boat swamps.
const SWAMP_SCATTER = 6;

// The boat fight currently running (there is at most one — the hull only has
// one cleat), or null.
function boatFight(world: WorldState) {
  return world.tether.fights.find((f) => f.anchor === 'boat') ?? null;
}

// --- spawn / hook (plan §6.1 trigger) -------------------------------------------

function canHook(world: WorldState): boolean {
  const bc = world.boatCombat;
  if (bc.active || bc.swamped) return false;
  if (world.run.ended) return false;
  if (world.mode !== 'boat') return false; // it hooks the BOAT; on foot there is none to hook
  if (world.water.active) return false;
  if (world.tether.fights.length > 0) return false; // one line in the water at a time
  if (world.run.activeCatch) return false;
  return draggerEligible(currentPhase(world));
}

// Surface a Dragger off the boat and hook the hull. Deterministic: the bearing
// comes from the AI stream salted by (run seed, spawn index).
export function hookDragger(world: WorldState): boolean {
  const bc = world.boatCombat;
  const rng = createRng(world.seed, AI, (DRAGGER_SALT ^ bc.spawns) >>> 0);
  bc.spawns++;

  const preset = speciesById(DRAGGER_SPECIES_ID);
  const params = generateFishParams(preset, rng, { zone: world.run.zone });

  const fish = world.fish ?? createFish();
  world.fish = fish;
  const ang = rng.nextFloat() * Math.PI * 2;
  fish.x = world.boat.x + Math.cos(ang) * DRAGGER_SPAWN_DIST;
  fish.z = world.boat.z + Math.sin(ang) * DRAGGER_SPAWN_DIST;
  fish.radius = Math.max(2, params.totalLength * 0.12);

  const fight = startTetherFight(world, preset.id, 'boat', {
    L: DRAGGER_LINE_LENGTH,
    reelRate: bc.winch.rate,
  });
  if (!fight) return false;
  applySpeciesParams(world, fish, params);

  bc.active = true;
  bc.dragger = {
    species: preset.id,
    tetherId: fight.id,
    yawTarget: null,
    spawnedAt: world.time.elapsed,
  };
  // The run reducer records the landing off world.run.activeCatch, exactly as it
  // does for a cast catch — the Dragger is a species, tier 4 (Epic → +12 Dread).
  world.run.activeCatch = {
    disturbanceId: -1, // not a ripple: nothing was cast at
    tier: preset.tier,
    weight: params.weightKg,
    species: preset.id,
    name: preset.name,
  };
  recordBestiary(world, preset.id, 'hooked');
  world.tetherEvents.push({ type: 'boatHooked', draggerId: -2 });
  return true;
}

// --- landing (plan §6.1 "Landing a Dragger") -------------------------------------

function landDragger(world: WorldState): void {
  const bc = world.boatCombat;
  bc.landed += 1;
  bc.teeth += DRAGGER_TEETH_PER_LAND;
  // "hull repair materials (+2 segments)"
  repairHull(bc, DRAGGER_REPAIR_SEGMENTS);
  // "guaranteed Rare+" — a separate roll from the reducer's ordinary catch drop
  // so the Dragger's boat-tier loot is never a nothing.
  const rng = createRng(world.seed, LOOT, (DRAGGER_SALT ^ bc.landed) >>> 0);
  const ctx: RollCtx = {
    zoneDepth: world.run.zone,
    catchTier: 4,
    dreadTier: tierFor(world.dread),
    licenseGrade: world.run.licenseGrade,
    qualityBonus: 1,
  };
  world.run.inventory.push(rollGuaranteedDrop(rng, ctx, 'R'));
}

// --- swamping (plan §6.1 "Hull 0 → swamp") ----------------------------------------

export function swampBoat(world: WorldState): void {
  const bc = world.boatCombat;
  if (bc.swamped) return;
  bc.swamped = true;
  bc.active = false;
  bc.dragger = null;
  bc.hull.hp = 0;
  bc.hull.segments = 0;
  world.boat.speed = 0;
  world.boat.atWinchPost = false;
  world.boat.atCleat = false;

  // The Dragger lets go of a hull that is no longer worth holding.
  world.tether.fights = world.tether.fights.filter((f) => f.anchor !== 'boat');
  world.run.activeCatch = null;
  world.fish = null;

  // The whole haul sinks around the keeper; each pickup costs breath seconds.
  const rng = createRng(world.seed, AI, (DRAGGER_SALT ^ 0x5177) >>> 0);
  world.run.sinking = world.run.haul.map((record) => {
    const a = rng.nextFloat() * Math.PI * 2;
    const r = 1 + rng.nextFloat() * SWAMP_SCATTER;
    return { record, x: world.boat.x + Math.cos(a) * r, z: world.boat.z + Math.sin(a) * r };
  });
  world.run.haul = [];

  // Into the water, on foot, with the extended breath timer.
  world.mode = 'foot';
  world.dockedIslet = null;
  world.player.x = world.boat.x;
  world.player.z = world.boat.z;
  world.player.vx = 0;
  world.player.vz = 0;

  const occupied = tierFor(world.dread) >= SWAMP_OCCUPIED_TIER;
  enterWaterPhase(world, { breathSec: SWAMP_BREATH_SEC, occupied, sinkingHaul: true });
  world.water.sinkingHaul = true;
  world.water.lethal = true;
  world.ui.underwater = true;
  world.tetherEvents.push({ type: 'swamped', sinkingHaul: true });
  world.tetherEvents.push({
    type: 'pulledUnder',
    breathSec: SWAMP_BREATH_SEC,
    occupied,
    sinkingHaul: true,
  });
}

// --- the system --------------------------------------------------------------------

export function updateBoatCombat(world: WorldState, dt: number): void {
  const bc = world.boatCombat;
  const fight = boatFight(world);

  // 1. Consume this tick's events for the boat fight (hull damage, cleat cut,
  //    landing, snap). Drag magnitude is the metres of hull the Dragger stole.
  if (bc.active) {
    const mult = world.boat.atWinchPost ? WINCH_DRAG_MULT : 1;
    // snapshot: the loop pushes hullHit events into the same array
    const incoming = world.tetherEvents.slice();
    for (const ev of incoming) {
      switch (ev.type) {
        case 'lunge':
          // the Dragger hits the end of the line and takes a bite of boat
          if (bc.dragger && ev.fightId === bc.dragger.tetherId) {
            const hp = damageHull(bc, HULL_DAMAGE_PER_LUNGE * mult);
            if (hp > 0) {
              world.tetherEvents.push({
                type: 'hullHit',
                segments: bc.hull.segments,
                hp: bc.hull.hp,
              });
            }
          }
          break;
        case 'drag':
          if (ev.anchor === 'boat') {
            const hp = damageHull(bc, ev.magnitude * HULL_DAMAGE_PER_DRAG_M * mult);
            if (hp > 0) {
              world.tetherEvents.push({
                type: 'hullHit',
                segments: bc.hull.segments,
                hp: bc.hull.hp,
              });
            }
          }
          break;
        case 'cut':
          // plan §6.1 — the cleat cut is the bail-out: it costs a hull segment,
          // never the lure. The constraint already refused to pay a lure here.
          if (ev.cost === 'hull-segment') {
            cleatCut(bc);
            world.tetherEvents.push({
              type: 'hullHit',
              segments: bc.hull.segments,
              hp: bc.hull.hp,
            });
          }
          break;
        case 'landed':
          landDragger(world);
          break;
        default:
          break;
      }
    }

    // 2. Yawed into a hazard: the thud costs hull (plan §6.1 "Dragger lunges yaw
    //    the boat toward hazards").
    if (bc.impactSpeed > 0) {
      damageHull(bc, bc.impactSpeed * HULL_DAMAGE_PER_IMPACT);
    }

    // 3. Deck tilt from the line's tension (feel; render + camera read it).
    stepTilt(bc, fight ? fight.tension : 0, dt);

    // 4. The hazard the Dragger is currently steering the hull at (legibility /
    //    debug readout; the direction itself lives in the fish AI's routed drag).
    if (bc.dragger && world.lake) {
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const iso of world.lake.islets) {
        const d = Math.hypot(iso.center.x - world.boat.x, iso.center.z - world.boat.z);
        if (d < bestD) {
          bestD = d;
          best = { x: iso.center.x, z: iso.center.z };
        }
      }
      bc.dragger.yawTarget = best;
    }
  } else {
    stepTilt(bc, 0, dt);
  }
  bc.impactSpeed = 0;

  // 5. The fight ended (cut / snap / land / butcher removed it) → stand down.
  if (bc.active && !boatFight(world)) {
    bc.active = false;
    bc.dragger = null;
    world.boat.atWinchPost = false;
    world.boat.atCleat = false;
  }

  // 6. Hull 0 → swamp (the extended water phase).
  if (!bc.swamped && hullSwamped(bc)) {
    swampBoat(world);
    return;
  }

  // 7. Spawn cadence — night+ only, and never while something else is on the
  //    line. The timer only runs while a hook is actually possible, so a run
  //    that spends dusk fishing does not bank Dragger spawns for the night.
  if (canHook(world)) {
    const interval = draggerIntervalFor(currentPhase(world));
    if (!Number.isFinite(interval)) {
      bc.spawnTimer = 0;
    } else {
      if (bc.spawnTimer <= 0) bc.spawnTimer = interval;
      bc.spawnTimer -= dt;
      if (bc.spawnTimer <= 0) {
        hookDragger(world);
        bc.spawnTimer = interval;
      }
    }
  } else if (!bc.active) {
    bc.spawnTimer = 0;
  }

  // 8. Stance for the NEXT constraint tick (plan §6.1): hold the reel at the
  //    winch post to haul — and moving away from the post cancels it. The cleat
  //    is the other end of the deck, so you cannot reel and cut at once.
  const atPost =
    bc.active &&
    world.intent.secondary &&
    Math.abs(world.intent.moveX) < 1e-6 &&
    Math.abs(world.intent.moveY) < 1e-6;
  world.boat.atWinchPost = atPost;
  world.boat.atCleat = bc.active && !atPost;
  bc.cleatCutReady = world.boat.atCleat && bc.hull.segments > 0;
}
