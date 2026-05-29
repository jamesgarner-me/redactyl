import { describe, expect, it } from 'vitest';
import { nerConfidence, nerSpansFrom, type NerToken } from './nerSpans';

// A short fixture with known-good detections — the AC's NER smoke test at the
// logic layer (canned model output, no transformers.js in the runner).
const TEXT =
  'Harry Potter lives at 4 Privet Drive. Email harry.potter@hogwarts.edu about it.';

describe('nerSpansFrom', () => {
  it('maps the model labels to Categories with exact, text-anchored offsets', () => {
    const tokens: NerToken[] = [
      { entity_group: 'private_person', score: 0.99, word: 'Harry Potter', start: 0, end: 12 },
      { entity_group: 'private_address', score: 0.97, word: '4 Privet Drive', start: 22, end: 36 },
      {
        entity_group: 'private_email',
        score: 0.995,
        word: 'harry.potter@hogwarts.edu',
        start: 44,
        end: 69,
      },
    ];
    const spans = nerSpansFrom(tokens, TEXT);
    expect(spans.map((s) => [s.category, s.value])).toEqual([
      ['PERSON', 'Harry Potter'],
      ['ADDRESS', '4 Privet Drive'],
      ['EMAIL', 'harry.potter@hogwarts.edu'],
    ]);
    for (const s of spans) expect(TEXT.slice(s.start, s.end)).toBe(s.value);
  });

  it('drops labels with no Redactyl Category', () => {
    const tokens: NerToken[] = [
      { entity_group: 'organization', score: 0.9, word: 'Hogwarts', start: 0, end: 8 },
    ];
    expect(nerSpansFrom(tokens, 'Hogwarts')).toEqual([]);
  });

  it('trims the leading-space tokenizer artifact off provided offsets', () => {
    // start points at the space before the word (a common transformers.js shape).
    const text = 'see Alice now';
    const tokens: NerToken[] = [
      { entity_group: 'private_person', score: 0.9, word: ' Alice', start: 3, end: 9 },
    ];
    const [span] = nerSpansFrom(tokens, text);
    expect(text.slice(span.start, span.end)).toBe('Alice');
    expect(span.value).toBe('Alice');
  });

  it('relocates the word from the cursor when offsets are missing', () => {
    const text = 'Bob met Bob at noon';
    const tokens: NerToken[] = [
      { entity_group: 'private_person', score: 0.9, word: 'Bob' },
      { entity_group: 'private_person', score: 0.9, word: 'Bob' },
    ];
    const spans = nerSpansFrom(tokens, text);
    // Two distinct occurrences, not the same one twice.
    expect(spans.map((s) => s.start)).toEqual([0, 8]);
  });
});

describe('nerConfidence', () => {
  it('maps score 0–1 into the 50–70 band', () => {
    expect(nerConfidence(0)).toBe(50);
    expect(nerConfidence(1)).toBe(70);
    expect(nerConfidence(0.95)).toBe(69);
  });

  it('sits below validated regex (80/95) and above ambiguous regex (30/40)', () => {
    const c = nerConfidence(0.99);
    expect(c).toBeLessThan(80); // SSN / CREDIT_CARD / IBAN win
    expect(c).toBeGreaterThan(40); // PHONE / DATE lose to NER
  });
});
