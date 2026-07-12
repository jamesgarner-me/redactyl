// Browser-only page rasteriser: render a PDF page to pixels via pdfjs + a canvas.
// Two consumers: `renderPageToPng` is the redaction rasterise fallback's renderer
// (slice 10); `renderPageToImageData` feeds OCR the raw pixels of a scanned page.
// Kept out of the redaction/OCR cores so those stay canvas-free and testable with
// stubs.
import { loadPdfjs } from './pdfExtractor';

// Scale up so the flattened/OCR'd page stays crisp; 2x matches typical print DPI.
// Exported so the OCR coordinate transform divides pixel coords by the same S.
export const RASTER_SCALE = 2;

// Render one page (1-based) to a canvas at RASTER_SCALE, returning the canvas
// plus the page's *unscaled* user-space size (rotation-applied) so callers can
// map pixel coords back to PDF user space.
async function renderPageToCanvas(
  bytes: Uint8Array,
  pageNumber: number,
): Promise<{ canvas: HTMLCanvasElement; userWidth: number; userHeight: number }> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RASTER_SCALE });
  const userViewport = page.getViewport({ scale: 1 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('Could not get a 2D canvas context for rasterisation');

  await page.render({ canvas, canvasContext, viewport }).promise;
  return { canvas, userWidth: userViewport.width, userHeight: userViewport.height };
}

export async function renderPageToPng(bytes: Uint8Array, pageNumber: number): Promise<Uint8Array> {
  const { canvas } = await renderPageToCanvas(bytes, pageNumber);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas produced no image during rasterisation');
  return new Uint8Array(await blob.arrayBuffer());
}

// A rendered page as pixels for OCR, alongside the user-space dimensions the
// coordinate transform needs (OCR emits top-left pixel coords at RASTER_SCALE).
export interface RenderedPage {
  data: ImageData;
  userWidth: number;
  userHeight: number;
  scale: number;
}

export type RenderPageToImageData = (bytes: Uint8Array, pageNumber: number) => Promise<RenderedPage>;

export async function renderPageToImageData(
  bytes: Uint8Array,
  pageNumber: number,
): Promise<RenderedPage> {
  const { canvas, userWidth, userHeight } = await renderPageToCanvas(bytes, pageNumber);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D canvas context for OCR rasterisation');
  return {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    userWidth,
    userHeight,
    scale: RASTER_SCALE,
  };
}
