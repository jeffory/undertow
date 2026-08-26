// ENVIRONMENTAL TEXT (content) — the Township's signage, read off the water
// (plan 05 §2.2 / §4.3, M7 round 1).
//
// SOURCE OF TRUTH: docs/story/township.md, which another worker is writing
// alongside this round. It is NOT on disk yet, so the table below is the SEAM
// with PLACEHOLDER copy in the house voice — exactly the shape content/townCopy
// .ts holds the hub in. Nothing in the sim or the UI hardcodes a line: they ask
// `envTextFor(key)`, and `loadTownshipEnvText(raw)` merges the finished
// township.md array in at runtime, so the copy pass is a data swap with no code
// change. The KEYS are the contract, and they are generated: gen/township.ts
// tags each roof with 'roof-0'…'roof-7', the church with 'steeple', the cinema
// roof with 'cinema-roof', and the wall under the surface with 'marquee'.
//
// The one line that is NOT a placeholder is the marquee. plan 05 §2.2 and §1.4
// #16 both fix it: the Lyceum's marquee still advertises SOMETHING IN THE
// WATER, the film that played the night the Hollow drowned.
//
// Pure data: no `three`, no DOM.

export interface EnvTextEntry {
  key: string;
  /** The parchment line itself. No speaker — signage does not talk to you. */
  text: string;
  /** True once township.md's own copy has replaced the placeholder. */
  placeholder: boolean;
}

// plan 05 §2.2: "the marquee still advertising SOMETHING IN THE WATER — the
// film that played that night."
export const MARQUEE_TEXT = 'SOMETHING IN THE WATER';

const ENTRIES: EnvTextEntry[] = [
  {
    key: 'marquee',
    text: 'LYCEUM CINEMA — NOW SHOWING: SOMETHING IN THE WATER. TWO SHOWINGS NIGHTLY.',
    placeholder: false,
  },
  {
    key: 'cinema-roof',
    text: 'The gutter is full of ticket stubs. They have not gone soft.',
    placeholder: true,
  },
  {
    key: 'steeple',
    text: 'The bell is still in the tower. The rope goes down into the water.',
    placeholder: true,
  },
  { key: 'roof-0', text: 'MERCER & SONS, DRY GOODS — SECOND FLOOR ENQUIRIES ONLY.', placeholder: true },
  { key: 'roof-1', text: 'A washing line, still pegged. Nothing on it has dried.', placeholder: true },
  { key: 'roof-2', text: 'NO MOORING. NO LANDING. BY ORDER OF THE PARISH.', placeholder: true },
  { key: 'roof-3', text: 'Chalk on the chimney: a height, a date, and a taller height.', placeholder: true },
  { key: 'roof-4', text: '14 WILLOW ST. The letterbox is under you, and it is full.', placeholder: true },
  { key: 'roof-5', text: 'Someone counted the slates. Someone got to forty-seven.', placeholder: true },
  { key: 'roof-6', text: 'THE DROWNED PINT — CELLAR OPEN. IT WAS ALWAYS OPEN.', placeholder: true },
  { key: 'roof-7', text: 'A ladder to the ridge. It was put here from ABOVE.', placeholder: true },
];

const byKey = new Map<string, EnvTextEntry>(ENTRIES.map((e) => [e.key, e]));

/** The whole table, in declaration order (the ledger/QA readout). */
export function townshipEnvText(): readonly EnvTextEntry[] {
  return ENTRIES;
}

/** One entry, or null when a generated key has no copy yet. */
export function envEntryFor(key: string): EnvTextEntry | null {
  return byKey.get(key) ?? null;
}

/** The line for a key. Empty string when there is none — the toast then stays down. */
export function envTextFor(key: string): string {
  return byKey.get(key)?.text ?? '';
}

/** How many entries are still placeholders — the content-budget readout (§6.1). */
export function envPlaceholderCount(): number {
  let n = 0;
  for (const e of ENTRIES) if (e.placeholder) n++;
  return n;
}

/**
 * Merge docs/story/township.md's own entries in (the same JSON shape). Unknown
 * keys are appended, known keys replaced; anything the file does not mention
 * keeps its placeholder. This is the seam the copy pass lands through.
 */
export function loadTownshipEnvText(raw: readonly Partial<EnvTextEntry>[]): number {
  let merged = 0;
  for (const item of raw) {
    if (!item || typeof item.key !== 'string' || typeof item.text !== 'string') continue;
    const entry: EnvTextEntry = {
      key: item.key,
      text: item.text,
      placeholder: item.placeholder ?? false,
    };
    const existing = byKey.get(entry.key);
    if (existing) {
      existing.text = entry.text;
      existing.placeholder = entry.placeholder;
    } else {
      ENTRIES.push(entry);
      byKey.set(entry.key, entry);
    }
    merged++;
  }
  return merged;
}
