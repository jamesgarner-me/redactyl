import { describe, expect, it } from 'vitest';
import { sampleReview } from './sampleDocument';
import { assignTokens } from '../redaction/tokeniser';
import { redact } from '../redaction/textRedactor';

describe('sampleReview fixture', () => {
  const { text, items } = sampleReview();
  const spans = items.flatMap((item) => item.spans);

  it('anchors every Span to its actual text (offsets are valid)', () => {
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.value);
    }
  });

  it('produces non-overlapping Spans (clean for right-to-left redaction)', () => {
    const ordered = [...spans].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end);
    }
  });

  it('covers all twelve Categories so every display Bucket appears', () => {
    const categories = new Set(items.map((item) => item.category));
    expect(categories.size).toBe(12);
  });

  it('includes a multi-Occurrence Item (exercises the N× row + locators)', () => {
    expect(items.some((item) => item.spans.length > 1)).toBe(true);
  });

  it('round-trips through the real redactor', () => {
    const tokens = assignTokens(spans);
    const output = redact(text, spans, tokens);
    expect(output).not.toContain('alice.chen@example.com');
    expect(output).toContain('<EMAIL_1>');
  });
});
