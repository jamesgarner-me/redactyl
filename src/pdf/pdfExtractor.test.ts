import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdfExtractor';
import { buildPdf } from './pdfTestUtils';
import { makePageIndex, formatPageLocator } from '../domain/locators';

describe('extractPdf', () => {
  it('extracts text with per-glyph boxes from a clean single-page PDF', async () => {
    const bytes = await buildPdf([['Email alice@example.com here']]);
    const { text, glyphs, pageCount } = await extractPdf(bytes);

    expect(pageCount).toBe(1);
    expect(text).toContain('alice@example.com');
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
