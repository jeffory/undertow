// THE CONGREGATION INVOICE — the boss-climax ledger (M6, plan 05 §2.1;
// docs/story/kelp-graves.md §4). Pins the transcription (masthead, row
// template, the eight named rows at their own account numbers, the closing
// stamp) and the row builder that fills the other 39 accounts. Pure Node —
// no three, no DOM.

import { describe, it, expect } from 'vitest';
import {
  INVOICE_CLOSING_STAMP,
  INVOICE_FORM_CODE,
  INVOICE_MASTHEAD,
  INVOICE_ROW_TEMPLATE,
  INVOICE_SCHEDULE,
  INVOICE_TITLE,
  SEEDED_ACCOUNTS,
  SEEDED_ROWS,
  TOTAL_ACCOUNTS,
  buildInvoiceRows,
  invoiceRowText,
} from '../../src/content/congregationInvoice';

// '1x [SPECIES] - ledgered. Account N of 47.'
const ROW_RE = /^1x .+ - ledgered\. Account (\d+) of 47\.$/;

describe('the invoice transcription', () => {
  it('carries the masthead the story bible prints, verbatim', () => {
    expect(INVOICE_FORM_CODE).toBe('FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST');
    expect(INVOICE_TITLE).toBe('PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)');
    expect(INVOICE_SCHEDULE).toBe('THE OFFICE OF RETURNS — SCHEDULE OF BATCH DISCHARGE');
    expect(INVOICE_MASTHEAD).toEqual([
      '[FORM 47-B: AGGREGATE RECEIPT & DISCHARGE MANIFEST]',
      'PARISH OF SAINT JUDE-IN-THE-FENS (SUBMERGED OCT. 14)',
      'THE OFFICE OF RETURNS — SCHEDULE OF BATCH DISCHARGE',
    ]);
  });

  it('carries the row template and the closing stamp, verbatim', () => {
    expect(INVOICE_ROW_TEMPLATE).toBe('1x [SPECIES] - ledgered. Account N of 47.');
    expect(INVOICE_CLOSING_STAMP).toBe(
      'STAMP: ALL 47 ACCOUNTS SURRENDERED — QUORUM RESTORED — NO FURTHER SINGING PERMITTED — THE OFFICE EXTENDS CONGRATULATIONS ON YOUR HEAVY ARM',
    );
  });

  it('holds exactly the eight seeded rows, at accounts 1 / 7 / 16 / 24 / 33 / 41 / 45 / 47', () => {
    expect(SEEDED_ROWS).toHaveLength(8);
    expect([...SEEDED_ACCOUNTS]).toEqual([1, 7, 16, 24, 33, 41, 45, 47]);
    for (const row of SEEDED_ROWS) {
      expect(row.entryText, `account ${row.accountNumber}`).toMatch(ROW_RE);
      expect(row.entryText).toBe(invoiceRowText(row.speciesOrName, row.accountNumber));
      expect(row.seeded).toBe(true);
    }
  });

  it('climbs from comedy to the name — account 1 is a dog, account 47 is Ruth Oakes', () => {
    const first = SEEDED_ROWS[0]!;
    expect(first.accountNumber).toBe(1);
    expect(first.tone).toBe('absurd');
    expect(first.entryText).toBe(
      "1x Parish Basset Hound (answering faintly to 'Barnaby') - ledgered. Account 1 of 47.",
    );
    const last = SEEDED_ROWS[SEEDED_ROWS.length - 1]!;
    expect(last.accountNumber).toBe(TOTAL_ACCOUNTS);
    expect(last.tone).toBe('terminal');
    expect(last.speciesOrName).toBe('Ruth Oakes, newborn (the child Maren stayed to deliver)');
    expect(last.entryText).toBe(
      '1x Ruth Oakes, newborn (the child Maren stayed to deliver) - ledgered. Account 47 of 47.',
    );
  });
});

describe('invoice row seeding', () => {
  const rows = buildInvoiceRows(['Shroud-Ribbon', 'Pew-Shad', 'Cenotaph Perch']);

  it('reads out exactly 47 accounts, in order, ending at 47', () => {
    expect(rows).toHaveLength(TOTAL_ACCOUNTS);
    for (let i = 0; i < rows.length; i++) expect(rows[i]!.accountNumber).toBe(i + 1);
    expect(rows[rows.length - 1]!.accountNumber).toBe(47);
  });

  it('puts every named row at its own account number and nowhere else', () => {
    for (const seeded of SEEDED_ROWS) {
      const at = rows[seeded.accountNumber - 1]!;
      expect(at.entryText, `account ${seeded.accountNumber}`).toBe(seeded.entryText);
      expect(at.seeded).toBe(true);
    }
    const seededAt = rows.filter((r) => r.seeded).map((r) => r.accountNumber);
    expect(seededAt).toEqual([...SEEDED_ACCOUNTS]);
  });

  it('renders every row — seeded or filled — through the one template', () => {
    for (const row of rows) {
      const m = ROW_RE.exec(row.entryText);
      expect(m, row.entryText).not.toBeNull();
      expect(Number(m![1])).toBe(row.accountNumber);
    }
  });

  it('itemises the unseeded accounts from the burst names, cycled in order', () => {
    const filled = rows.filter((r) => !r.seeded);
    expect(filled).toHaveLength(TOTAL_ACCOUNTS - SEEDED_ROWS.length);
    expect(filled[0]!.speciesOrName).toBe('Shroud-Ribbon');
    expect(filled[1]!.speciesOrName).toBe('Pew-Shad');
    expect(filled[2]!.speciesOrName).toBe('Cenotaph Perch');
    expect(filled[3]!.speciesOrName).toBe('Shroud-Ribbon');
  });

  it('still fills the sheet when the burst supplies no names at all', () => {
    const bare = buildInvoiceRows([]);
    expect(bare).toHaveLength(TOTAL_ACCOUNTS);
    for (const row of bare) expect(row.entryText).toMatch(ROW_RE);
    expect(bare[1]!.speciesOrName).toBe('Parishioner, Unidentified (no forwarding address)');
    // the named rows survive an empty burst
    expect(bare[46]!.speciesOrName).toBe(
      'Ruth Oakes, newborn (the child Maren stayed to deliver)',
    );
  });

  it('is a pure function of its input — same names, same ledger', () => {
    const a = buildInvoiceRows(['Shroud-Ribbon', 'Pew-Shad']);
    const b = buildInvoiceRows(['Shroud-Ribbon', 'Pew-Shad']);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
