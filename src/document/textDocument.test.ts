import { describe, expect, it } from 'vitest';
import { createTextDocument } from './textDocument';
import { groupItems } from '../domain/items';
import type { Span } from '../domain/types';

// Build EMAIL spans for every verbatim occurrence of `value`, the way Detect
// would, so the Document is tested through its interface rather than internals.
function emailSpans(text: string, value: string): Span[] {
  const spans: Span[] = [];
  for (let i = text.indexOf(value); i >= 0; i = text.indexOf(value, i + value.length)) {
    spans.push({ start: i, end: i + value.length, category: 'EMAIL', value });
  }
  return spans;
}

const TEXT = 'Contact: jane@x.com\nAgain: jane@x.com';
const SPANS = emailSpans(TEXT, 'jane@x.com');

describe('TextDocument', () => {
  it('exposes text-source capabilities', () => {
    const doc = createTextDocument('notes.txt', TEXT);
    expect(doc.allowMapping).toBe(true);
    expect(doc.safetyWarning).toBeUndefined();
  });

  it('locates an Item by the lines its Occurrences fall on', () => {
    const doc = createTextDocument('notes.txt', TEXT);
    const [item] = groupItems(SPANS);
    expect(doc.locate(item)).toBe('ln 1, 2');
  });

  it('redacts every Occurrence with its Token and names the output', async () => {
    const doc = createTextDocument('notes.txt', TEXT);
    const outcome = await doc.redact(SPANS, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.outputName).toBe('notes.redacted.txt');
    expect(await outcome.blob.text()).toBe('Contact: <EMAIL_1>\nAgain: <EMAIL_1>');
    expect(outcome.mapping).toBeUndefined();
  });

  it('emits a Mapping sidecar only when asked', async () => {
    const doc = createTextDocument('notes.txt', TEXT);
    const outcome = await doc.redact(SPANS, { saveMapping: true });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.mapping) throw new Error('expected mapping');
    expect(outcome.mapping.name).toBe('notes.redactyl-mapping.json');
    const json = JSON.parse(await outcome.mapping.blob.text());
    expect(json.tokens['<EMAIL_1>']).toEqual({ category: 'EMAIL', value: 'jane@x.com' });
  });
});
