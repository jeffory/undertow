// WAKE — pure world-space wake particle pool (qa-issues.md T6, bug B3).
// No three, no DOM. The old wake was a THREE.Points parented to the boat
// group, so it translated and yawed WITH the hull — a wake parented to its
// emitter cannot read as a wake under any tuning. This pool emits particles
// into WORLD space at the stern and lets them decay in place; the boat sails
// away from them. game/boat.ts owns the render side (writes these positions
// into a Points buffer each frame); tests drive this module directly.
//
// Deterministic: per-emission jitter comes from a hash of the emission
// counter, never Math.random.

export interface WakeParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  life: number; // seconds; age >= life means dead (slot reusable)
}

export interface WakeState {
  parts: WakeParticle[];
  cursor: number; // next slot to overwrite
  emitAcc: number; // fractional emissions carried between steps
  emitted: number; // total emissions ever (drives the jitter hash)
}

export const WAKE_POOL = 64;

export function createWake(n: number = WAKE_POOL): WakeState {
  const parts: WakeParticle[] = [];
  for (let i = 0; i < n; i++) {
    parts.push({ x: 0, y: 0, z: 0, vx: 0, vz: 0, age: 1, life: 1 }); // born dead
  }
  return { parts, cursor: 0, emitAcc: 0, emitted: 0 };
}

// deterministic [0,1) from the emission counter
function hash01(n: number): number {
  let h = (n + 1) * 0x9e3779b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface WakeEmitter {
  x: number;
  z: number;
  heading: number; // radians; forward = (sin, cos)
  speed: number; // world units / s
}

const EMIT_SPEED_MIN = 0.15; // below this the boat leaves no wake
const STERN_BACK = 1.7; // metres behind the boat centre
const LIFE = 1.5; // seconds a splash survives

// Advance every particle in place and emit new ones behind a moving boat.
// Particles NEVER read the boat after emission — they belong to the world.
export function stepWake(wk: WakeState, emitter: WakeEmitter, dt: number): void {
  for (const p of wk.parts) {
    if (p.age >= p.life) continue;
    p.age += dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  }

  const speed = Math.abs(emitter.speed);
  if (speed <= EMIT_SPEED_MIN) {
    wk.emitAcc = 0;
    return;
  }

  // emission rate scales with speed: ~4/s at crawl up to ~14/s at full tilt
  wk.emitAcc += dt * (4 + 10 * Math.min(speed / 3, 1));
  const fx = Math.sin(emitter.heading); // forward
  const fz = Math.cos(emitter.heading);
  const lx = fz; // lateral (starboard)
  const lz = -fx;
  while (wk.emitAcc >= 1) {
    wk.emitAcc -= 1;
    const h1 = hash01(wk.emitted);
    const h2 = hash01(wk.emitted * 2 + 1);
    const side = wk.emitted % 2 === 0 ? 1 : -1; // alternate the V's arms
    const lat = side * (0.25 + 0.45 * h1);
    const p = wk.parts[wk.cursor]!;
    wk.cursor = (wk.cursor + 1) % wk.parts.length;
    wk.emitted++;
    p.x = emitter.x - fx * STERN_BACK + lx * lat;
    p.y = 0; // render side re-samples the water surface each frame
    p.z = emitter.z - fz * STERN_BACK + lz * lat;
    // drift: outward (widening V) + slightly sternward, slow — the READ of a
    // wake comes from being left behind, not from particle motion
    p.vx = lx * lat * 0.55 - fx * 0.25 + (h2 - 0.5) * 0.1;
    p.vz = lz * lat * 0.55 - fz * 0.25 + (h2 - 0.5) * 0.1;
    p.age = 0;
    p.life = LIFE * (0.75 + 0.5 * h2);
  }
}
