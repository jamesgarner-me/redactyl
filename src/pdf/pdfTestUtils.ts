// Test-only helper: build small, clean text PDFs in-memory with pdf-lib so the
// PDF suites need no committed binary fixtures. One drawText per line; pages are
// 400x300 with a Helvetica (WinAnsi) font, matching the slice-8 happy path.
import { PDFDocument, PDFDict, PDFHexString, PDFName, StandardFonts } from 'pdf-lib';

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

// A password-protected PDF: inject a Standard /Encrypt dict (RC4, R2/V1) with
// O/U bytes that fail empty-password validation, so pdfjs throws a
// PasswordException — pdf-lib has no encryption API of its own.
export async function buildEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([200, 200]).drawText('secret alice@example.com', { x: 10, y: 100, size: 10, font });
  const ctx = doc.context;
  const enc = ctx.obj({
    Filter: PDFName.of('Standard'),
    V: 1,
    R: 2,
    O: PDFHexString.of('A'.repeat(64)),
    U: PDFHexString.of('B'.repeat(64)),
    P: -44,
  });
  ctx.trailerInfo.Encrypt = ctx.register(enc);
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of('0'.repeat(32)), PDFHexString.of('0'.repeat(32))]);
  return doc.save();
}

function strToHex(s: string): string {
  let h = '';
  for (let i = 0; i < s.length; i++) h += (s.charCodeAt(i) & 0xff).toString(16).padStart(2, '0');
  return h.toUpperCase();
}

// A PDF that shows `value` via a kerned, split `TJ` array (`[<part1> -40 <part2>] TJ`).
// pdfjs reconstructs the whole string, but PdfRedactor's per-operand value match
// sees only the halves — so the rewrite leaves residual text and the rasterise
// fallback must kick in. This is the "kerning-split-word" case from issue 10.
export async function buildKerningSplitPdf(value: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 200]);
  page.drawText('x', { x: 0, y: 0, size: 12, font }); // register the font in Resources

  const ctx = doc.context;
  const resources = ctx.lookup(page.node.get(PDFName.of('Resources')), PDFDict);
  const fonts = ctx.lookup(resources.get(PDFName.of('Font')), PDFDict);
  const fontKey = fonts.keys()[0].toString(); // e.g. '/F1-0'

  const mid = Math.max(1, Math.floor(value.length / 2));
  const a = strToHex(value.slice(0, mid));
  const b = strToHex(value.slice(mid));
  const content = `BT ${fontKey} 12 Tf 30 150 Td [<${a}> -40 <${b}>] TJ ET\n`;
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(content)));
  return doc.save();
}

// 1x1 transparent PNG.
export const PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

// A "scanned" PDF: a page that paints an image and has no text layer at all.
export async function buildScannedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const png = await doc.embedPng(PIXEL_PNG);
  const page = doc.addPage([300, 200]);
  page.drawImage(png, { x: 0, y: 0, width: 300, height: 200 });
  return doc.save();
}
