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
