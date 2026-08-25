// LICENSE — tests-first (plan 04 §8, task t19 §4). Pins the grade thresholds
// (G2 120 · G3 300 · G4 560 · G5 900 · G6 1350 · G7 1900), the passive hooks
// (G2 +10 stamina max, G4 +10% brace, G5 +5% Memories), the 30%-death XP that
// accrues in the save, and the grade-up detection used by the run terminal.

import { describe, it, expect } from 'vitest';
import { createWorld } from '../../src/core/world';
import {
  GRADE_THRESHOLDS,
  MAX_GRADE,
  gradeForXp,
  nextThreshold,
  applyLicensePassives,
  gradeUpForRun,
} from '../../src/loot/license';
import { freshSave, applyRunResult } from '../../src/save/migrate';
import type { RunResult } from '../../src/save/schemas';

const result = (xpTotal: number, extra: Partial<RunResult> = {}): RunResult => ({
  seed: 1,
  source: 'random',
  clockPhaseEnd: 'dusk',
  haul: [],
  extracted: true,
  memoriesTotal: xpTotal,
  xpTotal,
  dreadPeak: 0,
  startedAtDread: 0,
  draggersLand: 0,
  bagmanCaught: false,
  sinkholesDescended: 0,
  ...extra,
});

describe('grade thresholds', () => {
  it('the cumulative thresholds match the plan pace table exactly', () => {
    expect(GRADE_THRESHOLDS).toEqual([0, 0, 120, 300, 560, 900, 1350, 1900]);
    expect(MAX_GRADE).toBe(7);
  });

  it('gradeForXp hits the boundaries exactly', () => {
    expect(gradeForXp(0)).toBe(1);
    expect(gradeForXp(119)).toBe(1);
    expect(gradeForXp(120)).toBe(2);
    expect(gradeForXp(299)).toBe(2);
    expect(gradeForXp(300)).toBe(3);
    expect(gradeForXp(560)).toBe(4);
    expect(gradeForXp(900)).toBe(5);
    expect(gradeForXp(1350)).toBe(6);
    expect(gradeForXp(1900)).toBe(7);
    expect(gradeForXp(5000)).toBe(7);
  });

  it("nextThreshold reports the next grade's XP (null at max grade)", () => {
    expect(nextThreshold(0)).toBe(120);
    expect(nextThreshold(120)).toBe(300);
    expect(nextThreshold(1900)).toBeNull();
  });
});

describe('applyLicensePassives (where the systems exist)', () => {
  it('G2 grants +10 stamina max (and refills the pool)', () => {
    const w = createWorld(1);
    expect(w.player.maxStamina).toBe(100);
    applyLicensePassives(w, 2);
    expect(w.player.maxStamina).toBe(110);
    expect(w.player.stamina).toBe(110);
  });

  it('G4 grants +10% brace efficacy (0.6 → 0.66, capped at 1)', () => {
    const w = createWorld(1);
    expect(w.tuning.braceEfficacy).toBe(0.6);
    applyLicensePassives(w, 4);
    expect(w.tuning.braceEfficacy).toBeCloseTo(0.66, 9);
    const high = createWorld(1);
    high.tuning.braceEfficacy = 0.98;
    applyLicensePassives(high, 4);
    expect(high.tuning.braceEfficacy).toBe(1);
  });

  it('G5 grants +5% Memories (the extraction multiplier)', () => {
    const w = createWorld(1);
    expect(w.run.memoriesMult).toBe(1);
    applyLicensePassives(w, 5);
    expect(w.run.memoriesMult).toBeCloseTo(1.05, 9);
  });

  it('grade 1 grants nothing', () => {
    const w = createWorld(1);
    applyLicensePassives(w, 1);
    expect(w.player.maxStamina).toBe(100);
    expect(w.tuning.braceEfficacy).toBe(0.6);
    expect(w.run.memoriesMult).toBe(1);
  });
});

describe('tribute XP accrual + grade-up', () => {
  it('applyRunResult banks the run XP into the license and recomputes the grade', () => {
    const save = freshSave();
    const next = applyRunResult(save, result(130));
    expect(next.license.xp).toBe(130);
    expect(next.license.grade).toBe(2);
  });

  it('a 30% death run banks the condolence XP (the save accrues it)', () => {
    const save = freshSave();
    const death = result(0, { extracted: false, xpTotal: 9, memoriesTotal: 9 });
    const next = applyRunResult(save, death);
    expect(next.license.xp).toBe(9);
    expect(next.license.grade).toBe(1);
  });

  it('XP accumulates across runs and thresholds only fire cumulatively', () => {
    let save = freshSave();
    save = applyRunResult(save, result(70));
    save = applyRunResult(save, result(70));
    expect(save.license.xp).toBe(140);
    expect(save.license.grade).toBe(2);
  });

  it('gradeUpForRun returns the renewal info only when the run crosses a threshold', () => {
    const save = { ...freshSave(), license: { grade: 1, xp: 115 } };
    expect(gradeUpForRun(save, result(0))).toBeNull();
    const up = gradeUpForRun(save, result(5));
    expect(up).not.toBeNull();
    expect(up!.oldGrade).toBe(1);
    expect(up!.newGrade).toBe(2);
    expect(up!.xp).toBe(120);
  });

  it('grade-up is capped at grade 7', () => {
    const save = { ...freshSave(), license: { grade: 7, xp: 1900 } };
    expect(gradeUpForRun(save, result(10000))).toBeNull();
    expect(save.license.grade).toBe(7);
  });
});