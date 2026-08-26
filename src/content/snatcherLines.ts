// SNATCHER MOMENT LINES (content) — the second mouth's UI-adjacent alerts
// (plan 05 §2.2, docs/story/township.md §6 "Second Mouth on the Line").
//
// SOURCE OF TRUTH: docs/story/township.md, whose three `SnatcherMomentLine`
// rows are transcribed VERBATIM below — id, trigger and text unchanged, right
// down to the full stops. They are rendered in the bark-toast idiom
// (ui/barkOverlay.ts), which is where the "< 80 characters" audit in the story
// bible is actually spent: a parchment note over the tension gauge.
//
// THE FOURTH MOMENT: the bible writes lines for intercept / splitTension /
// stolenCatch — the three moments where the Snatcher WINS something. It writes
// none for the moment the keeper kills it. Rather than put words in the story
// worker's mouth, the kill line is carried here as a PLACEHOLDER in the same
// shape and with the same `placeholder: true` flag content/envText.ts uses, and
// `loadSnatcherLines()` is the seam the finished copy lands through — a data
// swap, no code change. `snatcherPlaceholderCount()` is the content-budget
// readout (§6.1) that keeps the debt visible until it is paid.
//
// Pure data: no `three`, no DOM.

/** The four moments the toast fires on. The first three are the bible's own. */
export type SnatcherMoment = 'intercept' | 'splitTension' | 'stolenCatch' | 'killed';

export interface SnatcherMomentLine {
  id: string;
  trigger: SnatcherMoment;
  /** UI-adjacent alert. The bible's audit: strictly under 80 characters. */
  text: string;
  /** True until docs/story/township.md carries copy for this moment. */
  placeholder: boolean;
}

/** The bible's own audit ceiling for a moment line. */
export const MOMENT_LINE_MAX_CHARS = 80;

/** The toast's title bar — the animal, not a resident. */
export const SNATCHER_TITLE = 'GALLOWS SNATCHER';

const LINES: SnatcherMomentLine[] = [
  {
    id: 'snatcher_moment_01',
    trigger: 'intercept',
    text: 'A second mouth has taken the line. Split tension detected.',
    placeholder: false,
  },
  {
    id: 'snatcher_moment_02',
    trigger: 'splitTension',
    text: 'The catch is contested. The Snatcher requests its share.',
    placeholder: false,
  },
  {
    id: 'snatcher_moment_03',
    trigger: 'stolenCatch',
    text: 'Two mouths on one hook. Neither intends to let go.',
    placeholder: false,
  },
  {
    // PLACEHOLDER — township.md writes no kill line. House voice, Office idiom,
    // inside the 80-character audit, flagged so the budget readout counts it.
    id: 'snatcher_moment_04',
    trigger: 'killed',
    text: 'The second mouth has been closed. The audit is withdrawn.',
    placeholder: true,
  },
];

const byTrigger = new Map<SnatcherMoment, SnatcherMomentLine>(LINES.map((l) => [l.trigger, l]));

/** The whole table, in declaration order (the QA / content-budget readout). */
export function snatcherLines(): readonly SnatcherMomentLine[] {
  return LINES;
}

/** The line for a moment, or null when nothing is written for it. */
export function snatcherLineFor(trigger: SnatcherMoment): SnatcherMomentLine | null {
  return byTrigger.get(trigger) ?? null;
}

/** The text for a moment. Empty string when there is none — the toast stays down. */
export function snatcherTextFor(trigger: SnatcherMoment): string {
  return byTrigger.get(trigger)?.text ?? '';
}

/** How many moments are still placeholders — the content-budget readout (§6.1). */
export function snatcherPlaceholderCount(): number {
  let n = 0;
  for (const l of LINES) if (l.placeholder) n++;
  return n;
}

/**
 * Merge township.md's own rows in (the same JSON shape the bible publishes).
 * Known triggers are replaced, unknown ones appended; anything the file does
 * not mention keeps what it has. Returns how many rows merged.
 */
export function loadSnatcherLines(raw: readonly Partial<SnatcherMomentLine>[]): number {
  let merged = 0;
  for (const item of raw) {
    if (!item || typeof item.trigger !== 'string' || typeof item.text !== 'string') continue;
    const trigger = item.trigger as SnatcherMoment;
    const existing = byTrigger.get(trigger);
    if (existing) {
      existing.text = item.text;
      existing.placeholder = item.placeholder ?? false;
      if (typeof item.id === 'string') existing.id = item.id;
    } else {
      const entry: SnatcherMomentLine = {
        id: typeof item.id === 'string' ? item.id : `snatcher_moment_${LINES.length + 1}`,
        trigger,
        text: item.text,
        placeholder: item.placeholder ?? false,
      };
      LINES.push(entry);
      byTrigger.set(trigger, entry);
    }
    merged++;
  }
  return merged;
}
