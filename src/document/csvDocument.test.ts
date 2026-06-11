import { describe, expect, it } from 'vitest';
import { createCsvDocument } from './csvDocument';
import { parseCsv } from '../csv/csvParser';
import { spansToItems } from '../domain/items';
import type { Span } from '../domain/types';

// Build EMAIL spans for every verbatim occurrence of `value` in the Document's
// flattened text, the way Detect would, so the adapter is exercised through its
// interface rather than its internals.
function emailSpans(text: string, value: string): Span[] {
  const spans: Span[] = [];
  for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + value.length)) {
    spans.push({ start: i, end: i + value.length, category: 'EMAIL', value });
  }
  return spans;
}

describe('CsvDocument', () => {
  it('exposes text-source capabilities (mapping allowed, no safety warning)', () => {
    const doc = createCsvDocument('contacts.csv', 'name,email\nAlice,a@x.com');
    expect(doc.allowMapping).toBe(true);
    expect(doc.safetyWarning).toBeUndefined();
  });

  it('locates an Item by physical row/column, not line numbers, ignoring the header row', () => {
    // PII sits on the first data row (physical row 2), email column (col 2).
    const doc = createCsvDocument('contacts.csv', 'name,email\nAlice,jane@x.com');
    const [item] = spansToItems(emailSpans(doc.text, 'jane@x.com'));
    expect(doc.locate(item)).toBe('row 2, col 2');
  });

  it('collapses a value repeated down a column into one Item with both rows', () => {
    const csv = 'id,name,email\n1,Alice,alice@x.com\n2,Bob,bob@x.com\n3,Carol,carol@x.com\n4,Dan,alice@x.com';
    const doc = createCsvDocument('contacts.csv', csv);
    const [item] = spansToItems(emailSpans(doc.text, 'alice@x.com'));
    // alice@x.com appears in row 2 and row 5, both in col 3.
    expect(doc.locate(item)).toBe('row 2, col 3, 5');
  });

  it('redacts inside the affected cell only, preserving a quoted comma in another cell', async () => {
    const doc = createCsvDocument('contacts.csv', '"Smith, Jo",jane@x.com');
    const spans = emailSpans(doc.text, 'jane@x.com');
    const outcome = await doc.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.outputName).toBe('contacts.redacted.csv');
    // Output re-parses as valid CSV: col 1 keeps its embedded comma, col 2 is tokenised.
    const grid = parseCsv(await outcome.blob.text());
    expect(grid).toEqual([['Smith, Jo', '<EMAIL_1>']]);
  });

  it('keeps an embedded newline in one cell while redacting another independently', async () => {
    const doc = createCsvDocument('notes.csv', '"line1\nline2",secret@x.com');
    const spans = emailSpans(doc.text, 'secret@x.com');
    const outcome = await doc.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const grid = parseCsv(await outcome.blob.text());
    expect(grid).toEqual([['line1\nline2', '<EMAIL_1>']]);
  });

  it('redacts every occurrence of a repeated value with the same Token', async () => {
    const csv = 'id,email\n1,alice@x.com\n2,bob@x.com\n3,alice@x.com';
    const doc = createCsvDocument('contacts.csv', csv);
    const spans = [
      ...emailSpans(doc.text, 'alice@x.com'),
      ...emailSpans(doc.text, 'bob@x.com'),
    ];
    const outcome = await doc.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const grid = parseCsv(await outcome.blob.text());
    expect(grid).toEqual([
      ['id', 'email'],
      ['1', '<EMAIL_1>'],
      ['2', '<EMAIL_2>'],
      ['3', '<EMAIL_1>'],
    ]);
  });

  it('emits a Mapping sidecar only when asked', async () => {
    const doc = createCsvDocument('contacts.csv', 'name,email\nAlice,jane@x.com');
    const spans = emailSpans(doc.text, 'jane@x.com');

    const without = await doc.redact(spans, { saveMapping: false });
    expect(without.ok && without.mapping).toBeUndefined();

    const outcome = await doc.redact(spans, { saveMapping: true });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.mapping) throw new Error('expected mapping');
    expect(outcome.mapping.name).toBe('contacts.redactyl-mapping.json');
    const json = JSON.parse(await outcome.mapping.blob.text());
    expect(json.tokens['<EMAIL_1>']).toEqual({ category: 'EMAIL', value: 'jane@x.com' });
  });
});
