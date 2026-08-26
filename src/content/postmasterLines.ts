// THE POSTMASTER'S DELIVERY LINES (content) — the zone-3 boss's speech-bubble
// telegraphs (plan 05 §2.2, docs/story/township.md §5 "The Postmaster").
//
// SOURCE OF TRUTH: docs/story/township.md §5, whose eight `postmaster_*` rows
// are transcribed VERBATIM below — id, verb, line and `isCanonical` unchanged,
// full stops included. Three are the plan's own canonical telegraphs (SPECIAL
// DELIVERY. / RETURN TO SENDER. / SIGN HERE.); five are the courtesies that
// make the comedy work.
//
// THE VERB IS THE CONTRACT. The bible tags every line with the boss verb it
// belongs to, and that tag is what the fight actually dispatches on — the sim
// never names a line, it names a VERB:
//
//   REVERSE_PULL / LINE_WHIP / HAZARD_DRAG  the three canonical route-drags,
//                                           rotated (see `canonicalVerbAt`);
//   APPROACH                                he arrives and takes you on;
//   TENSION_SPIKE                           his twine comes up to the ceiling;
//   REPOSITION                              he walks the line to a new station;
//   BRACE_CHECK                             you set your feet against a drag;
//   STAGE_TRANSITION                        the street closes over your head.
//
// So the copy pass is a data swap and the fight is unchanged by it, exactly the
// way content/envText.ts and content/snatcherLines.ts hold their own copy.
//
// Also here, verbatim: the boss's bestiary silhouette/entry (consumed by
// data/bestiaryText.ts) is NOT — that lives with the other records — but the
// FORWARDING ADDRESS drop text is, because nothing else owns it.
//
// Pure data: no `three`, no DOM.

/** The boss verbs the bible tags its lines with. */
export type PostmasterVerb =
  | 'REVERSE_PULL'
  | 'LINE_WHIP'
  | 'HAZARD_DRAG'
  | 'APPROACH'
  | 'TENSION_SPIKE'
  | 'REPOSITION'
  | 'BRACE_CHECK'
  | 'STAGE_TRANSITION';

export interface PostmasterLine {
  id: string;
  verb: PostmasterVerb;
  /** The speech-bubble card itself. The bible's audit: ≤ 60 characters. */
  line: string;
  /** True for the three telegraphs plan 05 §2.2 fixes by name. */
  isCanonical: boolean;
}

/** The bible's own ceiling for a bubble card (all eight rows are ≤ 37). */
export const BUBBLE_LINE_MAX_CHARS = 60;

/** The bubble's title bar — courteous, municipal, and not a resident. */
export const POSTMASTER_TITLE = 'THE POSTMASTER';

// docs/story/township.md §5 "Dialogue & Speech-Bubble Telegraphs", verbatim.
const LINES: PostmasterLine[] = [
  { id: 'postmaster_telegraph_01', verb: 'REVERSE_PULL', line: 'SPECIAL DELIVERY.', isCanonical: true },
  { id: 'postmaster_telegraph_02', verb: 'LINE_WHIP', line: 'RETURN TO SENDER.', isCanonical: true },
  { id: 'postmaster_telegraph_03', verb: 'HAZARD_DRAG', line: 'SIGN HERE.', isCanonical: true },
  {
    id: 'postmaster_courtesy_04',
    verb: 'APPROACH',
    line: 'POSTAGE DUE UPON RECEIPT.',
    isCanonical: false,
  },
  {
    id: 'postmaster_courtesy_05',
    verb: 'TENSION_SPIKE',
    line: 'PLEASE INITIAL THE MARGIN.',
    isCanonical: false,
  },
  {
    id: 'postmaster_courtesy_06',
    verb: 'REPOSITION',
    line: 'FORWARDING SERVICE REQUESTED.',
    isCanonical: false,
  },
  {
    id: 'postmaster_courtesy_07',
    verb: 'BRACE_CHECK',
    line: 'FRAGILE: DO NOT BEND.',
    isCanonical: false,
  },
  {
    id: 'postmaster_courtesy_08',
    verb: 'STAGE_TRANSITION',
    line: 'SIGNATURE REQUIRED UPON SUBMERSION.',
    isCanonical: false,
  },
];

