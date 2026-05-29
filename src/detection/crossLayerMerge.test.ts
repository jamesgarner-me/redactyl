import { describe, expect, it } from 'vitest';
import { mergeSpans, type ScoredSpan } from './merge';
import { regexScoredSpans } from './patterns';
import { nerConfidence } from './nerSpans';
import type { Category } from '../domain/types';

// NER span at a typical high score (~0.99 → confidence 69).
function ner(start: number, end: number, category: Category, value: string): ScoredSpan {
  return { start, end, category, value, confidence: nerConfidence(0.99) };
}

describe('cross-layer merge (regex + NER feed one mergeSpans)', () => {
  it('keeps a validated CREDIT_CARD over an overlapping NER ACCOUNT_NUMBER', () => {
    const text = 'Card 4111 1111 1111 1111 on file';
    const regex = regexScoredSpans(text);
    const card = regex.find((s) => s.category === 'CREDIT_CARD')!;
    const merged = mergeSpans([...regex, ner(card.start, card.end, 'ACCOUNT_NUMBER', card.value)]);
    expect(merged.find((s) => s.start === card.start)!.category).toBe('CREDIT_CARD');
  });

  it('lets NER win overlapping low-confidence regex PHONE and DATE', () => {
    const text = 'call 415-555-0142 on 2026-03-14';
    const regex = regexScoredSpans(text);
    const phone = regex.find((s) => s.category === 'PHONE')!;
    const date = regex.find((s) => s.category === 'DATE')!;
    const merged = mergeSpans([
      ...regex,
      ner(phone.start, phone.end, 'PHONE', 'NER_PHONE'),
      ner(date.start, date.end, 'DATE', 'NER_DATE'),
    ]);
    expect(merged.find((s) => s.start === phone.start)!.value).toBe('NER_PHONE');
    expect(merged.find((s) => s.start === date.start)!.value).toBe('NER_DATE');
  });

  it('keeps non-overlapping spans from both layers', () => {
    const text = 'email a@b.com';
    const regex = regexScoredSpans(text); // EMAIL
    const merged = mergeSpans([...regex, ner(100, 110, 'PERSON', 'somebody')]);
    expect(merged.map((s) => s.category).sort()).toEqual(['EMAIL', 'PERSON']);
  });
});
