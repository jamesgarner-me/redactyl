import { describe, expect, it } from 'vitest';
import { mergeSpans, type ScoredSpan } from './merge';

function scored(
  start: number,
  end: number,
  category: ScoredSpan['category'],
  confidence: number,
): ScoredSpan {
  return { start, end, category, value: `${start}-${end}`, confidence };
}

describe('mergeSpans', () => {
  it('keeps the higher-confidence span when two overlap', () => {
    const result = mergeSpans([
      scored(0, 10, 'DATE', 30),
      scored(0, 12, 'CREDIT_CARD', 95),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: 'CREDIT_CARD', start: 0, end: 12 });
  });

  it('keeps non-overlapping spans and sorts them by position', () => {
    const result = mergeSpans([
      scored(20, 25, 'EMAIL', 90),
      scored(0, 5, 'PHONE', 40),
    ]);
    expect(result.map((s) => s.start)).toEqual([0, 20]);
  });

  it('collapses identical ranges from two detectors to one span', () => {
    const result = mergeSpans([
      scored(0, 8, 'SECRET', 100),
      scored(0, 8, 'SECRET', 100),
    ]);
    expect(result).toHaveLength(1);
  });

  it('prefers the longer span when confidence ties', () => {
    const result = mergeSpans([
      scored(0, 6, 'URL', 60),
      scored(0, 10, 'URL', 60),
    ]);
    expect(result).toEqual([{ start: 0, end: 10, category: 'URL', value: '0-10' }]);
  });

  it('strips confidence from the returned spans', () => {
    const [span] = mergeSpans([scored(0, 4, 'IP', 70)]);
    expect(span).not.toHaveProperty('confidence');
  });
});
