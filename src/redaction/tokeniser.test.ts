import { describe, expect, it } from 'vitest';
import { assignTokens } from './tokeniser';
import type { Span } from '../domain/types';

function span(start: number, end: number, category: Span['category'], value: string): Span {
  return { start, end, category, value };
}

describe('assignTokens', () => {
  it('numbers per category in first-appearance order', () => {
    const spans = [
      span(0, 5, 'EMAIL', 'a@x.com'),
      span(10, 15, 'EMAIL', 'b@x.com'),
      span(20, 25, 'EMAIL', 'a@x.com'),
    ];
    const tokens = assignTokens(spans);
    expect(tokens.tokenFor(spans[0])).toBe('<EMAIL_1>');
    expect(tokens.tokenFor(spans[1])).toBe('<EMAIL_2>');
    // Repeated value reuses its token.
    expect(tokens.tokenFor(spans[2])).toBe('<EMAIL_1>');
  });

  it('uses ordering by position, not array order', () => {
    const spans = [span(30, 35, 'EMAIL', 'late@x.com'), span(0, 5, 'EMAIL', 'early@x.com')];
    const tokens = assignTokens(spans);
    expect(tokens.tokenFor(spans[1])).toBe('<EMAIL_1>'); // earliest start
    expect(tokens.tokenFor(spans[0])).toBe('<EMAIL_2>');
  });

  it('keeps a separate counter per category', () => {
    const spans = [
      span(0, 5, 'EMAIL', 'a@x.com'),
      span(10, 13, 'PHONE', '111'),
      span(20, 25, 'EMAIL', 'b@x.com'),
      span(30, 33, 'PHONE', '222'),
    ];
    const tokens = assignTokens(spans);
    expect(tokens.tokenFor(spans[0])).toBe('<EMAIL_1>');
    expect(tokens.tokenFor(spans[1])).toBe('<PHONE_1>');
    expect(tokens.tokenFor(spans[2])).toBe('<EMAIL_2>');
    expect(tokens.tokenFor(spans[3])).toBe('<PHONE_2>');
  });

  it('produces one entry per unique value', () => {
    const spans = [
      span(0, 5, 'EMAIL', 'a@x.com'),
      span(20, 25, 'EMAIL', 'a@x.com'),
      span(10, 15, 'EMAIL', 'b@x.com'),
    ];
    expect(assignTokens(spans).entries).toEqual([
      { token: '<EMAIL_1>', category: 'EMAIL', value: 'a@x.com' },
      { token: '<EMAIL_2>', category: 'EMAIL', value: 'b@x.com' },
    ]);
  });

  it('is idempotent across repeated calls', () => {
    const spans = [span(0, 5, 'EMAIL', 'a@x.com'), span(10, 15, 'EMAIL', 'b@x.com')];
    expect(assignTokens(spans).entries).toEqual(assignTokens(spans).entries);
  });
});
