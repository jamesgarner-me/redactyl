import { describe, expect, it } from 'vitest';
import { extractPdf, garbleRatio } from './pdfExtractor';
import { buildPdf, buildEncryptedPdf, buildScannedPdf } from './pdfTestUtils';
import { makePageIndex, formatPageLocator } from '../domain/locators';

describe('extractPdf', () => {
  it('extracts text with per-glyph boxes from a clean single-page PDF', async () => {
    const bytes = await buildPdf([['Email alice@example.com here']]);
    const { text, glyphs, pageCount, safety } = await extractPdf(bytes);

    expect(pageCount).toBe(1);
    expect(safety).toBeNull();
    expect(text).toContain('alice@example.com');
    // A clean text PDF has no OCR'd pages.
    expect((await extractPdf(bytes)).imageTextPages).toEqual([]);
    // One box per visible character, all on page 1, with positive geometry.
    const visible = text.replace(/\n/g, '');
    expect(glyphs).toHaveLength(visible.length);
    expect(glyphs.every((g) => g.page === 1)).toBe(true);
    expect(glyphs.every((g) => g.w > 0 && g.h > 0)).toBe(true);
    // Glyph boxes advance left-to-right.
    expect(glyphs[1].x).toBeGreaterThan(glyphs[0].x);
  });

  it('assigns the correct page number to glyphs across pages', async () => {
    const bytes = await buildPdf([['First page intro'], ['Second page ssn 123-45-6789']]);
    const { text, glyphs } = await extractPdf(bytes);

    const offset = text.indexOf('123-45-6789');
    expect(offset).toBeGreaterThanOrEqual(0);

    const pageAt = makePageIndex(glyphs);
    expect(pageAt(text.indexOf('First'))).toBe(1);
    expect(pageAt(offset)).toBe(2);
    expect(formatPageLocator([pageAt(offset)])).toBe('p. 2');
  });
});

describe('extractPdf safety checks', () => {
  it('flags an encrypted PDF and returns no usable results', async () => {
    const { safety, text, glyphs } = await extractPdf(await buildEncryptedPdf());
    expect(safety).toEqual({ kind: 'encrypted' });
    expect(text).toBe('');
    expect(glyphs).toHaveLength(0);
  });

  it('flags a scanned (image-only, no text layer) page', async () => {
    const { safety } = await extractPdf(await buildScannedPdf());
    expect(safety).toEqual({ kind: 'scanned', pages: [1] });
  });
});

describe('garbleRatio', () => {
  const FFFD = String.fromCharCode(0xfffd); // U+FFFD replacement char

  it('is zero for clean text and ignores tabs/newlines', () => {
    expect(garbleRatio('Hello, world!\n\tfine')).toBe(0);
  });

  it('counts U+FFFD and control characters as unreadable', () => {
    // 2 bad (a replacement char + a control char) out of 10 total.
    expect(garbleRatio(`${FFFD}\x01abcdefgh`)).toBeCloseTo(0.2);
  });

  it('crosses the 5% threshold the extractor uses for a garbled page', () => {
    const garbled = FFFD.repeat(6) + 'x'.repeat(94); // 6%
    expect(garbleRatio(garbled)).toBeGreaterThan(0.05);
  });
});
