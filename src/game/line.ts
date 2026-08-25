// LINE — equipped line stats (plan 02 §2.3, spec 6.1).
// M2 ships the single base line; the other three are data-only additions later,
// with their snap behaviors in the tetherConstraint snap switch from day one.

export type SnapBehavior = 'free' | 'stun' | 'damagePlayer'; // base, Bellwire, Widow's Hair

export interface LineStats {
  id: string;                // 'waxed-linen' | 'braided-sinew' | 'bellwire' | 'widows-hair'
  baseLength: number;        // L at hook-set (14 Keeper's / 9 Dredger / 20 Choirmaster)
  tensionCeiling: number;    // snap threshold (100 base; Waxed Linen +10)
  reelRate: number;          // m/s L shrinks while reeling (rod stat)
  snap: SnapBehavior;
  stunOncePerFight: boolean; // Bellwire
  exhaustMult: number;       // 1.15 (Braided Sinew) — multiplies lunge stamina cost
}

export const BASE_LINE: LineStats = {
  id: 'waxed-linen',
  baseLength: 14,
  tensionCeiling: 100,
  reelRate: 2.5,
  snap: 'free',
  stunOncePerFight: false,
  exhaustMult: 1,
};