// THE CHOIR'S COPY (content) — the zone-4 lines, plan 05 §2.3.
//
// SOURCE OF TRUTH: docs/story/choir.md, which landed mid-round. Everything the
// bible actually writes for THIS round is transcribed VERBATIM below — id, text
// and all — and only the two moments it does not write for are placeholders,
// carrying `placeholder: true` in exactly the shape content/snatcherLines.ts and
// content/envText.ts use. `loadChoirLines()` stays as the merge seam so a later
// revision of the bible is still a data swap and not a code change, and
// `choirPlaceholderCount()` is the content-budget readout (plan §6.1) that keeps
// the remaining debt visible.
//
// WHAT THE BIBLE WRITES, AND WHERE IT GOES:
//   • §4 `proximityLines` (3)  → the Whistler's three escalating bands. VERBATIM.
//   • §4 `hookLine`            → the moment it hooks you. VERBATIM.
//   • §3 `AmbientZoneLine` (6) → the void's unanchored navigation observations.
//                                Staged as data here (see CHOIR_AMBIENT below).
//   • §5 Maren's Echo — the summon marker, the four sway lines, the three-beat
//     truth scene, the snap line, the Echo's Scale, the boss bestiary record.
//     NOT THIS ROUND: Maren's Echo is a separate later round by the task's own
//     first sentence, and putting her words in before her fight exists would be
//     copy with nothing to say them.
//
// THE BAND IS THE CONTRACT. enemies/whistler.ts names a BAND (1/2/3) and this
// module owns what words that band says, so a copy revision never touches the
// sim. Same shape as the Postmaster's VERB.
//
// Pure data: no `three`, no DOM.

/** The moments the Choir speaks on. The three bands are the Whistler's. */
export type ChoirMoment =
  | 'band1' // heard: a clean two-note whistle, a long way out in the black
  | 'band2' // nearer: the whistling stops
  | 'band3' // close: it is at the edge of the light, and it knows the tune
  | 'hooked' // it has you
  | 'escaped' // you cut its line
  | 'delivered'; // it put you in the water and let go

export interface ChoirLine {
  id: string;
  moment: ChoirMoment;
  /** UI-adjacent alert, in the bark-toast idiom. The bible's audit: < 80 chars. */
  text: string;
  /** True until docs/story/choir.md carries copy for this moment. */
  placeholder: boolean;
}

/** The bible's own audit ceiling for a Whistler dread line (§2 schema). */
export const CHOIR_LINE_MAX_CHARS = 80;
/** The bible's ceiling for a zone-ambient observation (§2 schema). */
export const AMBIENT_LINE_MAX_CHARS = 140;

/** The toast's title bar once the thing has a name — after it has taken you. */
export const CHOIR_TITLE = 'THE WHISTLER';
/**
 * The title the three dread lines carry. Deliberately NOT its name: the bible's
 * whole design for the bands is "heard, not seen", and a toast that names the
 * animal before the animal is visible spends the reveal on a label.
 */
export const WHISTLER_TITLE = 'SOMETHING IS WHISTLING';
/** The stamp under a Choir toast. The Office files even this. */
export const CHOIR_STAMP = 'SCHEDULE 4-C · AUDIBLE ONLY';

const LINES: ChoirLine[] = [
  // docs/story/choir.md §4 `proximityLines`, verbatim.
  {
    id: 'whistler_dread_01',
    moment: 'band1',
    text: 'A clean two-note whistle drifts in from the black, perfectly on pitch.',
    placeholder: false,
  },
  {
    id: 'whistler_dread_02',
    moment: 'band2',
    text: 'The whistling stopped. Something is standing just beyond the tallow glow.',
    placeholder: false,
  },
  {
    id: 'whistler_dread_03',
    moment: 'band3',
    text: 'A tune you used to know, whistled through teeth that never breathe.',
    placeholder: false,
  },
  // docs/story/choir.md §4 `hookLine`, verbatim.
  {
    id: 'whistler_hook_01',
    moment: 'hooked',
    text: 'A barb bites your coat. Something in the darkness begins to reel.',
    placeholder: false,
  },
  // PLACEHOLDERS — the bible writes the three bands and the hook, and stops
  // there: it never says what happens when the Keeper WINS, or what it is like
  // when the thing lets go. House voice, inside the 80-character audit, flagged
  // so the budget readout counts the debt.
  {
    id: 'choir_moment_05',
    moment: 'escaped',
    text: 'The whistling has stopped. The Office does not record why.',
    placeholder: true,
  },
  {
    id: 'choir_moment_06',
    moment: 'delivered',
    text: 'It let go. It did not want you dead. It wanted you in the water.',
    placeholder: true,
  },
];

