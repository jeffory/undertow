// GRADE-UP LETTER (ui) — task t19 §4. The Keeper's License renewal: when a run's
// tribute XP pushes the grade up, an Office letter overlay is shown on the next
// hub-return (the run-end flow, after the receipt dismisses) — renewal stamped,
// per docs/story/voice.md (escalating politeness, form language). DOM only.

import type { GradeUpInfo } from '../loot/license';
import { GRADE_TITLES } from '../loot/license';

let overlayEl: HTMLDivElement | null = null;

export function showGradeUpLetter(_world: unknown, info: GradeUpInfo, onDone: () => void): void {
  if (typeof document === 'undefined') return;
  dismissGradeUpLetter();

  const root = document.createElement('div');
  root.id = 'grade-up-letter';
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #grade-up-letter {
      position: fixed; inset: 0; z-index: 95;
      display: flex; align-items: center; justify-content: center;
      background: rgba(2, 4, 6, 0.6);
      font: 13px/1.45 ui-monospace, 'Courier New', monospace;
      color: #241c12;
    }
    #grade-up-letter .invoice {
      width: 440px;
      background: #efe4c8;
      /* damp stains + cup ring, matching the run-summary paperwork grunge */
      background-image:
        radial-gradient(ellipse 120px 80px at 12% 8%, rgba(110, 82, 42, 0.12), transparent 70%),
        radial-gradient(circle 52px at 82% 84%, transparent 62%, rgba(110, 82, 42, 0.13) 68%, transparent 76%),
        linear-gradient(rgba(120, 90, 50, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(120, 90, 50, 0.05) 1px, transparent 1px);
      background-size: auto, auto, 22px 22px, 22px 22px;
      border: 1px solid #4a3a26;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 0 38px rgba(110, 82, 42, 0.08);
      padding: 22px 26px;
      transform: rotate(0.45deg);
    }
    #grade-up-letter .masthead {
      text-align: center; letter-spacing: 0.18em;
      color: #3a2c1a; font-size: 14px; font-weight: bold;
      border-bottom: 2px solid #4a3a26; padding-bottom: 6px;
    }
    #grade-up-letter .form-no {
      text-align: center; margin-top: 8px; font-size: 12px;
      letter-spacing: 0.12em; color: #7a2014; font-weight: bold;
    }
    #grade-up-letter .body { margin-top: 14px; font-size: 12px; line-height: 1.6; color: #3a2c1a; }
    #grade-up-letter .grade-line {
      margin-top: 12px; padding: 10px; border: 1px dashed #6a5638;
      text-align: center; font-weight: bold; font-size: 14px; color: #2a2012;
    }
    #grade-up-letter .ledger { margin-top: 12px; font-size: 11px; color: #5a4630; }
    #grade-up-letter .ledger div { display: flex; justify-content: space-between; }
    #grade-up-letter .stamp {
      margin: 14px 0 4px; padding: 4px 10px; display: inline-block;
      border: 2px solid #8a2014; color: #8a2014;
      border-radius: 4px 7px 3px 8px / 7px 3px 8px 4px;
      font-size: 12px; font-weight: bold; letter-spacing: 0.16em;
      transform: rotate(-4deg); opacity: 0.85;
      background: rgba(138, 32, 20, 0.05);
      box-shadow: inset 0 0 7px rgba(138, 32, 20, 0.28);
      text-shadow: 0.6px 0.6px 0 rgba(138, 32, 20, 0.35);
    }
    #grade-up-letter .accept {
      display: block; width: 100%; margin-top: 16px; padding: 8px 0;
      background: #4a3a26; color: #efe4c8; border: none; cursor: pointer;
      font: 12px/1.4 ui-monospace, monospace; letter-spacing: 0.2em;
    }
    #grade-up-letter .accept:hover { background: #5c4a30; }
  `;
  document.head.appendChild(style);

  const invoice = document.createElement('div');
  invoice.className = 'invoice';
  root.appendChild(invoice);

  const mast = document.createElement('div');
  mast.className = 'masthead';
  mast.textContent = 'THE OFFICE OF RETURNS';
  invoice.appendChild(mast);

  const form = document.createElement('div');
  form.className = 'form-no';
  form.textContent = '[NOTICE OF ELIGIBILITY — LICENSE RENEWAL]';
  invoice.appendChild(form);

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent =
    'Notice is hereby served that the custodianship of the Keeper of the Light has been reviewed, weighed by tribute, and found satisfactory. The Office is, for once, not displeased. Renewal is granted.';
  invoice.appendChild(body);

  const gradeLine = document.createElement('div');
  gradeLine.className = 'grade-line';
  gradeLine.textContent = `GRADE ${info.oldGrade} → GRADE ${info.newGrade} — ${info.title}`;
  invoice.appendChild(gradeLine);

  const ledger = document.createElement('div');
  ledger.className = 'ledger';
  const xpRow = document.createElement('div');
  xpRow.textContent = 'Tribute credited';
  const xpVal = document.createElement('span');
  xpVal.textContent = `${info.xp} MEMORIES-EQUIVALENT`;
  xpRow.appendChild(xpVal);
  ledger.appendChild(xpRow);
  const nextRow = document.createElement('div');
  nextRow.textContent = 'Next grade';
  const nextVal = document.createElement('span');
  const next = info.newGrade < 7 ? GRADE_THRESHOLDS_LABEL(info.newGrade + 1) : 'NONE ON RECORD';
  nextVal.textContent = next;
  nextRow.appendChild(nextVal);
  ledger.appendChild(nextRow);
  invoice.appendChild(ledger);

  const stampEl = document.createElement('div');
  stampEl.className = 'stamp';
  stampEl.textContent = '[RENEWAL STAMPED]';
  invoice.appendChild(stampEl);

  const accept = document.createElement('button');
  accept.className = 'accept';
  accept.textContent = 'ACKNOWLEDGED';
  accept.addEventListener('click', () => {
    dismissGradeUpLetter();
    onDone();
  });
  invoice.appendChild(accept);

  overlayEl = root;
}

function GRADE_THRESHOLDS_LABEL(grade: number): string {
  return `GRADE ${grade} — ${GRADE_TITLES[grade] ?? ''}`.trim();
}

export function dismissGradeUpLetter(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}