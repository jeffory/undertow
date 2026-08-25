// KEEPER'S LICENSE (loot) — plan 04 §8, task t19. Tribute XP accrues in the
// save (30% banked on death); Grades 1–7 thresholds gate nothing yet except
// display (bite-eligibility arrives with deeper zones). Passives wire where the
// systems exist: G2 +10 stamina max, G4 +10% brace, G5 +5% Memories.
//
// Thresholds (plan §8.3): G2 120 · G3 300 · G4 560 · G5 900 · G6 1350 · G7 1900.
//
// Pure logic: no `three` imports.

import type { WorldState } from '../core/world';
import type { RunResult, SaveGame } from '../save/schemas';

export const MAX_GRADE = 7;

// GRADE_THRESHOLDS[grade] = cumulative XP required to BE that grade (index 0/1
// are 0 — everyone starts at Grade 1, Probationary Keeper).
export const GRADE_THRESHOLDS = [0, 0, 120, 300, 560, 900, 1350, 1900];

export const GRADE_TITLES = [
  '',
  'Probationary Keeper',
  'Keeper (Provisional)',
  'Keeper, Licensed',
  'Senior Keeper',
  'Warden-Adjacent',
  'Custodian, First Class',
  '*[title redacted; wet ring stamp]*',
];

export interface LicenseState {
  grade: number; // 1..7
  xp: number;
}

export interface GradeUpInfo {
  oldGrade: number;
  newGrade: number;
  xp: number;
  title: string;
}

export function gradeForXp(xp: number): number {
  let g = 1;
  for (let i = 2; i <= MAX_GRADE; i++) {
    if (xp >= GRADE_THRESHOLDS[i]!) g = i;
  }
  return g;
}

export function nextThreshold(xp: number): number | null {
  const g = gradeForXp(xp);
  if (g >= MAX_GRADE) return null;
  return GRADE_THRESHOLDS[g + 1]!;
}

// The grade-up check the run terminal uses: would this run's tribute XP push the
// save's license over a threshold? Returns the renewal info, or null.
export function gradeUpForRun(save: SaveGame, result: RunResult): GradeUpInfo | null {
  const xp = save.license.xp + result.xpTotal;
  const grade = gradeForXp(xp);
  if (grade <= save.license.grade) return null;
  return { oldGrade: save.license.grade, newGrade: grade, xp, title: GRADE_TITLES[grade]! };
}

// Passives applied at run start (a fresh world is mutated in place). Multipliers
// stack multiplicatively with each other and with trinket effects (applyTrinkets
// runs after this in applyRunStartPassives).
export function applyLicensePassives(world: WorldState, grade: number): void {
  if (grade >= 2) {
    world.player.maxStamina += 10; // G2 — +10 stamina max
    world.player.stamina = world.player.maxStamina;
  }
  if (grade >= 4) {
    world.tuning.braceEfficacy = Math.min(1, world.tuning.braceEfficacy * 1.1); // G4 — +10% brace
  }
  if (grade >= 5) {
    world.run.memoriesMult *= 1.05; // G5 — +5% Memories
  }
}