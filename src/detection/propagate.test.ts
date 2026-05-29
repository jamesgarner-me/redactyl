import { describe, expect, it } from 'vitest';
import { propagateOccurrences } from './propagate';
import { mergeSpans, type ScoredSpan } from './merge';
import type { Category } from '../domain/types';

// A detected span at a given range, defaulting to a typical NER confidence.
function span(
  text: string,
  value: string,
  category: Category,
  confidence = 69,
  occurrence = 0,
): ScoredSpan {
  let at = -1;
  for (let n = 0; n <= occurrence; n++) at = text.indexOf(value, at + 1);
  return { start: at, end: at + value.length, category, value, confidence };
}

describe('propagateOccurrences', () => {
  it('emits a span for every verbatim occurrence of a value detected once', () => {
    // The structured field is detected; the prose sentence below it is not.
    const text =
      '- Residential address: 9 Aberdeen Road, Macedon VIC 3440\n' +
      'During the review held at 9 Aberdeen Road, Macedon VIC 3440 the client agreed.';
    const detected = [span(text, '9 Aberdeen Road, Macedon VIC 3440', 'ADDRESS')];

    const out = propagateOccurrences(text, detected);

    expect(out).toHaveLength(2);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe('9 Aberdeen Road, Macedon VIC 3440');
    // And after merge both occurrences survive, in document order.
    const merged = mergeSpans([...detected, ...out]).filter((s) => s.category === 'ADDRESS');
    expect(merged).toHaveLength(2);
    expect(merged.map((s) => s.start)).toEqual([...merged.map((s) => s.start)].sort((a, b) => a - b));
  });

  it('respects word boundaries so a value is not matched inside a larger word', () => {
    const text = 'Mr Ng met Ngata. Contact Ng later.';
    const detected = [span(text, 'Ng', 'PERSON')];

    // "Ng" is below the default minLength, so widen the guard for this check.
    const out = propagateOccurrences(text, detected, 2);

    // The two standalone "Ng"s, never the "Ng" inside "Ngata".
    expect(out).toHaveLength(2);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe('Ng');
    expect(out.every((s) => text.slice(s.start, s.end + 2) !== 'Ngat')).toBe(true);
  });

  it('matches a value bounded by punctuation/whitespace, not just string ends', () => {
    const text = 'first: Catherine L. Beaumont, then again Catherine L. Beaumont.';
    const detected = [span(text, 'Catherine L. Beaumont', 'PERSON')];

    const out = propagateOccurrences(text, detected);

    expect(out).toHaveLength(2);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe('Catherine L. Beaumont');
  });

  it('skips values shorter than minLength to avoid over-masking', () => {
    const text = 'code AB appears as AB and AB everywhere';
    const detected = [span(text, 'AB', 'SECRET')];
    expect(propagateOccurrences(text, detected)).toHaveLength(0);
  });

  it('inherits the highest confidence seen for a value', () => {
    // Same value detected weakly once and strongly once; a third occurrence is
    // undetected. The propagated copy must carry the strong confidence so it
    // wins the merge against any lower-confidence span at its range.
    const text = 'A@x.com ... A@x.com ... A@x.com';
    const detected = [
      span(text, 'A@x.com', 'EMAIL', 50, 0),
      span(text, 'A@x.com', 'EMAIL', 90, 1),
    ];

    const out = propagateOccurrences(text, detected);
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.confidence === 90)).toBe(true);
  });

  it('keeps the same string under different categories independent', () => {
    const text = 'value 12345678 here and 12345678 again';
    const detected = [
      span(text, '12345678', 'ACCOUNT_NUMBER', 85, 0),
      span(text, '12345678', 'PHONE', 40, 0),
    ];

    const out = propagateOccurrences(text, detected);
    // Two occurrences × two categories.
    expect(out.filter((s) => s.category === 'ACCOUNT_NUMBER')).toHaveLength(2);
    expect(out.filter((s) => s.category === 'PHONE')).toHaveLength(2);
  });
});
