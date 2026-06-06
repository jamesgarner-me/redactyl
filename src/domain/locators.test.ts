import { describe, expect, it } from 'vitest';
import {
  type Cell,
  formatCsvLocator,
  formatLocator,
  itemCells,
  itemLines,
  makeCellIndex,
  makeLineIndex,
} from './locators';
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

describe('makeCellIndex / itemCells', () => {
  // Three cells laid out row-major in the flattened Detect text at the given
  // start offsets — the structure CsvDocument builds.
  const cells: Cell[] = [
    { row: 1, col: 1, start: 0 },
    { row: 2, col: 3, start: 10 },
    { row: 5, col: 3, start: 30 },
  ];

  it('maps an offset back to the cell that contains it', () => {
    const cellAt = makeCellIndex(cells);
    expect(cellAt(0)).toEqual(cells[0]);
    expect(cellAt(12)).toEqual(cells[1]); // inside the second cell
    expect(cellAt(40)).toEqual(cells[2]); // past the last cell's start
  });

  it('returns the distinct cells an Item falls on, sorted row-major', () => {
    const cellAt = makeCellIndex(cells);
    // Two Occurrences in row 2/col 3, one in row 5/col 3 (same value down a column).
    const item: Item = {
      value: 'alice@x.com',
      category: 'EMAIL',
      spans: [span(11), span(12), span(31)],
    };
    expect(itemCells(item, cellAt)).toEqual([
      { row: 2, col: 3, start: 10 },
      { row: 5, col: 3, start: 30 },
    ]);
  });
});

describe('formatCsvLocator', () => {
  it('formats a single cell as `row R, col C`', () => {
    expect(formatCsvLocator([{ row: 2, col: 3, start: 0 }])).toBe('row 2, col 3');
  });

  it('appends further occurrence rows after the anchor cell', () => {
    expect(
      formatCsvLocator([
        { row: 2, col: 3, start: 0 },
        { row: 5, col: 3, start: 10 },
      ]),
    ).toBe('row 2, col 3, 5');
  });

  it('truncates past the cap (4 rows shown) with a +N suffix', () => {
    expect(
      formatCsvLocator([
        { row: 2, col: 3, start: 0 },
        { row: 5, col: 3, start: 10 },
        { row: 7, col: 3, start: 20 },
        { row: 9, col: 3, start: 30 },
        { row: 11, col: 3, start: 40 },
        { row: 13, col: 3, start: 50 },
      ]),
    ).toBe('row 2, col 3, 5, 7, 9 +2');
  });

  it('returns an empty string when there are no cells', () => {
    expect(formatCsvLocator([])).toBe('');
  });
});
