import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdfExtractor';
import { redactPdf, redactAndVerifyPdf } from './pdfRedactor';
import { verifyPdf } from './pdfVerifier';
import { buildPdf, buildXObjectPdf, buildKerningSplitPdf, buildScannedPdf, PIXEL_PNG } from './pdfTestUtils';
import { runDetectors } from '../detection/patterns';
import { spansToItems } from '../domain/items';
import type { OcrWord } from './pdfOcr';
import type { RenderedPage } from './pdfRender';
import type { Span } from '../domain/types';

// Regex-only detection surface — the same Spans → Items reduction the worker
// runs, without the model. `runDetectors` is used directly where raw Spans are
// still needed (the redactPdf input).
const detect = (text: string) => spansToItems(runDetectors(text));

const hasPdftotext = (() => {
  try {
    execFileSync('which', ['pdftotext'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('redactPdf + verifyPdf (integration)', () => {
  it('removes accepted PII from the content stream and verifies no leaks', async () => {
    const bytes = await buildPdf([['Reach alice@example.com or ssn 123-45-6789 anytime']]);
    const { text, glyphs } = await extractPdf(bytes);
    const spans = runDetectors(text);
    const items = spansToItems(spans);

    expect(items.map((i) => i.value).sort()).toEqual(['123-45-6789', 'alice@example.com']);

    const redacted = await redactPdf(bytes, spans, glyphs);

    // (a) the verifier reports no leaks
    const result = await verifyPdf(redacted, items, detect);
    expect(result).toEqual({ ok: true, leaks: [], leakPages: [] });

    // (b) re-extracted text no longer contains the PII (copy/paste yields nothing)
    const after = await extractPdf(redacted);
    expect(after.text).not.toContain('alice@example.com');
    expect(after.text).not.toContain('123-45-6789');
  });

  it('redacts text nested in a Form XObject (not just the page Contents)', async () => {
    // Browser/HTML-to-PDF exports paint a Form XObject with `Do`; the redactor
    // must follow into it or the value leaks through verification.
    const bytes = await buildXObjectPdf(['Donor email alice@example.com on file']);
    const { text, glyphs } = await extractPdf(bytes);
    expect(text).toContain('alice@example.com');

    const redacted = await redactPdf(bytes, runDetectors(text), glyphs);

    const items = detect(text);
    expect(await verifyPdf(redacted, items, detect)).toEqual({ ok: true, leaks: [], leakPages: [] });

    // The email is gone, but the XObject still renders — its surrounding text
    // survives, proving we blanked the bytes rather than corrupting the stream.
    const after = (await extractPdf(redacted)).text;
    expect(after).not.toContain('alice@example.com');
    expect(after).toContain('Donor email');
    expect(after).toContain('on file');
  });

  it.skipIf(!hasPdftotext)('pdftotext on the output produces no accepted PII strings', async () => {
    const bytes = await buildPdf([['Reach alice@example.com or ssn 123-45-6789 anytime']]);
    const { text, glyphs } = await extractPdf(bytes);
    const redacted = await redactPdf(bytes, runDetectors(text), glyphs);

    // Repo-local temp (not the system /tmp), auto-cleaned below.
    const dir = mkdtempSync(join(process.cwd(), '.scratch', 'pdf-'));
    try {
      const path = join(dir, 'out.pdf');
      writeFileSync(path, redacted);
      const out = execFileSync('pdftotext', [path, '-']).toString();
      expect(out).not.toContain('alice@example.com');
      expect(out).not.toContain('123-45-6789');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('redactAndVerifyPdf — rasterise fallback', () => {
  // A stub renderer: real rendering needs a canvas (browser only). Returning a
  // valid PNG is enough to prove the pipeline — what matters is that rasterising
  // replaces the page content (dropping the text layer), not the image's pixels.
  const renderPage = async () => PIXEL_PNG;

  it('rasterises a page whose kerning-split text survives the rewrite, then verifies clean', async () => {
    const bytes = await buildKerningSplitPdf('alice@example.com');
    const { text, glyphs } = await extractPdf(bytes);
    // pdfjs reconstructs the value from the split TJ...
    expect(text).toContain('alice@example.com');
    // ...but the per-operand rewrite alone can't remove it (it leaks).
    const rewriteOnly = await redactPdf(bytes, runDetectors(text), glyphs);
    expect((await verifyPdf(rewriteOnly, detect(text), detect)).ok).toBe(false);

    const outcome = await redactAndVerifyPdf(bytes, runDetectors(text), glyphs, [], { detect, renderPage });

    expect(outcome.ok).toBe(true);
    expect(outcome.rasterisedPages).toEqual([1]);
    // The flattened page has no text layer, so the value is gone for good.
    expect((await extractPdf(outcome.bytes)).text).not.toContain('alice@example.com');
  });

  it('skips rasterisation when the rewrite alone verifies clean', async () => {
    const bytes = await buildPdf([['Plain alice@example.com here']]);
    const { text, glyphs } = await extractPdf(bytes);

    const outcome = await redactAndVerifyPdf(bytes, runDetectors(text), glyphs, [], { detect, renderPage });

    expect(outcome.ok).toBe(true);
    expect(outcome.rasterisedPages).toEqual([]);
  });

  it('fails closed when a value still leaks after rasterising', async () => {
    const bytes = await buildKerningSplitPdf('alice@example.com');
    const { text, glyphs } = await extractPdf(bytes);
    const spans = runDetectors(text);

    // A detector that always "finds" the value, even in the flattened output —
    // simulating a leak rasterisation can't clear. The pipeline must refuse.
    const alwaysLeaks = () => spansToItems(spans);

    const outcome = await redactAndVerifyPdf(bytes, spans, glyphs, [], {
      detect: alwaysLeaks,
      renderPage,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.rasterisedPages).toEqual([1]);
  });
});

describe('redactAndVerifyPdf — OCR image pages', () => {
  const renderPage = async () => PIXEL_PNG;
  const rendered: RenderedPage = { data: {} as ImageData, userWidth: 0, userHeight: 0, scale: 2 };
  // A re-OCR engine that sees no text (redaction covered the pixels).
  const ocrClean = { render: async () => rendered, engine: { recognizeWords: async (): Promise<OcrWord[]> => [] } };
  // A scanned page's text lives in pixels, so its accepted span carries no glyph.
  const span: Span = { start: 0, end: 17, category: 'EMAIL', value: 'alice@example.com' };

  it('always flattens an OCR page, even though the text oracle would pass it', async () => {
    const bytes = await buildScannedPdf();

    // Without forcing, the image-only page has no text to leak → nothing rasterised.
    const notForced = await redactAndVerifyPdf(bytes, [span], [], [], { detect, renderPage, ocr: ocrClean });
    expect(notForced.rasterisedPages).toEqual([]);

    // Forcing page 1 flattens it regardless, destroying the scan pixels.
    const forced = await redactAndVerifyPdf(bytes, [span], [], [1], { detect, renderPage, ocr: ocrClean });
    expect(forced.ok).toBe(true);
    expect(forced.rasterisedPages).toEqual([1]);
  });

  it('fails closed when re-OCR still finds a redacted value on a flattened page', async () => {
    const bytes = await buildScannedPdf();
    const ocrLeaks = {
      render: async () => rendered,
      engine: {
        recognizeWords: async (): Promise<OcrWord[]> => [
          { text: 'alice@example.com', x0: 0, y0: 0, x1: 10, y1: 10, line: 0 },
        ],
      },
    };

    const outcome = await redactAndVerifyPdf(bytes, [span], [], [1], { detect, renderPage, ocr: ocrLeaks });

    expect(outcome.ok).toBe(false);
    expect(outcome.rasterisedPages).toEqual([1]);
  });
});
