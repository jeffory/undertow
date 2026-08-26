// SPLASH — pure world-space combat splash pool (task T10, TODO.md Medium
// 'Combat Splash & Fish Breach FX'). Faceted low-poly splash bursts + an
// expanding foam ring when tether-fight events hit the water: hook-set, lunge,
// snap, land, and dive. The wake pool (core/wake.ts, T6) is the approved
// template: world-space particles, deterministic counter-hash jitter, and a
// separate render side that only rewrites buffers from this state.
//
// Sim/render split (IMPORTANT): this module is the pure sim slice — no three,
// no DOM. Stepping + spawning are driven SIM-side (src/game/splashFx.ts, wired
// into UPDATE_ORDER after tetherConstraint) so no tether event is ever dropped
// by a render-phase consumer in a multi-step frame. src/render/splash.ts owns
// the THREE.Points + one-shot foam rings.
//
// Deterministic: per-emission jitter comes from a hash of the emission
// counter, never Math.random.

export interface SplashParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number; // seconds; age >= life means dead (slot reusable)
}

export interface SplashRing {
  x: number;
  z: number;
  age: number;
  life: number; // seconds; age >= life means dead (slot reusable)
  maxR: number; // metres — the ring's outer radius at full expansion
}

export interface SplashState {
  parts: SplashParticle[];
  rings: SplashRing[];
  cursor: number; // next particle slot to overwrite
  ringCursor: number; // next ring slot to overwrite
  emitted: number; // total particles ever emitted (drives the jitter hash)
  seenFights: number[]; // fight ids already hook-set-bursted (sim-side watch)
  prevFishState: string | null; // dive-transition watch (fish.state → 'dive')
}

export const SPLASH_POOL = 96; // particle slots
export const SPLASH_RINGS = 8; // foam-ring slots

// Water-level gravity — the 0.6 dial keeps the arc snappy and readable (a full
// 9.8 makes bursts hang too long before the foam lands).
export const SPLASH_GRAVITY = 9.8 * 0.6;

export function createSplash(n: number = SPLASH_POOL, rings: number = SPLASH_RINGS): SplashState {
  const parts: SplashParticle[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 1 }); // born dead
  }
  const ringArr: SplashRing[] = [];
  for (let i = 0; i < rings; i++) {
    ringArr.push({ x: 0, z: 0, age: 1, life: 1, maxR: 0 }); // born dead
  }
  return {
    parts,
    rings: ringArr,
    cursor: 0,
    ringCursor: 0,
    emitted: 0,
    seenFights: [],
    prevFishState: null,
  };
}

// deterministic [0,1) from the emission counter (same hash as core/wake.ts)
function hash01(n: number): number {
  let h = (n + 1) * 0x9e3779b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// A burst's expanding foam ring at the current age (monotonic in time).
export function ringRadius(r: SplashRing): number {
  return r.maxR * Math.min(1, r.age / r.life);
}

// Emit a splash burst at (x, z) on the water plane. intensity ∈ [0..1] scales
// the particle count, spread/leap, and the foam ring's max radius. One burst =
// a cluster of radially-spreading droplets that leap ABOVE the water and fall
// back (each dies on re-entry) + one one-shot expanding foam ring. Fully
// deterministic: every draw comes from hash01(state.emitted).
export function spawnBurst(state: SplashState, x: number, z: number, intensity: number): void {
  const count = 6 + Math.round(18 * Math.min(1, Math.max(0, intensity)));

  for (let i = 0; i < count; i++) {
    const h1 = hash01(state.emitted);
    const h2 = hash01(state.emitted * 2 + 1);
    const h3 = hash01(state.emitted * 3 + 2);
    const p = state.parts[state.cursor]!;
    state.cursor = (state.cursor + 1) % state.parts.length;
    state.emitted++;

    // radial spread on the water, biased outward (a burst, not a plume)
    const angle = h1 * Math.PI * 2;
    const out = (1.1 + 2.4 * intensity) * (0.5 + h2);
    p.x = x;
    p.y = 0;
    p.z = z;
    p.vx = Math.cos(angle) * out;
    p.vz = Math.sin(angle) * out;
    // upward leap: the burst reads as water thrown UP, then falling back.
    // Life is keyed off vy so a high-thrown droplet always has time to land
    // (return time = 2·vy/g) — nothing dies mid-air, test (b).
    p.vy = (1.4 + 1.6 * h3) * (0.6 + 0.5 * intensity);
    p.life = Math.max(0.5, (2 * p.vy) / SPLASH_GRAVITY) * 1.35;
    p.age = 0;
  }

  // one expanding foam ring per burst — the "hit the water" read.
  const ring = state.rings[state.ringCursor]!;
  state.ringCursor = (state.ringCursor + 1) % state.rings.length;
  ring.x = x;
  ring.z = z;
  ring.age = 0;
  ring.life = 0.9;
  ring.maxR = 1.6 + 2.6 * Math.min(1, Math.max(0, intensity));
}

// Advance every particle and ring in place. Particles belong to the world
// after emission: gravity pulls them down, and each dies when it re-enters the
// water (y <= 0 with downward velocity). Rings just age — the render expands
// them from ringRadius (monotonic) and fades them out.
export function stepSplash(state: SplashState, dt: number): void {
  for (const p of state.parts) {
    if (p.age >= p.life) continue;
    p.age += dt;
    p.vy -= SPLASH_GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    // splash dies at the waterline: it never sinks or lingers on the surface
    if (p.y <= 0 && p.vy <= 0) {
      p.y = 0;
      p.age = p.life;
    }
  }
  for (const r of state.rings) {
    if (r.age >= r.life) continue;
    r.age += dt;
  }
}