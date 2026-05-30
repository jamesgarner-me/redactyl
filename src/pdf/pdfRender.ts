// Browser-only page rasteriser: render a PDF page to a PNG via pdfjs + a canvas.
// Injected into `redactAndVerifyPdf` as the rasterise fallback's renderer (slice
// 10). Kept out of the redaction core so that core stays canvas-free and the
// pipeline is testable with a stub renderer.
import { loadPdfjs } from './pdfExtractor';

// Scale up so the flattened page stays crisp; 2x matches typical print DPI.
const RASTER_SCALE = 2;

export async function renderPageToPng(bytes: Uint8Array, pageNumber: number): Promise<Uint8Array> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RASTER_SCALE });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext('2d');
  if (!canvasContext) throw new Error('Could not get a 2D canvas context for rasterisation');

  await page.render({ canvas, canvasContext, viewport }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Canvas produced no image during rasterisation');
  return new Uint8Array(await blob.arrayBuffer());
}
