import { groupItems } from '../domain/items';
import type { Category, Item, Span } from '../domain/types';

// An embedded fixture covering every Category and display Bucket, with repeated
// values so the review screen shows multi-Occurrence rows, line-number locators,
// masking (SECRET + ID Bucket) and clear values side by side. Used by demo mode
// only (see ./flag) to exercise the full e2e flow for design review.
const FILENAME = 'support-ticket.txt';

const TEXT = `Support ticket #4471 — account escalation

Reporter: Alice Chen <alice.chen@example.com>
Phone: +1 (415) 555-0142
Opened: 2026-03-14

Alice Chen reports she cannot reach the billing dashboard at
https://dashboard.example.com/orders/4471 from her office IP 203.0.113.42.

Customer record
  Name on file:    Alice Chen
  SSN:             123-45-6789
  Card on file:    4111 1111 1111 1111
  Bank (IBAN):     GB29 NWBK 6016 1331 9268 19
  Account number:  000123456789
  Mailing address: 14 Maple Street, Springfield

Engineering notes (Bob Marsh)
  Reproduced with service token sk-live-9f8a7b6c5d4e3f2a1b0c
  Escalation acknowledged by bob@vendor.io; follow up with
  alice.chen@example.com once the patch ships.
`;

// Each value is flagged at every position it appears in TEXT. Values are chosen
// not to overlap or substring-collide, so the derived Spans are clean.
const FLAGS: ReadonlyArray<readonly [string, Category]> = [
  ['Alice Chen', 'PERSON'],
  ['Bob Marsh', 'PERSON'],
  ['alice.chen@example.com', 'EMAIL'],
  ['bob@vendor.io', 'EMAIL'],
  ['+1 (415) 555-0142', 'PHONE'],
  ['2026-03-14', 'DATE'],
  ['https://dashboard.example.com/orders/4471', 'URL'],
  ['203.0.113.42', 'IP'],
  ['123-45-6789', 'SSN'],
  ['4111 1111 1111 1111', 'CREDIT_CARD'],
  ['GB29 NWBK 6016 1331 9268 19', 'IBAN'],
  ['000123456789', 'ACCOUNT_NUMBER'],
  ['14 Maple Street, Springfield', 'ADDRESS'],
  ['sk-live-9f8a7b6c5d4e3f2a1b0c', 'SECRET'],
];

function buildSpans(text: string, flags: typeof FLAGS): Span[] {
  const spans: Span[] = [];
  for (const [value, category] of flags) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(value, from);
      if (i === -1) break;
      spans.push({ start: i, end: i + value.length, category, value });
      from = i + value.length;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

export function sampleReview(): { filename: string; text: string; items: Item[] } {
  return { filename: FILENAME, text: TEXT, items: groupItems(buildSpans(TEXT, FLAGS)) };
}
