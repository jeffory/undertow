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
}
