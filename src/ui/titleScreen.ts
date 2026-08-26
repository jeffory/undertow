// TITLE SCREEN + OPENING CARDS — the M2.5 shell (docs/plan/08-polish.md §1-3,
// copy verbatim from docs/story/title-menu.md and docs/story/opening.md).
// A DOM overlay over the LIVE drifting lake scene (the sim runs underneath as
// attract mode); menu items are municipal forms. FORM 1 begins a run through
// the six opening story cards; FORM 1-B (Continue) skips them once the intro
// has been seen. Esc skips the cards. Debug/gate paths (?debug, ?qa) never see
// this overlay, so every automated driver and screenshot harness is untouched.
//
// While the overlay is up, a capture-phase key blocker stops gameplay input
// from reaching game/input.ts (the overlay itself blocks the mouse) — the sim
// keeps running for the attract backdrop, the boat just receives no intent.
//
// introSeen is a UI-level convenience in localStorage (not the zod save — a
// schema bump for one boolean isn't worth a migration; noted as debt in
// qa-issues.md terms).

const INTRO_SEEN_KEY = 'undertow.introSeen';

const TAGLINES = [
  '“A black lake with no bottom. A lighthouse with no ships. An arithmetic that has never helped.”',
  '“The lake accepts tribute by weight, memory content, and struggle. Do not stop fishing.”',
  '“Forty fathoms below, four hundred souls are minding their own business. You are required to disturb them.”',
];

interface Card {
  header?: string;
  text: string;
  stamp?: string;
}

const CARDS: Card[] = [
  {
    text: 'Thirty years ago, Greywater Hollow sat in a quiet valley.\n\nThe founder built a lighthouse on the inland ridge.\n\nEveryone laughed. A keeper of a light with no ships.',
  },
  {
    text: 'The night of the storm, the reservoir rose.\n\nTen thousand downstream, or four hundred below.\n\nYou opened the spillway.\n\nThe arithmetic was correct. It has never once helped.',
  },
  {
    text: "Maren was in the Hollow, delivering the founder's granddaughter's baby.\n\nYou promised to hold the water until morning.\n\nYou did not hold the water until morning.",
  },
  {
    text: 'The official record called it a dam failure.\n\nYou kept the light burning. Habit, then penance.\n\nThirty years tending a lamp over a black lake with no bottom.',
  },
  {
    text: 'Last night, the beam swept the dark water, and something reflected back.\n\nThis morning, the first bottle washed ashore against the jetty.',
  },
  {
    header: 'SCHEDULE 1-A: NOTICE OF ELIGIBILITY',
    text: 'The below-signed resident(s) of Greywater Hollow have been assessed and may be RETURNED upon receipt of equivalent tribute. Tribute is assessed by weight, memory content, and struggle. The Office thanks you for your continued custodianship. Do not stop fishing.',
    stamp: 'ASSESSED & FILED',
  },
];

interface MenuForm {
  code: string;
  label: string;
  subtext: string;
  stamp: string;
  enabled: boolean;
  action?: () => void;
}

let root: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let taglineTimer: number | null = null;
let keyBlocker: ((e: KeyboardEvent) => void) | null = null;

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* private mode etc. — cards will just show again next boot */
  }
}

