// PdfOcr — recover text from scanned (image-only) pages so their PII can be
// detected and redacted. The engine is hidden behind `OcrEngine` so the pipeline
// stays testable with a stub (no WASM); the real Tesseract impl is browser-only
// and self-hosted (see createTesseractEngine).
//
// The whole point is to feed OCR output into the *existing* `text` + `GlyphBox[]`
// shapes, so detection, `drawRedactionBoxes`, and locators work unchanged. OCR's
// job here is purely: pixels in → a `PageExtract` out.
import { RASTER_SCALE, type RenderPageToImageData } from './pdfRender';
import type { GlyphBox, PageExtract } from './pdfExtractor';

// One recognised word in image pixel coordinates: top-left origin, y increasing
// downward, at the render scale. `line` is a monotonically increasing reading-
// order line index used to insert line breaks between words.
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  line: number;
}

export interface OcrEngine {
  recognizeWords(image: ImageData): Promise<OcrWord[]>;
}

export interface OcrProgress {
  page: number;
  processed: number;
  total: number;
}

export interface OcrAugmentDeps {
  render: RenderPageToImageData;
  engine: OcrEngine;
}

// Build a `PageExtract` from recognised words, mirroring the text extractor:
// words on the same line are joined by a space, lines by a newline, and each
// word's advance width is distributed evenly across its characters. Coordinates
// convert from top-left pixel space (scale S) to PDF user space (bottom-left
// origin): x = x0/S, y = userHeight - y1/S, w = (x1-x0)/S, h = (y1-y0)/S — the
// same space `GlyphBox` and pdf-lib draw in.
export function wordsToPage(
  words: OcrWord[],
  pageNum: number,
  userHeight: number,
  scale: number = RASTER_SCALE,
): PageExtract {
  let text = '';
  const glyphs: GlyphBox[] = [];
  let prevLine: number | null = null;

  for (const word of words) {
    const str = word.text;
    if (str.length === 0) continue;
    if (prevLine !== null) text += word.line !== prevLine ? '\n' : ' ';
    prevLine = word.line;

    const charWidth = (word.x1 - word.x0) / str.length;
    for (let i = 0; i < str.length; i++) {
      const start = text.length + i;
      glyphs.push({
        start,
        end: start + 1,
        page: pageNum,
        x: (word.x0 + charWidth * i) / scale,
        y: userHeight - word.y1 / scale,
        w: charWidth / scale,
        h: (word.y1 - word.y0) / scale,
      });
    }
    text += str;
  }

  return { pageNum, text, glyphs, kind: 'ocr', rotate: 0 };
}

// Whether a page is an OCR candidate: a scan with no text layer, unrotated (the
// rendered pixels and pdf-lib's draw space only agree when /Rotate is 0). Other
// scanned pages stay `scanned` and remain blocked — fail-closed.
export function isOcrCandidate(page: PageExtract): boolean {
  return page.kind === 'scanned' && page.rotate === 0;
}

// Replace every OCR-candidate page's entry with an `ocr` `PageExtract` recovered
// from its pixels. Non-candidate pages pass through untouched. A page that fails
// OCR keeps its `scanned` kind, so it stays blocked (fail-closed). Offsets are
// left page-local — `assemble` rebases them globally afterwards.
export async function augmentWithOcr(
  bytes: Uint8Array,
  pages: PageExtract[],
  { render, engine }: OcrAugmentDeps,
  onProgress?: (progress: OcrProgress) => void,
): Promise<PageExtract[]> {
  const total = pages.filter(isOcrCandidate).length;
  if (total === 0) return pages;

  const out = [...pages];
  let processed = 0;
  for (let i = 0; i < out.length; i++) {
    const page = out[i];
    if (!isOcrCandidate(page)) continue;
    onProgress?.({ page: page.pageNum, processed, total });
    try {
      const { data, userHeight, scale } = await render(bytes, page.pageNum);
      const words = await engine.recognizeWords(data);
      // Zero words means OCR couldn't read the scan — leave it `scanned`
      // (blocked) rather than pass off an unread page as sanitised.
      if (words.length > 0) out[i] = wordsToPage(words, page.pageNum, userHeight, scale);
    } catch {
      // Leave the page as `scanned`; the document stays blocked for it.
    }
    processed++;
    onProgress?.({ page: page.pageNum, processed, total });
  }
  return out;
}

// The real engine: Tesseract (WASM) running in its own worker, with all assets
// self-hosted under /ocr so they satisfy COEP `require-corp` (same-origin is
// exempt) and are precached for offline use. Browser-only. The worker is created
// lazily on first use and reused across pages/files.
export function createTesseractEngine(basePath = 'ocr'): OcrEngine {
  type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>;
  let workerPromise: Promise<TesseractWorker> | null = null;

  async function getWorker(): Promise<TesseractWorker> {
    if (!workerPromise) {
      workerPromise = import('tesseract.js')
        .then(({ createWorker }) =>
          createWorker('eng', 1, {
            workerPath: `${import.meta.env.BASE_URL}${basePath}/worker.min.js`,
            corePath: `${import.meta.env.BASE_URL}${basePath}`,
            langPath: `${import.meta.env.BASE_URL}${basePath}`,
            gzip: true,
          }),
        )
        .catch((err) => {
          workerPromise = null;
          throw err;
        });
    }
    return workerPromise;
  }

  return {
    async recognizeWords(image: ImageData): Promise<OcrWord[]> {
      const worker = await getWorker();
      // Tesseract takes a canvas, not raw ImageData — paint it onto one.
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d')!.putImageData(image, 0, 0);
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      return flattenWords(data.blocks ?? []);
    },
  };
}

// Flatten Tesseract's block → paragraph → line → word tree into flat `OcrWord`s,
// tagging each with a running line index so `wordsToPage` can break lines.
function flattenWords(blocks: unknown[]): OcrWord[] {
  const words: OcrWord[] = [];
  let line = 0;
  for (const block of blocks as TesseractBlock[]) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const ln of paragraph.lines ?? []) {
        for (const word of ln.words ?? []) {
          const text = (word.text ?? '').trim();
          if (text) words.push({ text, ...word.bbox, line });
        }
        line++;
      }
    }
  }
  return words;
}

// The slice of Tesseract's output tree we read — kept local so the module doesn't
// depend on tesseract.js types at the seam (the stub engine needs none).
interface TesseractBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface TesseractBlock {
  paragraphs?: { lines?: { words?: { text?: string; bbox: TesseractBBox }[] }[] }[];
}
