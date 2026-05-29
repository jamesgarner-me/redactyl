// PdfExtractor — pull text and per-glyph geometry out of a clean text PDF via
// pdfjs, shaped so the extracted text drops straight into the existing
// `Detector` and the glyph boxes drive `PdfRedactor`'s black rectangles.
//
// Scope (slice 8): clean text PDFs only. The encrypted/scanned/garbled safety
// checks are slice 9; for now a non-text or encrypted PDF simply throws from
// pdfjs and surfaces as a generic load error.

// One source character's box, in PDF user space (bottom-left origin) so it lines
// up with pdf-lib's drawing coordinates. `start` is the character's offset into
// `ExtractedPdf.text`; per-glyph x/width come from distributing the text item's
// advance width evenly across its characters (good enough for clean text).
export interface GlyphBox {
  start: number;
  end: number;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtractedPdf {
  text: string;
  glyphs: GlyphBox[];
  pageCount: number;
}

// Padding below the baseline so the redaction rectangle covers descenders.
const DESCENT = 0.2;

// pdfjs neuters the ArrayBuffer it is handed (it transfers it to its worker), so
// every call gets a fresh copy — the caller's bytes stay reusable (the redactor
// and verifier read the same source).
type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
      // In the browser, point pdfjs at its bundled worker; under Node (tests)
      // there is no window and pdfjs falls back to its in-process worker.
      if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export async function extractPdf(bytes: ArrayBuffer | Uint8Array): Promise<ExtractedPdf> {
  const pdfjs = await loadPdfjs();
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  const doc = await pdfjs.getDocument({ data }).promise;

  let text = '';
  const glyphs: GlyphBox[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item)) continue; // skip marked-content boundary items
      const str = item.str;
      // transform = [a, b, c, d, e, f]; for unrotated text a/d are the font
      // size, (e, f) the baseline origin. Clean fixtures are unrotated.
      const [a, , , , e, f] = item.transform;
      const height = item.height || a;
      const charWidth = str.length > 0 ? item.width / str.length : 0;
      for (let i = 0; i < str.length; i++) {
        const start = text.length + i;
        glyphs.push({
          start,
          end: start + 1,
          page: pageNum,
          x: e + charWidth * i,
          y: f - height * DESCENT,
          w: charWidth,
          h: height * (1 + DESCENT),
        });
      }
      text += str;
      if (item.hasEOL) text += '\n';
    }
    // Separate pages so detection doesn't run words together across a page break
    // and so the page locator reads cleanly.
    if (pageNum < doc.numPages && !text.endsWith('\n')) text += '\n';
  }

  return { text, glyphs, pageCount: doc.numPages };
}