function injectStyle(): void {
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    #title-screen {
      position: fixed; inset: 0; z-index: 200;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2.2rem;
      background: radial-gradient(ellipse at 50% 62%, rgba(2,4,6,0.28) 0%, rgba(2,4,6,0.78) 78%);
      font-family: Georgia, 'Times New Roman', serif;
      color: #d8d2c4; user-select: none; cursor: default;
      transition: opacity 1.1s ease; opacity: 1;
    }
    #title-screen.fading { opacity: 0; pointer-events: none; }
    #title-screen .masthead {
      text-align: center; letter-spacing: 0.42em; font-size: 3.4rem;
      font-weight: bold; color: #e8e2d2;
      text-shadow: 0 0 26px rgba(140, 180, 190, 0.35), 0 2px 2px rgba(0,0,0,0.8);
    }
    #title-screen .sub {
      margin-top: 0.5rem; font-size: 0.72rem; letter-spacing: 0.34em;
      color: #9aa8a4; text-align: center;
    }
    #title-screen .tagline {
      min-height: 3.2em; max-width: 34rem; text-align: center;
      font-style: italic; font-size: 0.92rem; line-height: 1.55;
      color: rgba(200, 205, 195, 0.72);
      transition: opacity 1.4s ease;
    }
    #title-screen .tagline.dissolve { opacity: 0; }
    #title-screen .forms { display: flex; flex-direction: column; gap: 0.55rem; width: 26rem; }
    #title-screen .form {
      display: block; width: 100%; text-align: left;
      background: #efe4c8; color: #2a241a; border: 1px solid #b8a880;
      padding: 0.55rem 0.9rem; cursor: pointer; position: relative;
      font-family: inherit; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      transform: rotate(-0.35deg); transition: transform 0.12s ease;
    }
    #title-screen .form:nth-child(2n) { transform: rotate(0.3deg); }
    #title-screen .form:hover:not(.disabled) { transform: rotate(0deg) scale(1.02); }
    #title-screen .form.disabled { opacity: 0.48; cursor: default; filter: grayscale(0.4); }
    #title-screen .form .code { font-size: 0.62rem; letter-spacing: 0.18em; color: #6a5a3a; }
    #title-screen .form .label { font-size: 0.86rem; letter-spacing: 0.06em; font-weight: bold; margin: 0.12rem 0; }
    #title-screen .form .subtext { font-size: 0.68rem; font-style: italic; color: #5a4e38; }
    #title-screen .form .stamp {
      position: absolute; top: 0.45rem; right: 0.6rem;
      font-size: 0.58rem; letter-spacing: 0.14em; font-weight: bold;
      color: #8a2f22; border: 1.5px solid #8a2f22; padding: 0.08rem 0.3rem;
      transform: rotate(6deg); opacity: 0.75;
    }
    #title-screen .foot { font-size: 0.62rem; letter-spacing: 0.2em; color: #6a7672; }

    #story-cards {
      position: fixed; inset: 0; z-index: 210;
      display: flex; align-items: center; justify-content: center;
      background: rgba(2, 4, 6, 0.82);
      font-family: Georgia, 'Times New Roman', serif; user-select: none;
    }
    #story-cards .card {
      max-width: 30rem; padding: 2rem 2.4rem; text-align: center;
      color: #d8d2c4; font-size: 1.02rem; line-height: 1.75;
      white-space: pre-line; transition: opacity 1.1s ease; opacity: 1;
      cursor: pointer;
    }
    #story-cards .card.dissolve { opacity: 0; }
    #story-cards .card .hdr {
      font-size: 0.7rem; letter-spacing: 0.22em; color: #b8a880;
      margin-bottom: 1.2rem;
    }
    #story-cards .card .stamp {
      display: inline-block; margin-top: 1.4rem; font-size: 0.64rem;
      letter-spacing: 0.16em; font-weight: bold; color: #a8493a;
      border: 1.5px solid #a8493a; padding: 0.14rem 0.5rem; transform: rotate(-4deg);
    }
    #story-cards .skip {
      position: fixed; bottom: 1.2rem; right: 1.6rem; font-size: 0.62rem;
      letter-spacing: 0.2em; color: #5a6662;
    }
  `;
  document.head.appendChild(styleEl);
}

// Capture-phase blocker: gameplay key listeners (game/input.ts, window bubble
// phase) never see keys while a shell overlay is up. The sim keeps running.
function blockGameKeys(on: boolean): void {
  if (on && !keyBlocker) {
    keyBlocker = (e: KeyboardEvent) => {
      // let the shell's own handlers (attached beneath via bubble on the
      // overlay elements) work; block everything from reaching the game
      if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', keyBlocker, true);
    window.addEventListener('keyup', keyBlocker, true);
  } else if (!on && keyBlocker) {
    window.removeEventListener('keydown', keyBlocker, true);
    window.removeEventListener('keyup', keyBlocker, true);
    keyBlocker = null;
  }
}

function showCards(onDone: () => void): void {
  const wrap = document.createElement('div');
  wrap.id = 'story-cards';
  const card = document.createElement('div');
  card.className = 'card';
  const skip = document.createElement('div');
  skip.className = 'skip';
  skip.textContent = 'SPACE / CLICK — NEXT · ESC — SKIP';
  wrap.appendChild(card);
  wrap.appendChild(skip);
  document.body.appendChild(wrap);

  let i = 0;
  let transitioning = false;

  const render = (): void => {
    const c = CARDS[i]!;
    card.innerHTML = '';
    if (c.header) {
      const h = document.createElement('div');
      h.className = 'hdr';
      h.textContent = c.header;
      card.appendChild(h);
    }
    const t = document.createElement('div');
    t.textContent = c.text;
    card.appendChild(t);
    if (c.stamp) {
      const s = document.createElement('div');
      s.className = 'stamp';
      s.textContent = c.stamp;
      card.appendChild(s);
    }
  };

  const finish = (): void => {
    markIntroSeen();
    window.removeEventListener('keydown', onKey, true);
    wrap.remove();
    onDone();
  };

  const advance = (): void => {
    if (transitioning) return;
    if (i >= CARDS.length - 1) {
      finish();
      return;
    }
    transitioning = true;
    card.classList.add('dissolve');
    window.setTimeout(() => {
      i++;
      render();
      card.classList.remove('dissolve');
      transitioning = false;
    }, 1100);
  };

  // capture phase so the shell handler wins over the global key blocker's
  // sibling capture listener ordering (both capture: registration order wins)
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      e.stopPropagation();
      finish();
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.stopPropagation();
      advance();
    }
  };
  window.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', advance);

  render();
}

function dismissTitle(): void {
  if (!root) return;
  if (taglineTimer !== null) {
    window.clearInterval(taglineTimer);
    taglineTimer = null;
  }
  root.classList.add('fading');
  const el = root;
  root = null;
  window.setTimeout(() => {
    el.remove();
    blockGameKeys(false);
  }, 1150);
}

export function initTitleScreen(): void {
  injectStyle();
  blockGameKeys(true);

  root = document.createElement('div');
  root.id = 'title-screen';

  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'UNDERTOW';
  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent = '[ A ROGUELITE ARPG OF MUNICIPAL RECLAMATION ]';
  mast.appendChild(sub);

  const tagline = document.createElement('div');
  tagline.className = 'tagline';
  let tIdx = 0;
  tagline.textContent = TAGLINES[0]!;
  taglineTimer = window.setInterval(() => {
    tagline.classList.add('dissolve');
    window.setTimeout(() => {
      tIdx = (tIdx + 1) % TAGLINES.length;
      tagline.textContent = TAGLINES[tIdx]!;
      tagline.classList.remove('dissolve');
    }, 1400);
  }, 8000);

  const begin = (skipCards: boolean): void => {
    dismissTitle();
    if (!skipCards) {
      // cards keep the key blocker semantics themselves (capture handlers)
      blockGameKeys(true);
      showCards(() => blockGameKeys(false));
    }
  };

  const seen = introSeen();
  const forms: MenuForm[] = [
    {
      code: 'FORM 1',
      label: 'RESUMPTION OF CUSTODIAL DUTIES',
      subtext: 'Row into the basin. Standard tribute tariffs apply.',
      stamp: 'ISSUED',
      enabled: true,
      action: () => begin(false),
    },
    {
      code: 'FORM 1-B',
      label: 'CONTINUATION OF SERVICE (AMENDED)',
      subtext: 'Load existing logbook from Sluice House register.',
      stamp: seen ? 'ACTIVE' : 'NO RECORD',
      enabled: seen,
      action: () => begin(true),
    },
    {
      code: 'CIRCULAR 4',
      label: 'ADJUSTMENT OF GAUGES & TOLERANCES',
      subtext: 'Configure visual scales, acoustic levels, and line tension palettes.',
      stamp: 'PENDING REVIEW',
      enabled: false,
    },
    {
      code: 'FORM 99',
      label: 'SUSPENSION OF CUSTODIAL ATTENDANCE',
      subtext: 'Douse the lamp. The water will continue in your absence.',
      stamp: 'STANDBY',
      enabled: false,
    },
  ];

  const menu = document.createElement('div');
  menu.className = 'forms';
  for (const f of forms) {
    const b = document.createElement('button');
    b.className = `form${f.enabled ? '' : ' disabled'}`;
    b.innerHTML = '';
    const code = document.createElement('div');
    code.className = 'code';
    code.textContent = f.code;
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = f.label;
    const subtext = document.createElement('div');
    subtext.className = 'subtext';
    subtext.textContent = f.subtext;
    const stamp = document.createElement('div');
    stamp.className = 'stamp';
    stamp.textContent = f.stamp;
    b.append(code, label, subtext, stamp);
    if (f.enabled && f.action) b.addEventListener('click', f.action);
    menu.appendChild(b);
  }

  const foot = document.createElement('div');
  foot.className = 'foot';
  foot.textContent = 'THE OFFICE OF RETURNS · GREYWATER HOLLOW';

  root.append(mast, tagline, menu, foot);
  document.body.appendChild(root);
}
