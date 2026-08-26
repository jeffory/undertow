// FIGHT TUTORIAL (ui) — task t22. The show/dim/dismiss state machine as a pure
// function: the DOM driver feeds fightTutorialStep one frame at a time, so the
// behaviour is testable without a document. Covers the 0→1 trigger gated by the
// seen-flag, the 2s-reel → dim, E/F/click/fight-end dismissal, and the 14s
// auto-fade.

import { describe, it, expect } from 'vitest';
import {
  fightTutorialStep,
  FIGHT_TUTORIAL_INITIAL,
  type FightTutorialFrame,
  type FightTutorialState,
} from '../../src/ui/fightTutorial';

function frame(over: Partial<FightTutorialFrame>): FightTutorialFrame {
  return {
    fightActive: false,
    justStarted: false,
    reelActive: false,
    reelDt: 0,
    elapsed: 0,
    dismissed: false,
    seen: false,
    ...over,
  };
}

describe('fightTutorialStep', () => {
  it('shows on the first-ever fight start (0→1) when un-seen', () => {
    const s = fightTutorialStep(FIGHT_TUTORIAL_INITIAL, frame({ justStarted: true }));
    expect(s.phase).toBe('shown');
    expect(s.reelSec).toBe(0);
  });

  it('does not show when the seen-flag is set', () => {
    const s = fightTutorialStep(FIGHT_TUTORIAL_INITIAL, frame({ justStarted: true, seen: true }));
    expect(s.phase).toBe('hidden');
  });

  it('ignores frames while no fight is starting', () => {
    const s = fightTutorialStep(FIGHT_TUTORIAL_INITIAL, frame({ fightActive: true }));
    expect(s.phase).toBe('hidden');
  });

  it('stays shown until 2s of active reeling, then dims', () => {
    const shown: FightTutorialState = { phase: 'shown', reelSec: 0 };
    const a = fightTutorialStep(shown, frame({ reelActive: true, reelDt: 1.2 }));
    expect(a.phase).toBe('shown');
    expect(a.reelSec).toBeCloseTo(1.2);
    const b = fightTutorialStep(a, frame({ reelActive: true, reelDt: 0.8 }));
    expect(b.phase).toBe('dimmed');
    expect(b.reelSec).toBeCloseTo(2);
    // once dimmed, further reeling stays dimmed (no un-dim)
    const c = fightTutorialStep(b, frame({ reelActive: true, reelDt: 0.5 }));
    expect(c.phase).toBe('dimmed');
  });

  it('does not accumulate reel time when not reeling', () => {
    const shown: FightTutorialState = { phase: 'shown', reelSec: 1.5 };
    const s = fightTutorialStep(shown, frame({ reelActive: false, reelDt: 1.0 }));
    expect(s.reelSec).toBeCloseTo(1.5);
    expect(s.phase).toBe('shown');
  });

  it('dismisses on the fight ending', () => {
    const shown: FightTutorialState = { phase: 'shown', reelSec: 0 };
    const s = fightTutorialStep(shown, frame({ dismissed: true }));
    expect(s.phase).toBe('gone');
  });

  it('dismisses on the 14s auto-fade', () => {
    const shown: FightTutorialState = { phase: 'shown', reelSec: 0 };
    const s = fightTutorialStep(shown, frame({ elapsed: 14 }));
    expect(s.phase).toBe('gone');
  });

  it('dimmed still dismisses (E/F/click/fight-end)', () => {
    const dimmed: FightTutorialState = { phase: 'dimmed', reelSec: 2.5 };
    const s = fightTutorialStep(dimmed, frame({ dismissed: true }));
    expect(s.phase).toBe('gone');
  });

  it('gone is terminal', () => {
    const gone: FightTutorialState = { phase: 'gone', reelSec: 0 };
    const s = fightTutorialStep(gone, frame({ justStarted: true }));
    expect(s.phase).toBe('gone');
  });
});