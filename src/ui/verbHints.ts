// VERB HINTS — the missing first links of the catch funnel (USER playtest:
// "I still don't understand how to catch a fish"). NOTICE 7-T teaches the
// FIGHT, but nothing ever taught the chain before it: that the ripple rings
// ARE fish, that LMB on them casts, that the bite is coming. One small
// municipal chip above the tension-gauge slot walks the player through:
//
//   ripples in range  ->  "RIPPLES OFF THE BOW - LMB ON THE RINGS: CAST"
//   cast made, biting ->  "SOMETHING IS CONSIDERING THE LURE - HOLD"
//   (prompt window)   ->  nothing here; the SET/RELEASE card owns that beat
//   fight, landable   ->  "THE CATCH IS SPENT - E: LAND IT"
//
// DOM only, change-gated writes, driven from the ui phase.

import type { WorldState } from '../core/world';
import { CAST_RANGE, withinRange } from '../run/disturbance';

let el: HTMLDivElement | null = null;
let styleEl: HTMLStyleElement | null = null;
let curText = '';

function ensureDom(): void {
  if (el) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
    #verb-hint {
      position: fixed; bottom: 108px; left: 50%; transform: translateX(-50%) rotate(-0.3deg);
      background: #efe4c8; color: #3a2c1a; border: 1px solid #b8a880;
      padding: 5px 14px; font: 11px/1.4 Georgia, serif; letter-spacing: 0.12em;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5); pointer-events: none; z-index: 24;
      transition: opacity 0.4s ease; opacity: 0;
    }
    #verb-hint.on { opacity: 0.92; }
  `;
  document.head.appendChild(styleEl);
  el = document.createElement('div');
  el.id = 'verb-hint';
  document.body.appendChild(el);
}

function hintFor(world: WorldState): string {
  const fight = world.tether.fights[0];
  if (fight) {
    return fight.land.eligible ? 'THE CATCH IS SPENT — E: LAND IT' : '';
  }
  if (world.run.promptId != null) return ''; // the SET/RELEASE card owns this beat
  const biting = world.disturbances.some((d) => d.state === 'biting');
  if (biting) return 'SOMETHING IS CONSIDERING THE LURE — HOLD';
  const foot = world.mode === 'foot';
  const caster = foot
    ? { x: world.player.x, z: world.player.z }
    : { x: world.boat.x, z: world.boat.z };
  const near = world.disturbances.some(
    (d) => d.state === 'idle' && withinRange(caster, d.pos, CAST_RANGE)
  );
  if (near) {
    return foot
      ? 'RIPPLES OFF THE SHORE — LMB ON THE RINGS: CAST'
      : 'RIPPLES OFF THE BOW — LMB ON THE RINGS: CAST';
  }
  return '';
}

export function updateVerbHints(world: WorldState): void {
  ensureDom();
  const text = hintFor(world);
  if (text === curText) return;
  curText = text;
  el!.textContent = text;
  el!.classList.toggle('on', text.length > 0);
}