const byVerb = new Map<PostmasterVerb, PostmasterLine>(LINES.map((l) => [l.verb, l]));

/**
 * The canonical telegraph verbs, in the bible's own declaration order. The
 * route-drag rotation walks this list, so the rotation is copy-driven: if the
 * story pass reorders (or re-flags) the canonical rows, the fight follows.
 * Computed on call rather than frozen at import, so `loadPostmasterLines` is a
 * real seam and not a half-seam.
 */
export function canonicalVerbs(): PostmasterVerb[] {
  return LINES.filter((l) => l.isCanonical).map((l) => l.verb);
}

/** The whole table, in declaration order (the QA / content-budget readout). */
export function postmasterLines(): readonly PostmasterLine[] {
  return LINES;
}

/** The line for a verb, or null when the bible writes none. */
export function postmasterLineFor(verb: PostmasterVerb): PostmasterLine | null {
  return byVerb.get(verb) ?? null;
}

/** The card text for a verb. Empty string when there is none — no bubble shows. */
export function postmasterTextFor(verb: PostmasterVerb): string {
  return byVerb.get(verb)?.line ?? '';
}

/**
 * The canonical verb for route-drag number `index`, starting the rotation at
 * `start`. Pure: the fight's only job is to hold the two integers.
 */
export function canonicalVerbAt(index: number, start = 0): PostmasterVerb {
  const verbs = canonicalVerbs();
  const n = verbs.length;
  if (n === 0) return 'REVERSE_PULL';
  const i = (((index + start) % n) + n) % n;
  return verbs[i]!;
}

/** How many rows are still placeholders. Zero — the bible shipped all eight. */
export function postmasterPlaceholderCount(): number {
  return 0;
}

// --- the drop ---------------------------------------------------------------------
// docs/story/township.md §5 "Boss Drop: Story Item Description", verbatim. The
// address is a META fact (save/schemas.ts `metaState.forwardingAddress`), not a
// sundry — it is the Office's own notification that it now knows where you live.

export const FORWARDING_ADDRESS_ID = 'forwarding-address';
export const FORWARDING_ADDRESS_NAME = 'District Forwarding Address';
export const FORWARDING_ADDRESS_HEADER = 'SCHEDULE 3-P: NOTIFICATION OF PERMANENT ADDRESS';
export const FORWARDING_ADDRESS_TEXT =
  "A water-damaged parcel slip written in faded purple pencil: 'The Keeper, Sluice House No. 1, " +
  "Greywater Basin. All future correspondence to be tendered directly.' The Post Office on dry " +
  'land can now resume direct sorting.';

/**
 * Merge township.md's own rows in (the same JSON shape the bible publishes:
 * `{ id, verb, line, isCanonical }`). Known verbs are replaced, unknown ones
 * appended. Returns how many rows merged.
 */
export function loadPostmasterLines(raw: readonly Partial<PostmasterLine>[]): number {
  let merged = 0;
  for (const item of raw) {
    if (!item || typeof item.verb !== 'string' || typeof item.line !== 'string') continue;
    const verb = item.verb as PostmasterVerb;
    const existing = byVerb.get(verb);
    if (existing) {
      existing.line = item.line;
      if (typeof item.id === 'string') existing.id = item.id;
      if (typeof item.isCanonical === 'boolean') existing.isCanonical = item.isCanonical;
    } else {
      const entry: PostmasterLine = {
        id: typeof item.id === 'string' ? item.id : `postmaster_line_${LINES.length + 1}`,
        verb,
        line: item.line,
        isCanonical: item.isCanonical ?? false,
      };
      LINES.push(entry);
      byVerb.set(verb, entry);
    }
    merged++;
  }
  return merged;
}
