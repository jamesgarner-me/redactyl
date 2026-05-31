import { describe, expect, it } from 'vitest';
import { createPdfDocument, type PdfDocumentDeps } from './pdfDocument';
import { extractPdf } from '../pdf/pdfExtractor';
import { buildPdf, buildKerningSplitPdf, PIXEL_PNG } from '../pdf/pdfTestUtils';
import { runDetectors } from '../detection/patterns';
import { spansToItems } from '../domain/items';

// Regex-only detection surface — the Spans → Items reduction the worker runs,
// without the model.
const detect = (text: string) => spansToItems(runDetectors(text));

// Real deps: pattern detection re-verifies, and a stub renderer stands in for
// the canvas-backed rasteriser (clean text PDFs never reach it).
const deps: PdfDocumentDeps = { detect, renderPage: async () => new Uint8Array() };

async function openPdf(text: string) {
  const bytes = await buildPdf([[text]]);
  const { text: extracted, glyphs } = await extractPdf(bytes);
  return { extracted, glyphs, bytes };
}

describe('PdfDocument', () => {
  it('exposes PDF-source capabilities', () => {
    const doc = createPdfDocument(
      { filename: 'r.pdf', text: '', glyphs: [], bytes: new Uint8Array(), safety: null },
      deps,
    );
    expect(doc.allowMapping).toBe(false);
    expect(doc.safetyWarning).toBeUndefined();
  });

  it('locates an Item by the pages its Occurrences fall on', async () => {
    const { extracted, glyphs, bytes } = await openPdf('SSN 123-45-6789 here.');
    const doc = createPdfDocument(
      { filename: 'r.pdf', text: extracted, glyphs, bytes, safety: null },
      deps,
    );
    const [item] = detect(extracted);
    expect(doc.locate(item)).toBe('p. 1');
  });

  it('true-redacts a clean PDF and verifies it clean', async () => {
    const { extracted, glyphs, bytes } = await openPdf('SSN 123-45-6789 for Jane.');
    const doc = createPdfDocument(
      { filename: 'r.pdf', text: extracted, glyphs, bytes, safety: null },
      deps,
    );
    const accepted = detect(extracted).flatMap((i) => i.spans);
    const outcome = await doc.redact(accepted, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.outputName).toBe('r.redacted.pdf');
    expect(outcome.rasterisedPages).toEqual([]);
    expect(outcome.blob.type).toBe('application/pdf');
  });

  it('fails closed without producing output when flagged unsafe', async () => {
    const doc = createPdfDocument(
      {
        filename: 'scan.pdf',
        text: '',
        glyphs: [],
        bytes: new Uint8Array(),
        safety: { kind: 'scanned', pages: [1, 2] },
      },
      deps,
    );
    expect(doc.safetyWarning).toContain('NOT sanitised');
    const outcome = await doc.redact([], { saveMapping: false });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toBe(doc.safetyWarning);
  });

  it('fails closed when a leak survives even rasterisation', async () => {
    // A kerning-split PDF leaks through the per-operand rewrite, forcing the
    // rasterise fallback; a detector that always re-finds the accepted spans
    // simulates a leak even rasterisation can't clear → fail closed.
    const bytes = await buildKerningSplitPdf('alice@example.com');
    const { text, glyphs } = await extractPdf(bytes);
    const spans = runDetectors(text);
    const alwaysLeaks: PdfDocumentDeps = {
      detect: () => spansToItems(spans),
      renderPage: async () => PIXEL_PNG,
    };
    const doc = createPdfDocument(
      { filename: 'r.pdf', text, glyphs, bytes, safety: null },
      alwaysLeaks,
    );
    const outcome = await doc.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.message).toContain('No file was produced');
  });
});
