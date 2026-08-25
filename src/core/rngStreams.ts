// RNG STREAMS — plan 03 §1.2: split the single run seed into three independent
// PCG32 streams (layout / loot / AI) so a bad draw in one never disturbs the
// others (spec 8.3, plan 03 §1.4). Splitmix64-derivation: the run seed is mixed
// with the stream id (and an optional salt) and scrambled with splitmix64 to
// produce the pcg seed. All math is integer (bigint) — no JS floats in the
// state path, so the streams reproduce identically on every platform.

import { Rng } from './rng';

// LAYOUT = surface map + spawn schedules; LOOT = species/rarity/Memories rolls;
// AI = enemy behaviour seeds. Player-independent, split from one run seed.
export type StreamId = 0 | 1 | 2;
export const LAYOUT: StreamId = 0;
export const LOOT: StreamId = 1;
export const AI: StreamId = 2;

const M64 = 0xffffffffffffffffn;
const GOLDEN = 0x9e3779b97f4a7c15n;
const MIX_B = 0xbf58476d1ce4e5b9n;
const MIX_C = 0x94d049bb133111ebn;

// splitmix64 scramble (state-in → state-out, deterministic u64 arithmetic).
function splitmix64(state: bigint): bigint {
  let z = (state + GOLDEN) & M64;
  z = ((z ^ (z >> 30n)) * MIX_B) & M64;
  z = ((z ^ (z >> 27n)) * MIX_C) & M64;
  return (z ^ (z >> 31n)) & M64;
}

// Derive a 32-bit pcg seed for (runSeed, streamId, salt). Same inputs → same
// seed; a salt only perturbs the stream it is applied to (plan §1.4).
export function deriveSeed(runSeed: number, streamId: StreamId, salt = 0): number {
  const base = (BigInt(runSeed >>> 0) ^ BigInt(streamId) * GOLDEN) & M64;
  let h = splitmix64(base);
  h = (h ^ BigInt(salt >>> 0) * MIX_B) & M64;
  h = splitmix64(h);
  return Number(h & 0xffffffffn) >>> 0;
}

// A PCG32 stream for the given run seed + stream id.
export function createRng(runSeed: number, streamId: StreamId, salt = 0): Rng {
  return new Rng(deriveSeed(runSeed, streamId, salt));
}

// The three run streams together (task scope 1: "expose stream accessors").
export interface RunStreams {
  layout: Rng;
  loot: Rng;
  ai: Rng;
}

export function createStreams(runSeed: number): RunStreams {
  return {
    layout: createRng(runSeed, LAYOUT),
    loot: createRng(runSeed, LOOT),
    ai: createRng(runSeed, AI),
  };
}