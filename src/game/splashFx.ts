// SPLASH FX (game) — task T10, the sim-side consumer of the tether event
// stream. Steps the pure splash pool (core/splash.ts) and spawns bursts the
// moment tether-fight events hit the water. This MUST run in the sim (fixed
// steps, registered in UPDATE_ORDER right after tetherConstraint): the render
// phase only runs after ALL of a frame's fixed steps, so a render-side consumer
// would drop events on multi-step frames. Here, every event is seen exactly
// once, per fixed step, in a deterministic order.
//
// Pure logic: no `three` imports.

import type { WorldState, FishState } from '../core/world';
import { spawnBurst, stepSplash } from '../core/splash';
import type { TetherFight } from './tether';
import { FISH_ENTITY } from './tether';

// event → intensity (the task's mapping): land/snap big, lunge/dive medium,
// hook-set small. Telegraph is intentionally skipped (judgment call — a
// telegraph is the coil-up BEFORE a lunge; the lunge itself fires a medium
// burst, so a small burst on every telegraph doubles the noise for no read).
export const INTENSITY_HOOK = 0.35; // fight just started (hook set)
export const INTENSITY_LUNGE = 0.6; // lunge impulse fired
export const INTENSITY_DIVE = 0.6; // catch breached/dived under
export const INTENSITY_SNAP = 1.0; // line snapped
export const INTENSITY_LAND = 1.0; // catch landed

// The enemy endpoint of a fight that is the fish (world.fish). Mirrors
// catchFish in game/tetherConstraint.ts — this is how render/lines.ts and the
// constraint locate the hooked catch.
function fightFishPos(world: WorldState, fight: TetherFight): { x: number; z: number } | null {
  const ep = fight.a.owner === 'enemy' ? fight.a : fight.b.owner === 'enemy' ? fight.b : null;
  if (!ep || ep.anchor.kind !== 'entity' || ep.anchor.entityId !== FISH_ENTITY) return null;
  const f = world.fish;
  return f ? { x: f.x, z: f.z } : null;
}

// Resolve where a tether event hit the water, by fight id. A live fight reads
// its catch's world position; a fight that just ended (snap/cut — the fight is
// already spliced by tetherConstraint) still has world.fish at the spot; and a
// landed catch (world.fish nulled at land) lands at the keeper's feet
// (LAND_DISTANCE = 2m), so the player position is the honest fallback.
function resolveEventPos(
  world: WorldState,
  fightId: number,
): { x: number; z: number } {
  for (const f of world.tether.fights) {
    if (f.id === fightId) {
      const pos = fightFishPos(world, f);
      if (pos) return pos;
    }
  }
  const fish = world.fish;
  if (fish) return { x: fish.x, z: fish.z };
  return { x: world.player.x, z: world.player.z };
}

function spawnAt(world: WorldState, fightId: number, intensity: number): void {
  const pos = resolveEventPos(world, fightId);
  spawnBurst(world.splash, pos.x, pos.z, intensity);
}

export function splashFx(world: WorldState, dt: number): void {
  const s = world.splash;

  // 1. Step the pool every fixed step so existing bursts decay in sim time
  //    (render only reads the resulting state once per display frame).
  stepSplash(s, dt);

  // 2. Hook-set — a fight id we have never seen before this tick. There is no
  //    'hookSet' event in the TetherEvent union, so the fight's own creation
  //    IS the event; watching it sim-side is the only way to never miss it.
  for (const fight of world.tether.fights) {
    if (s.seenFights.includes(fight.id)) continue;
    s.seenFights.push(fight.id);
    const pos = fightFishPos(world, fight) ?? { x: world.player.x, z: world.player.z };
    spawnBurst(s, pos.x, pos.z, INTENSITY_HOOK);
  }
  // Prune watchers for fights that ended (ids never repeat within a run, so a
  // fresh fight is always a real hook-set).
  if (s.seenFights.length > 0) {
    const live = new Set(world.tether.fights.map((f) => f.id));
    s.seenFights = s.seenFights.filter((id) => live.has(id));
  }

  // 3. Dive — the catch's state flipping into 'dive' is a water breach (there
  //    is no dedicated 'dive' event; enterDive sets fish.state). Watch the
  //    transition sim-side, like hook-set.
  const fish: FishState | null = world.fish;
  const st = fish ? fish.state : null;
  if (fish && st === 'dive' && s.prevFishState !== 'dive') {
    spawnBurst(s, fish.x, fish.z, INTENSITY_DIVE);
  }
  s.prevFishState = st;

  // 4. The tether event stream (produced by fishAI + tetherConstraint this
  //    tick, still uncleared — consumers read it after the constraint). Only
  //    the water-hitting events spawn; telegraph is skipped (see above).
  for (const ev of world.tetherEvents) {
    switch (ev.type) {
      case 'lunge':
        spawnAt(world, ev.fightId, INTENSITY_LUNGE);
        break;
      case 'snap':
        spawnAt(world, ev.fightId, INTENSITY_SNAP);
        break;
      case 'landed':
        // no fightId on 'landed' and world.fish is nulled at land — the catch
        // lands at the keeper's feet (LAND_DISTANCE = 2m), so that is the spot.
        spawnBurst(s, world.player.x, world.player.z, INTENSITY_LAND);
        break;
      default:
        break;
    }
  }
}