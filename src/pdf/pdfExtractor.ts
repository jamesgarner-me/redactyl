// PdfExtractor — pull text and per-glyph geometry out of a PDF via pdfjs, shaped
// so the extracted text drops straight into the existing `Detector` and the
// glyph boxes drive `PdfRedactor`'s black rectangles.
//
// Structured in two halves so OCR can slot in without touching offset maths:
//   - `extractPages` does the per-page pdfjs work, producing *page-local* glyphs
//     and a per-page `kind` (text / scanned / garbled / empty).
//   - `assemble` concatenates the pages, rebases every glyph to a global offset,
//     and derives `safety`. OCR augmentation replaces a scanned page's entry
//     (see pdfOcr.ts) before assembly, so it never deals in global offsets.
// `extractPdf` composes the two and is what `PdfVerifier` re-runs (text-only, no
// OCR — the verify oracle must stay canvas-free).

// One source character's box, in PDF user space (bottom-left origin) so it lines
// up with pdf-lib's drawing coordinates. `start` is the character's offset into
// the owning text (page-local inside a `PageExtract`, global inside
// `ExtractedPdf`); per-glyph x/width come from distributing the text item's
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

// How a single page's text came to be. `scanned` (image, no text layer) is the
// OCR trigger; `ocr` marks a page whose text was recovered from raster pixels —
// its glyphs sit over an image, so redaction must flatten it (pixels can't be
// blanked). `empty` is a genuinely blank page; `garbled` is unreadable text.
export type PageKind = 'text' | 'scanned' | 'garbled' | 'empty' | 'ocr';

// One page's extraction, before global assembly. `text`/`glyphs` are page-local:
// glyph `start` is an offset into this page's `text`. `rotate` is the page's
// normalised rotation (0/90/180/270) — OCR only handles unrotated pages.
export interface PageExtract {
  pageNum: number;
  text: string;
  glyphs: GlyphBox[];
  kind: PageKind;
  rotate: number;
}

// The result of the per-page pass. `encrypted` is surfaced here (pdfjs can't
// read the file at all) rather than as a page so `assemble` can turn it into the
// fatal safety without a fake page.
export type ExtractResult = { encrypted: true } | { encrypted: false; pages: PageExtract[] };

export interface ExtractedPdf {
  text: string;
  glyphs: GlyphBox[];
  pageCount: number;
  safety: PdfSafety | null;
  // Pages whose text came from OCR of raster pixels — redaction must flatten
  // these (a vector box alone leaves the scan extractable). Empty for text PDFs.
  imageTextPages: number[];
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

export async function loadPdfjs(): Promise<PdfjsModule> {
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

// The per-page pass: parse the PDF and produce one `PageExtract` per page with
// page-local glyph offsets. No global assembly, no OCR — those live in
// `assemble` and pdfOcr.ts respectively.
export async function extractPages(bytes: ArrayBuffer | Uint8Array): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const imageOps = imageDrawOps(pdfjs);
  const data = new Uint8Array(bytes);

  let doc: Awaited<ReturnType<PdfjsModule['getDocument']>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    // Password-protected: pdfjs can't read it at all — fail closed, no results.
    if (err instanceof Error && err.name === 'PasswordException') {
      return { encrypted: true };
    }
    throw err;
  }

  const pages: PageExtract[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    let pageText = '';
    const glyphs: GlyphBox[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue; // skip marked-content boundary items
      const str = item.str;
      // transform = [a, b, c, d, e, f]; for unrotated text a/d are the font
      // size, (e, f) the baseline origin. Clean fixtures are unrotated.
      const [a, , , , e, f] = item.transform;
      const height = item.height || a;
      const charWidth = str.length > 0 ? item.width / str.length : 0;
      for (let i = 0; i < str.length; i++) {
        const start = pageText.length + i;
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

    let kind: PageKind;
    if (pageText.trim().length === 0) {
      // Scanned: no real text on the page but it paints an image — a scan with
      // no text layer, so detection would see nothing and miss everything.
      const { fnArray } = await page.getOperatorList();
      kind = fnArray.some((fn) => imageOps.has(fn)) ? 'scanned' : 'empty';
    } else {
      kind = garbleRatio(pageText) > GARBLE_THRESHOLD ? 'garbled' : 'text';
    }

    pages.push({
      pageNum,
      text: pageText,
      glyphs,
      kind,
      rotate: ((page.rotate % 360) + 360) % 360,
    });
  }

  return { encrypted: false, pages };
}

// Concatenate pages into the global text + glyph shapes, rebasing each glyph's
// page-local `start` to its global offset. Pages are separated by a newline (so
// detection doesn't run words together across a page break and the page locator
// reads cleanly), matching the original single-pass extractor byte-for-byte.
export function assemble(result: ExtractResult): ExtractedPdf {
  if (result.encrypted) {
    return { text: '', glyphs: [], pageCount: 0, safety: { kind: 'encrypted' }, imageTextPages: [] };
  }
  const { pages } = result;
  let text = '';
  const glyphs: GlyphBox[] = [];
  const scannedPages: number[] = [];
  const garbledPages: number[] = [];
  const imageTextPages: number[] = [];

  pages.forEach((page, index) => {
    const base = text.length;
    for (const g of page.glyphs) glyphs.push({ ...g, start: g.start + base, end: g.end + base });
    if (page.kind === 'scanned') scannedPages.push(page.pageNum);
    else if (page.kind === 'garbled') garbledPages.push(page.pageNum);
    else if (page.kind === 'ocr') imageTextPages.push(page.pageNum);
    text += page.text;
    if (index < pages.length - 1 && !text.endsWith('\n')) text += '\n';
  });

  // Scanned outranks garbled when both fire (a missing text layer is the clearer
  // hazard); either way the UI blocks redaction and names the pages.
  const safety: PdfSafety | null = scannedPages.length
    ? { kind: 'scanned', pages: scannedPages }
    : garbledPages.length
      ? { kind: 'garbled', pages: garbledPages }
      : null;

  return { text, glyphs, pageCount: pages.length, safety, imageTextPages };
}

export async function extractPdf(bytes: ArrayBuffer | Uint8Array): Promise<ExtractedPdf> {
  return assemble(await extractPages(bytes));
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
