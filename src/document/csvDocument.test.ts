import { describe, expect, it } from 'vitest';
import { createCsvDocument } from './csvDocument';
import { parseCsv } from '../csv/csvParser';
import { spansToItems } from '../domain/items';
import { nerSpansFrom, type NerToken } from '../detection/nerSpans';
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

describe('CsvDocument — name-leak regression', () => {
  // The reported bug: a redacted CSV still leaked people's names. The model
  // detects the name fine, but the cell separator gets glued onto the front of
  // the NER token (and the model returns no offsets), so the token resolves to
  // the *separator's* offset. The old "largest start ≤ offset" cell lookup then
  // maps that offset to the PREVIOUS cell, rewriting the wrong cell and leaving
  // the real name untouched. This drives that exact shape through the real
  // span-resolution (`nerSpansFrom`) and the document's redaction.
  it('redacts the name in its own cell when the NER token carries the leading cell separator', async () => {
    const doc = createCsvDocument('contacts.csv', 'id,name\n1,John Smith');
    const name = 'John Smith';
    const at = doc.text.indexOf(name);
    // The character the flattening places immediately before the cell — the one
    // the tokeniser folds into the entity. Derived from the document so the test
    // stays honest to whatever separator the adapter uses.
    const separator = doc.text[at - 1];
    const tokens: NerToken[] = [
      // No start/end (the model omits them on separator-glued tokens), forcing
      // the indexOf fallback that anchors the span on the separator.
      { entity_group: 'private_person', score: 0.99, word: separator + name },
    ];
    const spans = nerSpansFrom(tokens, doc.text);

    const outcome = await doc.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const grid = parseCsv(await outcome.blob.text());
    // The name cell (row 2, col 2) is tokenised; the id cell is untouched.
    expect(grid).toEqual([
      ['id', 'name'],
      ['1', '<PERSON_1>'],
    ]);
  });

  it('flattens rows with newlines (so chunking can split on lines) and never the unit separator', () => {
    // The old \x1f join corrupted NER boundaries and left the text newline-free;
    // the layout is now CSV-shaped so the chunker can break between rows.
    const doc = createCsvDocument('grid.csv', 'a,b\n1,2\n3,4');
    expect(doc.text).toContain('\n');
    expect(doc.text).not.toContain('\x1f');
  });
});

describe('CsvDocument — name-column refinement', () => {
  it('treats every value in a Name column as PERSON when the model recognised none', async () => {
    const doc = createCsvDocument('people.csv', 'id,name\n1,John Smith\n2,Jane Doe');
    // The shared detector found nothing — the column title is the only signal.
    const refined = doc.refineDetection!([]);

    expect(refined.items.map((i) => [i.category, i.value])).toEqual([
      ['PERSON', 'John Smith'],
      ['PERSON', 'Jane Doe'],
    ]);
    // The locator points at the physical cell, not a line.
    const john = refined.items.find((i) => i.value === 'John Smith')!;
    expect(doc.locate(john)).toBe('row 2, col 2');

    // Each name redacts inside its own cell, end-to-end.
    const outcome = await doc.redact(
      refined.items.flatMap((i) => i.spans),
      { saveMapping: false },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(parseCsv(await outcome.blob.text())).toEqual([
      ['id', 'name'],
      ['1', '<PERSON_1>'],
      ['2', '<PERSON_2>'],
    ]);
  });

  it('advises when a Name column held values but the model recognised no names', () => {
    const doc = createCsvDocument('people.csv', 'id,name\n1,John Smith\n2,Jane Doe');
    const refined = doc.refineDetection!([]);
    expect(refined.advisory).toBeDefined();
    expect(refined.advisory).toContain('"name"');
    expect(refined.advisory).toContain("people's names");
  });

  it('fills in names the model missed without advising when it caught at least one', () => {
    const doc = createCsvDocument('people.csv', 'id,name\n1,John Smith\n2,Jane Doe');
    // The model caught John but (non-deterministically) missed Jane.
    const at = doc.text.indexOf('John Smith');
    const modelItems = spansToItems([
      { start: at, end: at + 'John Smith'.length, category: 'PERSON', value: 'John Smith' },
    ]);
    const refined = doc.refineDetection!(modelItems);

    // No advisory — the model recognised the column. Jane is still filled in.
    expect(refined.advisory).toBeUndefined();
    const names = refined.items
      .filter((i) => i.category === 'PERSON')
      .map((i) => i.value)
      .sort();
    expect(names).toEqual(['Jane Doe', 'John Smith']);
  });

  it('leaves Items untouched and never advises when there is no name column', () => {
    const doc = createCsvDocument('contacts.csv', 'id,email\n1,a@x.com');
    const items = spansToItems(emailSpans(doc.text, 'a@x.com'));
    const refined = doc.refineDetection!(items);
    expect(refined.advisory).toBeUndefined();
    expect(refined.items).toEqual(items);
  });

  it('does not treat a non-person "name" column (e.g. filename) as people', () => {
    const doc = createCsvDocument('files.csv', 'id,filename\n1,report.pdf');
    const refined = doc.refineDetection!([]);
    expect(refined.items).toEqual([]);
    expect(refined.advisory).toBeUndefined();
  });
});

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
