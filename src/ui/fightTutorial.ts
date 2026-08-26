// FIGHT TUTORIAL — NOTICE 7-T: PROCEDURE FOR LINE MANAGEMENT. The Office never
// teaches the tether verbs; it files a form. A one-shot municipal instruction
// card (docs/story/voice.md) shown the first time a tether fight EVER starts
// (world.tether.fights 0→1), in the same parchment family as castPrompt's
// SET/RELEASE card and runSummary's invoice. DOM only; no sim writes. It never
// blocks input (pointer-events none except the X), dims to 40% once the player
// has reeled 2+ seconds (they've got it), and auto-fades after 14s. Shown once
// ever via localStorage 'undertow.fightTutorialSeen' (the introSeen pattern in
// ui/titleScreen.ts); __resetTutorial() clears it under ?debug.

import type { WorldState } from '../core/world';

const SEEN_KEY = 'undertow.fightTutorialSeen';
const DIM_REEL_SECONDS = 2; // reeling ≥ this while shown → dim to 40%
const AUTO_FADE_SECONDS = 14; // auto-dismiss after this long up
const DEBUG_FLAG =
  typeof location !== 'undefined' ? /[?&]debug/.test(location.search) : false;

// --- pure show/dim/dismiss state machine (unit-tested; the DOM driver feeds
// it one frame at a time) ---------------------------------------------------

export type TutorialPhase = 'hidden' | 'shown' | 'dimmed' | 'gone';

export interface FightTutorialState {
  phase: TutorialPhase;
  reelSec: number; // accumulated seconds of active reeling while shown
}

export interface FightTutorialFrame {
  fightActive: boolean; // world.tether.fights.length > 0
  justStarted: boolean; // fights went 0→1 this frame
  reelActive: boolean; // any fight is actively reeling (hold + stamina gate)
  reelDt: number; // sim seconds since the previous ui frame
  elapsed: number; // sim seconds since the card was shown
  dismissed: boolean; // E/F/click/X, or the fight ended
  seen: boolean; // localStorage guard already set
}

export const FIGHT_TUTORIAL_INITIAL: FightTutorialState = {
  phase: 'hidden',
  reelSec: 0,
};

export function fightTutorialStep(
  s: FightTutorialState,
  f: FightTutorialFrame,
): FightTutorialState {
  switch (s.phase) {
    case 'hidden':
      if (f.justStarted && !f.seen) return { phase: 'shown', reelSec: 0 };
      return s;
    case 'shown':
    case 'dimmed': {
      const reelSec = f.reelActive
        ? s.reelSec + Math.max(0, f.reelDt)
        : s.reelSec;
      if (f.dismissed || f.elapsed >= AUTO_FADE_SECONDS) {
        return { phase: 'gone', reelSec };
      }
      if (s.phase === 'shown' && reelSec >= DIM_REEL_SECONDS) {
        return { phase: 'dimmed', reelSec };
      }
      return { phase: s.phase, reelSec };
    }
    case 'gone':
      return s;
  }
}

// --- persistence -------------------------------------------------------------

function seen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode etc. — the card will just show again next boot */
  }
}

// --- DOM driver ---------------------------------------------------------------

let el: HTMLDivElement | null = null;
let state: FightTutorialState = FIGHT_TUTORIAL_INITIAL;
let shownAt: number | null = null; // world.time.elapsed when the card appeared
let lastElapsed: number | null = null; // for reel-second accumulation
let prevFightCount = 0;
let prevFightsRef: unknown = null; // reset-tracker: a fresh fights array = a new run
let liveFightsRef: unknown = null; // the most recent fights array (for reset re-base)
let liveFightCount = 0; // …and its length, so a reset mid-fight stays quiet
let clickFired = false;

