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
  // Offset just past the cell's last character. Optional for locator-only
  // callers; the CSV adapter always sets it so a detection offset that lands in
  // the gap *between* cells (a separator the tokeniser glued onto an entity) can
  // be snapped into the cell it precedes rather than the previous one.
  end?: number;
}

// The CSV analogue of makeLineIndex/makePageIndex: map a character offset in the
// flattened Detect text back to its Cell. Cells arrive in row-major order, so
// their `start`s are sorted; a lookup binary-searches the largest start <=
// offset.
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

// The index of the cell with the largest start <= offset, or -1 when offset
// precedes the first cell. Shared by the resolver and the clamp below.
function cellIndexAt(cells: Cell[], offset: number): number {
  if (cells.length === 0 || offset < cells[0].start) return -1;
  let lo = 0;
  let hi = cells.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cells[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Resolve an offset to its owning cell with a *forward snap*: when the offset
// falls in the gap after a cell (on a separator), it belongs to the cell that
// separator precedes, not the one before it. This is the fix for the CSV
// name-leak — a separator-glued NER token resolved to the separator's offset,
// which the plain "largest start <= offset" lookup mapped to the previous cell.
function resolveCell<T extends Cell>(cells: T[], offset: number): { cell: T; index: number } | undefined {
  if (cells.length === 0) return undefined;
  const found = cellIndexAt(cells, offset);
  const index = found < 0 ? 0 : found;
  const cell = cells[index];
  const end = cell.end ?? cells[index + 1]?.start ?? Infinity;
  // Inside the cell's own content (or before the first cell) — keep it.
  if (found < 0 || offset < end) return { cell, index };
  // In the trailing gap — snap to the next cell it precedes, if any.
  const next = cells[index + 1];
  return next ? { cell: next, index: index + 1 } : { cell, index };
}

// A snap-forward cell resolver for locators: returns the Cell an offset belongs
// to, never the previous cell when the offset sits on a separator.
export function makeCellResolver<T extends Cell>(cells: T[]): (offset: number) => T | undefined {
  return (offset) => resolveCell(cells, offset)?.cell;
}

// Clamp a span to a single cell: snap its start into the owning cell and bound
// its end to that cell's end. Guarantees a detection can only ever rewrite one
// cell — a span that straddles a boundary is trimmed to its first cell rather
// than corrupting the next. A degenerate range (the whole span sat in the gap)
// falls back to the full cell, which is the safe direction for a redactor.
export function clampSpanToCell<T extends Cell>(
  cells: T[],
  span: { start: number; end: number },
): { cell: T; start: number; end: number } | undefined {
  const resolved = resolveCell(cells, span.start);
  if (!resolved) return undefined;
  const { cell, index } = resolved;
  const cellEnd = cell.end ?? cells[index + 1]?.start ?? Infinity;
  let start = Math.max(span.start, cell.start);
  let end = Math.min(span.end, cellEnd);
  if (end <= start) {
    start = cell.start;
    end = cellEnd;
  }
  return { cell, start, end };
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