const byMoment = new Map<ChoirMoment, ChoirLine>(LINES.map((l) => [l.moment, l]));

/** The whole table, in declaration order (the QA / content-budget readout). */
export function choirLines(): readonly ChoirLine[] {
  return LINES;
}

/** The text for a moment. Empty string when there is none — no toast fires. */
export function choirTextFor(moment: ChoirMoment): string {
  return byMoment.get(moment)?.text ?? '';
}

/** The moment a proximity band speaks with. Bands are 1-based. */
export function bandMoment(band: number): ChoirMoment | null {
  if (band === 1) return 'band1';
  if (band === 2) return 'band2';
  if (band === 3) return 'band3';
  return null;
}

/** How many lines are still placeholders — the content-budget readout (§6.1). */
export function choirPlaceholderCount(): number {
  let n = 0;
  for (const l of LINES) if (l.placeholder) n++;
  return n;
}

/**
 * Merge a later revision of choir.md in (the same JSON shape the bible
 * publishes, the shape loadSnatcherLines already consumes). Known moments are
 * replaced, unknown ones appended; anything the file does not mention keeps what
 * it has. Returns how many rows merged.
 */
export function loadChoirLines(raw: readonly Partial<ChoirLine>[]): number {
  let merged = 0;
  for (const item of raw) {
    if (!item || typeof item.moment !== 'string' || typeof item.text !== 'string') continue;
    const moment = item.moment as ChoirMoment;
    const existing = byMoment.get(moment);
    if (existing) {
      existing.text = item.text;
      existing.placeholder = item.placeholder ?? false;
      if (typeof item.id === 'string') existing.id = item.id;
    } else {
      const entry: ChoirLine = {
        id: typeof item.id === 'string' ? item.id : `choir_moment_${LINES.length + 1}`,
        moment,
        text: item.text,
        placeholder: item.placeholder ?? false,
      };
      LINES.push(entry);
      byMoment.set(moment, entry);
    }
    merged++;
  }
  return merged;
}

// --- the zone-ambient observations (docs/story/choir.md §3) ---------------------
//
// STAGED, NOT SURFACED — and that is deliberate, stated rather than hidden.
//
// The bible renders these "as unanchored DOM text overlays as the Keeper
// navigates". That is a new presentation system (an unanchored ambient ticker
// with its own cadence and its own no-repeat rules), and it is not in this
// round's scope: the round owns the darkness, the Choir's motes, their singing,
// and the Whistler. Inventing an overlay for it here would be a feature nobody
// asked for, sitting on top of a zone whose look was only just built.
//
// So the six lines are transcribed VERBATIM now, while the bible is open, and
// the round that builds the ambient ticker reads them from here without a
// transcription pass. Nothing consumes them yet — exactly the way the town-event
// queue shipped before anything drained it.

export interface AmbientZoneLine {
  id: string;
  focus: 'rim' | 'sound' | 'emissive' | 'void' | 'choir' | 'drift';
  /** The bible's audit: strictly under 140 characters. */
  text: string;
}

export const CHOIR_AMBIENT: readonly AmbientZoneLine[] = [
  {
    id: 'ambient_choir_01',
    focus: 'rim',
    text: 'Beyond the lantern rim, there is no silt and no stone. The world only exists where the tallow reaches.',
  },
  {
    id: 'ambient_choir_02',
    focus: 'sound',
    text: 'The dark does not echo. It hums a single sustained vowel, held by three hundred throats that never draw breath.',
  },
  {
    id: 'ambient_choir_03',
    focus: 'emissive',
    text: 'The blue sparks in the black are not stars or phosphorus. They are the open mouths of the congregation, keeping time.',
  },
  {
    id: 'ambient_choir_04',
    focus: 'void',
    text: 'Your lantern light cuts a circle four yards wide. Outside it, thirty fathoms of water pretend nothing was ever built.',
  },
  {
    id: 'ambient_choir_05',
    focus: 'choir',
    text: 'A choral chord hangs in the black water, hovering a half-step flat. It does not resolve because no one has dismissed them.',
  },
  {
    id: 'ambient_choir_06',
    focus: 'drift',
    text: 'Drifting lights part as the boat glides through. They do not scatter; they make room in the choir stalls.',
  },
];