function buildDom(): void {
  el = document.createElement('div');
  el.id = 'fight-tutorial';
  document.body.appendChild(el);

  const style = document.createElement('style');
  style.textContent = `
    #fight-tutorial {
      position: fixed; left: 50%; top: 56px;
      transform: translateX(-50%) rotate(-0.5deg);
      z-index: 45; width: 340px;
      background: #efe4c8;
      background-image:
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: 14px 14px;
      border: 1px solid #4a3a26;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55), inset 0 0 30px rgba(110, 82, 42, 0.08);
      padding: 12px 16px 14px;
      color: #241c12; font-family: Georgia, 'Times New Roman', serif;
      user-select: none; cursor: default;
      pointer-events: none; opacity: 1;
      transition: opacity 0.6s ease;
    }
    #fight-tutorial .ft-head {
      text-align: center; letter-spacing: 0.14em; font-size: 11px;
      font-weight: bold; color: #3a2c1a; margin-bottom: 8px;
      border-bottom: 2px solid #4a3a26; padding-bottom: 5px;
    }
    #fight-tutorial .ft-line {
      font-size: 12px; line-height: 1.5; color: #3a2c1a; margin: 3px 0;
    }
    #fight-tutorial .ft-stamp {
      display: inline-block; margin-top: 10px; padding: 3px 8px;
      border: 1.5px solid #8a2014; color: #8a2014;
      border-radius: 4px 7px 3px 8px / 7px 3px 8px 4px;
      font-size: 10px; font-weight: bold; letter-spacing: 0.14em;
      transform: rotate(-3deg); opacity: 0.85;
      background: rgba(138, 32, 20, 0.05);
    }
    #fight-tutorial .ft-x {
      position: absolute; top: 4px; right: 8px;
      background: none; border: none; color: #6a5638;
      font: 13px/1 Georgia, 'Times New Roman', serif;
      cursor: pointer; padding: 2px 4px; pointer-events: auto;
    }
    #fight-tutorial .ft-x:hover { color: #3a2c1a; }
  `;
  document.head.appendChild(style);

  const head = document.createElement('div');
  head.className = 'ft-head';
  head.textContent = 'NOTICE 7-T: PROCEDURE FOR LINE MANAGEMENT';
  el.appendChild(head);

  const lines = [
    '1. HOLD RMB to reel when the line is calm.',
    '2. RELEASE when it lunges — the gauge climbs red, near snap.',
    '3. The catch tires with every lunge.',
    '4. E lands an exhausted catch drawn close. F cuts (forfeits the lure).',
  ];
  for (const l of lines) {
    const d = document.createElement('div');
    d.className = 'ft-line';
    d.textContent = l;
    el.appendChild(d);
  }

  const stamp = document.createElement('div');
  stamp.className = 'ft-stamp';
  stamp.textContent = 'RETAIN FOR YOUR RECORDS';
  el.appendChild(stamp);

  const x = document.createElement('button');
  x.className = 'ft-x';
  x.textContent = '×';
  x.setAttribute('aria-label', 'Dismiss notice');
  el.appendChild(x);
}

function onAnyClick(): void {
  clickFired = true;
}

function showCard(): void {
  if (!el) buildDom();
  el!.style.display = 'block';
  el!.style.opacity = '1';
  window.addEventListener('click', onAnyClick);
}

function hideCard(): void {
  window.removeEventListener('click', onAnyClick);
  clickFired = false;
  if (el) {
    el.style.display = 'none';
    el.style.opacity = '1';
  }
}

export function resetFightTutorial(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
  state = FIGHT_TUTORIAL_INITIAL;
  shownAt = null;
  // If a fight is live when the reset lands, its 0→1 already happened — re-base
  // to its current count so the edge only fires on the NEXT fight start.
  prevFightCount = liveFightCount;
  prevFightsRef = liveFightsRef;
  hideCard();
}

// ?debug gate seam: wipe the seen-flag so a fresh fight re-shows the card.
if (DEBUG_FLAG && typeof window !== 'undefined') {
  (window as unknown as { __resetTutorial: () => void }).__resetTutorial =
    resetFightTutorial;
}

export function updateFightTutorial(world: WorldState): void {
  if (typeof document === 'undefined') return;

  const fights = world.tether.fights;
  // A new fights array (run reset) rebases the rising-edge tracker — otherwise
  // a stale count from the previous run would suppress the first fight of the
  // next one.
  if (prevFightsRef !== fights) {
    prevFightsRef = fights;
    prevFightCount = 0;
  }
  const fightActive = fights.length > 0;
  const justStarted = fightActive && prevFightCount === 0;
  prevFightCount = fights.length;
  liveFightsRef = fights;
  liveFightCount = fights.length;

  const elapsed = world.time.elapsed;
  const reelDt = lastElapsed === null ? 0 : Math.max(0, elapsed - lastElapsed);
  lastElapsed = elapsed;

  const reelActive = fights.some((f) => f.reel.active);
  const keyE = world.input.keys.has('KeyE');
  const keyF = world.input.keys.has('KeyF');
  const dismissed = !fightActive || keyE || keyF || clickFired;

  const frame: FightTutorialFrame = {
    fightActive,
    justStarted,
    reelActive,
    reelDt,
    elapsed:
      (state.phase === 'shown' || state.phase === 'dimmed') && shownAt !== null
        ? elapsed - shownAt
        : 0,
    dismissed,
    seen: seen(),
  };

  const prev = state;
  const next = fightTutorialStep(prev, frame);
  state = next;

  if (next.phase === 'shown' && prev.phase === 'hidden') {
    markSeen();
    shownAt = elapsed;
    showCard();
  } else if (next.phase === 'dimmed' && prev.phase === 'shown') {
    if (el) el.style.opacity = '0.4';
  } else if (next.phase === 'gone' && prev.phase !== 'gone') {
    hideCard();
  }
}