import { describe, expect, it } from 'vitest';
import { runDetectors } from './patterns';

describe('runDetectors (EMAIL)', () => {
  it('matches a plain email and reports its span', () => {
    const spans = runDetectors('reach me at alice@example.com please');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ category: 'EMAIL', value: 'alice@example.com' });
    expect('reach me at alice@example.com please'.slice(spans[0].start, spans[0].end)).toBe(
      'alice@example.com',
    );
  });

  it('finds multiple emails in document order, with spans that slice back to the value', () => {
    const text = 'b@x.com early? no, a@x.com is first... wait b@x.com';
    const spans = runDetectors(text);
    expect(spans.map((s) => s.value)).toEqual(['b@x.com', 'a@x.com', 'b@x.com']);
    for (const s of spans) {
      expect(text.slice(s.start, s.end)).toBe(s.value);
    }
    // Sorted by position.
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b));
  });

  it('rejects strings that are not emails', () => {
    expect(runDetectors('no address here: not.an.email, @nope, foo@')).toHaveLength(0);
  });
});
