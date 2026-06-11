import type { Item } from './types';
import type { GlyphBox } from '../pdf/pdfExtractor';

// Map character offsets to 1-based line numbers. Line starts are computed once
// per document; each lookup is a binary search for the largest start <= offset.
export function makeLineIndex(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// The distinct, sorted line numbers an Item's Occurrences fall on.
export function itemLines(item: Item, lineAt: (offset: number) => number): number[] {
  const lines = new Set<number>();
  for (const span of item.spans) lines.add(lineAt(span.start));
  return [...lines].sort((a, b) => a - b);
}

// `ln 12, 88`, truncated to `ln 12, 88, 90, 91 +3` past `max` lines.
export function formatLocator(lines: number[], max = 4): string {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, max).join(', ');
  const extra = lines.length - max;
  return extra > 0 ? `ln ${shown} +${extra}` : `ln ${shown}`;
}

// The PDF analogue of makeLineIndex: map character offsets to 1-based page
// numbers. Glyphs arrive in offset order, so their `start`s are already sorted;
// a lookup binary-searches the largest start <= offset and reads its page.
// Returns the type itemLines already expects, so page locators reuse it.
export function makePageIndex(glyphs: GlyphBox[]): (offset: number) => number {
  return (offset) => {
    if (glyphs.length === 0) return 1;
    let lo = 0;
    let hi = glyphs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (glyphs[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return glyphs[lo].page;
  };
}

// `p. 1, 4, 7`, truncated to `p. 1, 4, 7, 9 +3` past `max` pages.
export function formatPageLocator(pages: number[], max = 4): string {
  if (pages.length === 0) return '';
  const shown = pages.slice(0, max).join(', ');
  const extra = pages.length - max;
  return extra > 0 ? `p. ${shown} +${extra}` : `p. ${shown}`;
}

// A single CSV cell coordinate — 1-based physical row and column. Row 1 is the
// first line of the file; a header row is not renumbered away.
export interface Cell {
  row: number;
  col: number;
  // Offset of the cell's first character in the flattened Detect text.
  start: number;
}

// The CSV analogue of makeLineIndex/makePageIndex: map a character offset in the
// flattened (unit-separator-joined) Detect text back to its Cell. Cells arrive
// in row-major order, so their `start`s are sorted; a lookup binary-searches the
// largest start <= offset.
export function makeCellIndex(cells: Cell[]): (offset: number) => Cell | undefined {
  return (offset) => {
    if (cells.length === 0) return undefined;
    let lo = 0;
    let hi = cells.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cells[mid].start <= offset) lo = mid;
      else hi = mid - 1;
    }
    return cells[lo];
  };
}

// The distinct Cells an Item's Occurrences fall on, sorted row-major. A Span
// whose offset lands outside any cell (it should not, given separators break
// detection) is skipped rather than mislocated.
export function itemCells(
  item: Item,
  cellAt: (offset: number) => Cell | undefined,
): Cell[] {
  const byKey = new Map<string, Cell>();
  for (const span of item.spans) {
    const cell = cellAt(span.start);
    if (!cell) continue;
    byKey.set(`${cell.row},${cell.col}`, cell);
  }
  return [...byKey.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

// Physical CSV locators: `row 2, col 3` for a single Cell, anchoring on the
// first Cell and appending the row numbers of further Occurrences —
// `row 2, col 3, 5` when the same value recurs down a column — truncated to
// `row 2, col 3, 5, 7 +N` past `max` cells.
export function formatCsvLocator(cells: Cell[], max = 4): string {
  if (cells.length === 0) return '';
  const [first, ...rest] = cells;
  const head = `row ${first.row}, col ${first.col}`;
  if (rest.length === 0) return head;
  const rows = rest.map((cell) => cell.row);
  const shown = rows.slice(0, max - 1);
  const extra = rows.length - shown.length;
  const tail = `${head}, ${shown.join(', ')}`;
  return extra > 0 ? `${tail} +${extra}` : tail;
}
