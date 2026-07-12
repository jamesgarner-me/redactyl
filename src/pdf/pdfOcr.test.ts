import { describe, expect, it } from 'vitest';
import { augmentWithOcr, isOcrCandidate, wordsToPage, type OcrWord } from './pdfOcr';
import { assemble } from './pdfExtractor';
import type { PageExtract } from './pdfExtractor';
import type { RenderedPage } from './pdfRender';

// A scanned page: image, no text layer, unrotated → an OCR candidate.
const scannedPage = (pageNum = 1, rotate = 0): PageExtract => ({
  pageNum,
  text: '',
  glyphs: [],
  kind: 'scanned',
  rotate,
});

const textPage = (pageNum: number, text: string): PageExtract => ({
  pageNum,
  text,
  glyphs: [{ start: 0, end: 1, page: pageNum, x: 0, y: 0, w: 1, h: 1 }],
  kind: 'text',
  rotate: 0,
});

describe('wordsToPage', () => {
  const scale = 2;
  const userHeight = 100;

  it('converts pixel word boxes to PDF user-space glyphs', () => {
    // One word "hi": x 10..30, y 20..40 (top-left px). At scale 2, userHeight 100.
    const words: OcrWord[] = [{ text: 'hi', x0: 10, y0: 20, x1: 30, y1: 40, line: 0 }];
    const page = wordsToPage(words, 1, userHeight, scale);

    expect(page.kind).toBe('ocr');
    expect(page.text).toBe('hi');
    expect(page.glyphs).toHaveLength(2);
    // charWidth = (30-10)/2 chars = 10px; x = (x0 + charWidth*i)/scale.
    expect(page.glyphs[0]).toMatchObject({ start: 0, x: 5, y: 80, w: 5, h: 10 });
    expect(page.glyphs[1]).toMatchObject({ start: 1, x: 10, y: 80, w: 5, h: 10 });
    // y (bottom edge) = userHeight - y1/scale = 100 - 20; h = (y1-y0)/scale = 10.
  });

  it('joins same-line words with a space and new lines with a newline', () => {
    const words: OcrWord[] = [
      { text: 'hi', x0: 10, y0: 20, x1: 30, y1: 40, line: 0 },
      { text: 'yo', x0: 50, y0: 20, x1: 70, y1: 40, line: 0 },
      { text: 'bye', x0: 10, y0: 60, x1: 40, y1: 80, line: 1 },
    ];
    const page = wordsToPage(words, 1, userHeight, scale);

    expect(page.text).toBe('hi yo\nbye');
    // 7 visible glyphs (h,i,y,o,b,y,e); the space and newline carry none.
    expect(page.glyphs).toHaveLength(7);
    // Starts index into the page text, skipping the separators (offsets 2 and 5).
    expect(page.glyphs.map((g) => g.start)).toEqual([0, 1, 3, 4, 6, 7, 8]);
    // Same-line words share a baseline (equal y after rounding); the row groups.
    const line0 = page.glyphs.slice(0, 4);
    expect(new Set(line0.map((g) => Math.round(g.y))).size).toBe(1);
  });

  it('ignores empty words without emitting a stray separator', () => {
    const words: OcrWord[] = [
      { text: 'a', x0: 0, y0: 0, x1: 10, y1: 10, line: 0 },
      { text: '', x0: 0, y0: 0, x1: 0, y1: 0, line: 0 },
      { text: 'b', x0: 20, y0: 0, x1: 30, y1: 10, line: 0 },
    ];
    expect(wordsToPage(words, 1, userHeight, scale).text).toBe('a b');
  });
});

describe('isOcrCandidate', () => {
  it('accepts unrotated scanned pages only', () => {
    expect(isOcrCandidate(scannedPage(1, 0))).toBe(true);
    expect(isOcrCandidate(scannedPage(1, 90))).toBe(false); // rotated → fail closed
    expect(isOcrCandidate(textPage(1, 'hello'))).toBe(false);
  });
});

describe('augmentWithOcr', () => {
  const rendered: RenderedPage = {
    data: {} as ImageData,
    userWidth: 200,
    userHeight: 100,
    scale: 2,
  };
  const render = async () => rendered;

  it('replaces scanned pages with OCR text and leaves others untouched', async () => {
    const engine = {
      recognizeWords: async (): Promise<OcrWord[]> => [
        { text: 'alice@example.com', x0: 10, y0: 10, x1: 180, y1: 30, line: 0 },
      ],
    };
    const pages = [scannedPage(1), textPage(2, 'plain text')];

    const out = await augmentWithOcr(new Uint8Array(), pages, { render, engine });

    expect(out[0].kind).toBe('ocr');
    expect(out[0].text).toBe('alice@example.com');
    expect(out[1]).toBe(pages[1]); // untouched

    // Assembled, the scan drops out of `safety` and into `imageTextPages`.
    const assembled = assemble({ encrypted: false, pages: out });
    expect(assembled.safety).toBeNull();
    expect(assembled.imageTextPages).toEqual([1]);
    expect(assembled.text).toContain('alice@example.com');
  });

  it('reports per-page progress', async () => {
    const engine = { recognizeWords: async (): Promise<OcrWord[]> => [] };
    const events: number[] = [];
    await augmentWithOcr(new Uint8Array(), [scannedPage(1)], { render, engine }, (p) =>
      events.push(p.processed),
    );
    // Fires before (0) and after (1) the single page.
    expect(events).toEqual([0, 1]);
  });

  it('leaves a page scanned (blocked) when OCR throws', async () => {
    const engine = {
      recognizeWords: async (): Promise<OcrWord[]> => {
        throw new Error('ocr failed');
      },
    };
    const out = await augmentWithOcr(new Uint8Array(), [scannedPage(1)], { render, engine });

    expect(out[0].kind).toBe('scanned');
    expect(assemble({ encrypted: false, pages: out }).safety).toEqual({
      kind: 'scanned',
      pages: [1],
    });
  });

  it('keeps a page scanned (blocked) when OCR reads no words', async () => {
    const engine = { recognizeWords: async (): Promise<OcrWord[]> => [] };
    const out = await augmentWithOcr(new Uint8Array(), [scannedPage(1)], { render, engine });
    expect(out[0].kind).toBe('scanned');
    expect(assemble({ encrypted: false, pages: out }).safety).toEqual({
      kind: 'scanned',
      pages: [1],
    });
  });

  it('does not OCR a rotated scanned page', async () => {
    const engine = {
      recognizeWords: async (): Promise<OcrWord[]> => [
        { text: 'nope', x0: 0, y0: 0, x1: 1, y1: 1, line: 0 },
      ],
    };
    const out = await augmentWithOcr(new Uint8Array(), [scannedPage(1, 90)], { render, engine });
    expect(out[0].kind).toBe('scanned');
  });
});
