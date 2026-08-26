// DISTURBANCE / CAST / BITE (run) — plan 03 §3, task t12 #1. The telegraph →
// cast → bite → SET/RELEASE lifecycle. A disturbance is a ripple on open water:
// size encodes tier ONLY (1-3 for M3), never the species (rolled only at SET).
// Cast from the boat or a walkable shore by aiming the mouse (within ~10m) and
// pressing LMB. The bite arrives after a seeded delay (1-4s); the SET/RELEASE
// window is 1.2s — LMB = SET (the tether fight), RMB = RELEASE (consumed, the
// free Dread valve).
//
// Pure logic: no `three` imports.

import { Rng } from '../core/rng';
import type { Vec2 } from '../core/poly';

export type DisturbanceState = 'idle' | 'biting' | 'prompt' | 'gone';

// M6 (plan 05 §2.1): a boss ripple. The disturbance lifecycle is untouched —
// cast, bite, SET/RELEASE window, all of it — but a marked ripple hooks its boss
// instead of rolling the tier table, and it draws oversized so it reads as
// something other than a fish before you commit.
export type BossId = 'congregation';

export interface Disturbance {
  id: number;
  pos: Vec2;
  tier: 1 | 2 | 3; // ripple size only — species is never visible pre-SET
  state: DisturbanceState;
  biteTimer: number; // s until the bite (seeded 1-4s)
  promptTimer: number; // s left in the SET/RELEASE window
  seed: number; // per-disturbance AI-stream seed (deterministic bite delay)
  // M6: set only on the zone-2 boss ripple (undefined on every ordinary one, so
  // zone 1 and the rest of zone 2 are byte-identical to before the boss).
  boss?: BossId;
}

export const CAST_RANGE = 10; // m — cast reaches a disturbance within this
export const AIM_RANGE = 4; // m — the mouse must land within this of the target
export const PROMPT_WINDOW = 1.2; // s — SET/RELEASE window (plan §3.1)
export const BITE_DELAY_MIN = 1; // s
export const BITE_DELAY_MAX = 4; // s — seeded (task t12 #1 "1-4s")

// Ripple radius by tier — pure, species-free.
export const RIPPLE_RADIUS: Record<1 | 2 | 3, number> = { 1: 1.2, 2: 2.2, 3: 3.4 };

// The boss ripple is an oversized cluster — half again the biggest ordinary
// ring, which is the only pre-SET tell that this one is not a fish (plan 05
// §2.1's swarm reads as a disturbance the size of a congregation).
export const BOSS_RIPPLE_RADIUS = 5.2;

export function rippleRadiusForTier(tier: 1 | 2 | 3): number {
  return RIPPLE_RADIUS[tier] ?? RIPPLE_RADIUS[1];
}

// The radius a given disturbance draws at — boss ripples override the tier.
export function rippleRadiusFor(d: Disturbance): number {
  return d.boss ? BOSS_RIPPLE_RADIUS : rippleRadiusForTier(d.tier);
}

export function createDisturbance(
  id: number,
  pos: Vec2,
  tier: 1 | 2 | 3,
  seed: number,
  boss?: BossId,
): Disturbance {
  const d: Disturbance = { id, pos, tier, state: 'idle', biteTimer: 0, promptTimer: 0, seed };
  if (boss) d.boss = boss;
  return d;
}

export function withinRange(a: Vec2, b: Vec2, range: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return dx * dx + dz * dz <= range * range;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Seeded bite delay in [1, 4)s — deterministic per (disturbance seed, run seed).
export function biteDelaySeconds(seed: number, runSeed: number): number {
  const mixed = ((seed * 2654435761) ^ (runSeed * 40503)) >>> 0;
  return BITE_DELAY_MIN + new Rng(mixed).nextFloat() * (BITE_DELAY_MAX - BITE_DELAY_MIN);
}

export function startBite(d: Disturbance): void {
  d.state = 'biting';
  d.promptTimer = 0;
}

// RELEASE — consumes the disturbance, the free Dread valve (no gain).
export function release(d: Disturbance): void {
  d.state = 'gone';
  d.biteTimer = 0;
  d.promptTimer = 0;
}

// Which idle disturbance the mouse-cast targets. `casterPos` is the boat or the
// walkable-shore player. `point` is the mouse world point (null = no aim, the
// debug seam picks the nearest in-range disturbance). Requires a decent aim:
// the nearest-to-point disturbance must land within AIM_RANGE, or nothing casts.
export function pickCastTarget(
  dists: Disturbance[],
  casterPos: Vec2,
  point: Vec2 | null,
): Disturbance | null {
  const inRange = dists.filter(
    (d) => d.state === 'idle' && withinRange(casterPos, d.pos, CAST_RANGE),
  );
  if (inRange.length === 0) return null;
  if (!point) {
    let best = inRange[0]!;
    for (const d of inRange) if (dist(casterPos, d.pos) < dist(casterPos, best.pos)) best = d;
    return best;
  }
  let best: Disturbance | null = null;
  let bestDist = Infinity;
  for (const d of inRange) {
    const dd = dist(point, d.pos);
    if (dd < bestDist) {
      bestDist = dd;
      best = d;
    }
  }
  return best && bestDist <= AIM_RANGE ? best : null;
}