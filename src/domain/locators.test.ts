import { describe, expect, it } from 'vitest';
import { formatLocator, itemLines, makeLineIndex } from './locators';
import type { Item, Span } from './types';

function span(start: number): Span {
  return { start, end: start + 1, category: 'EMAIL', value: 'x' };
}

describe('makeLineIndex', () => {
  it('returns 1-based line numbers across newline boundaries', () => {
    const lineAt = makeLineIndex('a\nbb\nccc');
    expect(lineAt(0)).toBe(1); // 'a'
    expect(lineAt(2)).toBe(2); // first 'b'
    expect(lineAt(3)).toBe(2); // second 'b'
    expect(lineAt(5)).toBe(3); // first 'c'
  });

  it('places an offset on the line after the newline that precedes it', () => {
    const lineAt = makeLineIndex('line1\nline2');
    expect(lineAt(5)).toBe(1); // the '\n' itself still ends line 1
    expect(lineAt(6)).toBe(2); // first char after the newline
  });
});

describe('itemLines', () => {
  it('returns distinct, sorted line numbers for an Item across its Occurrences', () => {
    const text = 'one\ntwo\nthree\nfour';
    const lineAt = makeLineIndex(text);
    const item: Item = {
      value: 'x',
      category: 'EMAIL',
      spans: [span(15), span(0), span(0)], // line 4, line 1, line 1
    };
    expect(itemLines(item, lineAt)).toEqual([1, 4]);
  });
});

describe('formatLocator', () => {
  it('formats line numbers as `ln a, b`', () => {
    expect(formatLocator([12, 88])).toBe('ln 12, 88');
  });

  it('truncates past the cap with a +N suffix', () => {
    expect(formatLocator([1, 2, 3, 4, 5, 6])).toBe('ln 1, 2, 3, 4 +2');
  });

  it('returns an empty string when there are no lines', () => {
    expect(formatLocator([])).toBe('');
  });
});
