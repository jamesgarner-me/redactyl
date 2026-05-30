// Test-only helper: build small, clean text PDFs in-memory with pdf-lib so the
// PDF suites need no committed binary fixtures. One drawText per line; pages are
// 400x300 with a Helvetica (WinAnsi) font, matching the slice-8 happy path.
import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function buildPdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([400, 300]);
    let y = 260;
    for (const line of lines) {
      page.drawText(line, { x: 30, y, size: 12, font });
      y -= 22;
    }
  }
  return doc.save();
}

// A PDF whose text lives inside a Form XObject (the page just paints it with
// `Do`), mirroring browser/HTML-to-PDF exports. Built by embedding one PDF's
// page into another, which pdf-lib represents as a Form XObject. Standard
// WinAnsi encoding, so content-stream blanking still applies.
export async function buildXObjectPdf(lines: string[]): Promise<Uint8Array> {
  const innerBytes = await buildPdf([lines]);
  const outer = await PDFDocument.create();
  const [embedded] = await outer.embedPdf(innerBytes);
  const page = outer.addPage([400, 300]);
  page.drawPage(embedded);
  return outer.save();
}
