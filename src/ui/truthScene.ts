// THE TRUTH SCENE (ui) — the three cards, M8 boss, plan 05 §2.3: "Full reel →
// LAND → guaranteed clean catch, THE TRUTH SCENE (spec §2.4: the Mouth is a
// warden, the restored are the shocked, the 'gone home' go willingly)".
//
// PRESENTATION ONLY, in the STORY-CARDS idiom the opening six cards established
// (ui/titleScreen.ts): serif on near-black, one card at a time, dissolving
// between beats, advanced by the player. That idiom is the point of using it —
// the last time the game looked like this it was telling you what you did
// thirty years ago, and this is the same voice telling you what you have been
// doing since.
//
// What is deliberately NOT borrowed from the title screen: its key blocker and
// its localStorage. This scene happens mid-run, over the live lake, and the sim
// keeps ticking underneath exactly as the Congregation's invoice lets it —
// `world.marensEcho.truth` (active, beat, done) is sim state, advanced on the E
// edge in systems/marensEcho.ts, so a driver reads the same beat index the
// player is looking at however the frames batched, and a ?timescale run reads it
// out fast.
//
// The beats' words are content/choirLines.ts's, VERBATIM from choir.md §5.3.
//
// DOM only.

import type { WorldState } from '../core/world';
import { TRUTH_SCENE } from '../content/choirLines';

let styleEl: HTMLStyleElement | null = null;
let rootEl: HTMLDivElement | null = null;
let cardEl: HTMLDivElement | null = null;
let titleEl: HTMLDivElement | null = null;
let textEl: HTMLDivElement | null = null;
let dotsEl: HTMLDivElement | null = null;
let painted = -1;

const CSS = `
  #truth-scene {
    position: fixed; inset: 0; z-index: 120;
    display: flex; align-items: center; justify-content: center;
    background: rgba(1, 2, 3, 0.965);
    font-family: Georgia, 'Times New Roman', serif;
    color: #d8d2c4; user-select: none; pointer-events: none;
    animation: truth-in 900ms ease-out;
  }
  @keyframes truth-in { from { opacity: 0; } to { opacity: 1; } }
  #truth-scene .card {
    max-width: 34rem; padding: 2rem 2.4rem; text-align: center;
    transition: opacity 620ms ease; opacity: 1;
  }
  #truth-scene .card.dissolve { opacity: 0; }
  #truth-scene .hdr {
    font-size: 0.7rem; letter-spacing: 0.24em; color: #8e9a96;
    margin-bottom: 1.3rem; text-transform: uppercase;
  }
  #truth-scene .body { font-size: 1.04rem; line-height: 1.85; color: #e6e0d2; }
  #truth-scene .dots {
    margin-top: 2.1rem; font-size: 0.62rem; letter-spacing: 0.34em; color: #55605c;
  }
  #truth-scene .foot {
    position: fixed; bottom: 1.2rem; left: 50%; transform: translateX(-50%);
    font-size: 0.6rem; letter-spacing: 0.26em; color: #4c5652;
    font-family: ui-monospace, 'Courier New', monospace;
  }
`;

function build(): void {
  if (typeof document === 'undefined') return;
  dismissTruthScene();

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }

  const root = document.createElement('div');
  root.id = 'truth-scene';

  const card = document.createElement('div');
  card.className = 'card';
  const hdr = document.createElement('div');
  hdr.className = 'hdr';
  const body = document.createElement('div');
  body.className = 'body';
  const dots = document.createElement('div');
  dots.className = 'dots';
  card.append(hdr, body, dots);

  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.textContent = 'E — CONTINUE';

  root.append(card, foot);
  document.body.appendChild(root);

  rootEl = root;
  cardEl = card;
  titleEl = hdr;
  textEl = body;
  dotsEl = dots;
  painted = -1;
}

function paint(beat: number): void {
  if (!cardEl || !titleEl || !textEl || !dotsEl) return;
  if (beat === painted) return;
  const b = TRUTH_SCENE[Math.max(0, Math.min(TRUTH_SCENE.length - 1, beat))]!;
  const first = painted < 0;
  painted = beat;
  const write = (): void => {
    titleEl!.textContent = b.title;
    textEl!.textContent = b.text;
    dotsEl!.textContent = TRUTH_SCENE.map((_, i) => (i === beat ? '●' : '○')).join('  ');
    cardEl!.classList.remove('dissolve');
  };
  if (first) {
    write();
    return;
  }
  // Beat to beat, the card dissolves out and the next one comes up in its
  // place — the opening cards' own transition, at the same pace.
  cardEl.classList.add('dissolve');
  window.setTimeout(write, 620);
}

export function dismissTruthScene(): void {
  if (rootEl) {
    rootEl.remove();
    rootEl = null;
  }
  cardEl = null;
  titleEl = null;
  textEl = null;
  dotsEl = null;
  painted = -1;
}

/** What the scene shows right now (the gate's readout). */
export function truthSceneOnScreen(): {
  visible: boolean;
  beat: number;
  title: string;
  text: string;
} {
  const visible = !!rootEl;
  return {
    visible,
    beat: painted,
    title: visible && titleEl ? (titleEl.textContent ?? '') : '',
    text: visible && textEl ? (textEl.textContent ?? '') : '',
  };
}

/** The ui-system hook. Mirrors the sim state and nothing else. */
export function updateTruthScene(world: WorldState): void {
  if (typeof document === 'undefined') return;
  const t = world.marensEcho.truth;
  if (!t.active) {
    if (rootEl) dismissTruthScene();
    return;
  }
  if (!rootEl) build();
  paint(t.beat);
}
