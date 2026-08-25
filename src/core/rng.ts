// PCG32 — deterministic seeded pseudorandom generator (spec 8.3, plan 03).
// Small, correct, u32-state only. Reserved for layout/loot/AI streams (03/04).
// The seed is stored on WorldState so a run is reproducible (shared "daily lake").

const MULT = 6364136223846793005n;

export class Rng {
  private state: bigint;
  private inc: bigint;

  constructor(seed: number) {
    this.state = 0n;
    this.inc = (BigInt(seed) << 1n | 1n) & 0xffffffffn;
    this.nextU32();
    this.state = this.state + BigInt(seed);
    this.nextU32();
  }

  nextU32(): number {
    const old = this.state;
    this.state = (old * MULT + this.inc) & 0xffffffffffffffffn;
    const xorshifted = Number(((old >> 18n) ^ old) >> 27n) >>> 0;
    const rot = Number(old >> 59n) >>> 0;
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  nextFloat(): number {
    return this.nextU32() / 4294967296;
  }

  // --- plan 03 §1.1 convenience surface (deterministic, u32-backed) ---------

  // [a, b)
  range(a: number, b: number): number {
    return a + this.nextFloat() * (b - a);
  }

  // inclusive int in [a, b]
  int(a: number, b: number): number {
    return a + Math.floor(this.nextFloat() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)]!;
  }

  // Fisher-Yates on a copy; the input is never mutated.
  shuffle<T>(arr: T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  }

  // Derive a child stream without touching the parent (plan 03 §1.1): the child
  // seed is a 32-bit fold of the parent's current state + salt. Deterministic.
  fork(salt: number): Rng {
    const mixed = (this.state ^ BigInt((salt >>> 0) * 2654435761)) & 0xffffffffn;
    return new Rng(Number(mixed) >>> 0);
  }
}
