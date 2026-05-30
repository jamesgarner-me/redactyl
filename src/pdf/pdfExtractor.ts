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

// A fail-closed reason: a PDF Redactyl can't safely sanitise. `encrypted` is
// fatal (no usable text); `scanned`/`garbled` carry the affected pages and still
// allow partial detection results to be shown, with redaction blocked.
export type PdfSafety =
  | { kind: 'encrypted' }
  | { kind: 'scanned'; pages: number[] }
  | { kind: 'garbled'; pages: number[] };

export interface ExtractedPdf {
  text: string;
  glyphs: GlyphBox[];
  pageCount: number;
  safety: PdfSafety | null;
}

// Padding below the baseline so the redaction rectangle covers descenders.
const DESCENT = 0.2;

// A page is "garbled" past this fraction of unreadable characters — extraction
// can't be trusted, so we must not claim the file was sanitised.
const GARBLE_THRESHOLD = 0.05;

// Fraction of characters that are the U+FFFD replacement char or non-printable
// controls (tab/newline/CR excepted) — pdfjs's signal that glyphs didn't map to
// Unicode. Exported for direct testing (authoring a truly garbled PDF is hard).
export function garbleRatio(text: string): number {
  if (text.length === 0) return 0;
  let bad = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c < 0x20 && c !== 9 && c !== 10 && c !== 13)) bad++;
  }
  return bad / text.length;
}

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
  const imageOps = imageDrawOps(pdfjs);
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);

  let doc: Awaited<ReturnType<PdfjsModule['getDocument']>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    // Password-protected: pdfjs can't read it at all — fail closed, no results.
    if (err instanceof Error && err.name === 'PasswordException') {
      return { text: '', glyphs: [], pageCount: 0, safety: { kind: 'encrypted' } };
    }
    throw err;
  }

  let text = '';
  const glyphs: GlyphBox[] = [];
  const scannedPages: number[] = [];
  const garbledPages: number[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      if (!('str' in item)) continue; // skip marked-content boundary items
      const str = item.str;
      // transform = [a, b, c, d, e, f]; for unrotated text a/d are the font
      // size, (e, f) the baseline origin. Clean fixtures are unrotated.
      const [a, , , , e, f] = item.transform;
      const height = item.height || a;
      const charWidth = str.length > 0 ? item.width / str.length : 0;
      for (let i = 0; i < str.length; i++) {
        const start = text.length + pageText.length + i;
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
      pageText += str;
      if (item.hasEOL) pageText += '\n';
    }

    // Scanned: no real text on the page but it paints an image — it's a scan
    // with no text layer, so detection would see nothing and miss everything.
    if (pageText.trim().length === 0) {
      const { fnArray } = await page.getOperatorList();
      if (fnArray.some((fn) => imageOps.has(fn))) scannedPages.push(pageNum);
    } else if (garbleRatio(pageText) > GARBLE_THRESHOLD) {
      garbledPages.push(pageNum);
    }

    text += pageText;
    // Separate pages so detection doesn't run words together across a page break
    // and so the page locator reads cleanly.
    if (pageNum < doc.numPages && !text.endsWith('\n')) text += '\n';
  }

  // Scanned outranks garbled when both fire (a missing text layer is the clearer
  // hazard); either way the UI blocks redaction and names the pages.
  const safety: PdfSafety | null = scannedPages.length
    ? { kind: 'scanned', pages: scannedPages }
    : garbledPages.length
      ? { kind: 'garbled', pages: garbledPages }
      : null;

  return { text, glyphs, pageCount: doc.numPages, safety };
}

// The pdfjs operator codes that draw raster images, used to tell a scanned page
// (image, no text) from a genuinely blank one.
function imageDrawOps(pdfjs: PdfjsModule): Set<number> {
  const ops = pdfjs.OPS;
  return new Set(
    Object.entries(ops)
      .filter(([name]) => /Image/.test(name) && name.startsWith('paint'))
      .map(([, code]) => code as number),
  );
}
