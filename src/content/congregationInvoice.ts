// THE CONGREGATION INVOICE (content) — the boss-climax ledger copy, transcribed
// VERBATIM from docs/story/kelp-graves.md §4 ("Boss Climax Overlay: The
// Congregation Invoice"). Plan 05 §2.1: "the Invoice overlay plays: ledger rows
// '1× Greywater Snook — ledgered. Account 1 of 47.' descending into silence.
// The laughter stops at row 47."
//
// The masthead, the row template, the eight seeded rows (at their own account
// numbers, 1 / 7 / 16 / 24 / 33 / 41 / 45 / 47) and the closing stamp are the
// story bible's strings unchanged — punctuation included. Only the 39 unseeded
// accounts are generated, and those are filled from names the caller supplies
// (the landing burst's own species, so the ledger itemises what you actually
// hauled) through the same row template.
//
// Pure data + one pure builder: no `three`, no DOM, no RNG. The seeding of the
// filler names lives with the boss sim (bosses/congregation.ts) so this module
// stays a transcription.

export type InvoiceTone = 'bureaucratic' | 'absurd' | 'unsettling' | 'tragic' | 'terminal';

export interface CongregationInvoiceRow {
  accountNumber: number; // 1..47
  speciesOrName: string; // specific item or resident descriptor
  entryText: string; // the rendered line: '1x [SPECIES] - ledgered. Account N of 47.'
  tone: InvoiceTone;
  seeded: boolean; // true = one of the story bible's eight named rows
}

export const INVOICE_FORM_CODE = 'FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST';
export const INVOICE_TITLE = 'PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)';
export const INVOICE_SCHEDULE = 'THE OFFICE OF RETURNS — SCHEDULE OF BATCH DISCHARGE';
export const INVOICE_ROW_TEMPLATE = '1x [SPECIES] - ledgered. Account N of 47.';
export const TOTAL_ACCOUNTS = 47;
export const INVOICE_CLOSING_STAMP =
  'STAMP: ALL 47 ACCOUNTS SURRENDERED — QUORUM RESTORED — NO FURTHER SINGING PERMITTED — THE OFFICE EXTENDS CONGRATULATIONS ON YOUR HEAVY ARM';

// The masthead, in the three lines the bible prints it in.
export const INVOICE_MASTHEAD: readonly string[] = [
  `[${INVOICE_FORM_CODE}]`,
  INVOICE_TITLE,
  INVOICE_SCHEDULE,
];

// One row, rendered through the template. The template is the contract: every
// row on the ledger — seeded or filled — reads the same way.
export function invoiceRowText(speciesOrName: string, accountNumber: number): string {
  return `1x ${speciesOrName} - ledgered. Account ${accountNumber} of ${TOTAL_ACCOUNTS}.`;
}

// The eight seeded rows, verbatim (docs/story/kelp-graves.md §4). Comedy at
// account 1; the laughter stops at 47.
export const SEEDED_ROWS: readonly CongregationInvoiceRow[] = [
  {
    accountNumber: 1,
    speciesOrName: "Parish Basset Hound (answering faintly to 'Barnaby')",
    entryText:
      "1x Parish Basset Hound (answering faintly to 'Barnaby') - ledgered. Account 1 of 47.",
    tone: 'absurd',
    seeded: true,
  },
  {
    accountNumber: 7,
    speciesOrName: "Verger's Assistant (carrying three unreturned brass collection plates)",
    entryText:
      "1x Verger's Assistant (carrying three unreturned brass collection plates) - ledgered. Account 7 of 47.",
    tone: 'bureaucratic',
    seeded: true,
  },
  {
    accountNumber: 16,
    speciesOrName: 'Pew-Renter, Fourth Row North (quarterly dues in arrears)',
    entryText:
      '1x Pew-Renter, Fourth Row North (quarterly dues in arrears) - ledgered. Account 16 of 47.',
    tone: 'bureaucratic',
    seeded: true,
  },
  {
    accountNumber: 24,
    speciesOrName: 'Second Treble, Youth Choir (refusing to drop pitch)',
    entryText:
      '1x Second Treble, Youth Choir (refusing to drop pitch) - ledgered. Account 24 of 47.',
    tone: 'unsettling',
    seeded: true,
  },
  {
    accountNumber: 33,
    speciesOrName: 'Sunday School Instructor (holding attendance book dry above water)',
    entryText:
      '1x Sunday School Instructor (holding attendance book dry above water) - ledgered. Account 33 of 47.',
    tone: 'unsettling',
    seeded: true,
  },
  {
    accountNumber: 41,
    speciesOrName: 'Silas Callow, Sexton (resisting extraction; claims nave is merely damp)',
    entryText:
      '1x Silas Callow, Sexton (resisting extraction; claims nave is merely damp) - ledgered. Account 41 of 47.',
    tone: 'tragic',
    seeded: true,
  },
  {
    accountNumber: 45,
    speciesOrName: 'Mother & Infant, Unnamed (found beneath the communion rail)',
    entryText:
      '1x Mother & Infant, Unnamed (found beneath the communion rail) - ledgered. Account 45 of 47.',
    tone: 'tragic',
    seeded: true,
  },
  {
    accountNumber: 47,
    speciesOrName: 'Ruth Oakes, newborn (the child Maren stayed to deliver)',
    entryText:
      '1x Ruth Oakes, newborn (the child Maren stayed to deliver) - ledgered. Account 47 of 47.',
    tone: 'terminal',
    seeded: true,
  },
];

// The account numbers the bible names, in order — the positions the overlay
// must never shuffle.
export const SEEDED_ACCOUNTS: readonly number[] = SEEDED_ROWS.map((r) => r.accountNumber);

const SEEDED_BY_ACCOUNT = new Map<number, CongregationInvoiceRow>(
  SEEDED_ROWS.map((r) => [r.accountNumber, r]),
);

// Tone of a filled row: the ledger's own climb, so the unseeded accounts do not
// undo the tonal ramp the seeded ones set. Deadpan municipal up to the choir,
// then quieter, then nothing funny at all.
function fillerTone(account: number): InvoiceTone {
  if (account <= 12) return 'absurd';
  if (account <= 30) return 'bureaucratic';
  if (account <= 42) return 'unsettling';
  return 'tragic';
}

// The whole ledger, accounts 1..47 in order. `fillers` supplies the names for
// the 39 unseeded accounts and is consumed cyclically (so a short list still
// fills the sheet); an empty list falls back to the Office's own placeholder,
// which is exactly what it would write.
export function buildInvoiceRows(fillers: readonly string[]): CongregationInvoiceRow[] {
  const rows: CongregationInvoiceRow[] = [];
  let fillIdx = 0;
  for (let account = 1; account <= TOTAL_ACCOUNTS; account++) {
    const seeded = SEEDED_BY_ACCOUNT.get(account);
    if (seeded) {
      rows.push(seeded);
      continue;
    }
    const name =
      fillers.length > 0
        ? fillers[fillIdx++ % fillers.length]!
        : 'Parishioner, Unidentified (no forwarding address)';
    rows.push({
      accountNumber: account,
      speciesOrName: name,
      entryText: invoiceRowText(name, account),
      tone: fillerTone(account),
      seeded: false,
    });
  }
  return rows;
}
