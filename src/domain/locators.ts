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
