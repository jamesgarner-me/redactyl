import { describe, expect, it } from 'vitest';
import { createDocumentOpener } from './opener';
import type { PdfDocumentDeps } from './pdfDocument';
import { buildPdf, buildEncryptedPdf, buildScannedPdf } from '../pdf/pdfTestUtils';
import { runDetectors } from '../detection/patterns';

const deps: PdfDocumentDeps = {
  detect: (t) => runDetectors(t),
  renderPage: async () => new Uint8Array(),
};

function pdfFile(bytes: Uint8Array, name = 'doc.pdf'): File {
  // Uint8Array.from yields an ArrayBuffer-backed copy (a valid BlobPart).
  return new File([Uint8Array.from(bytes)], name, { type: 'application/pdf' });
}

describe('createDocumentOpener', () => {
  const opener = createDocumentOpener(deps);

  it('opens a text file as a text Document', async () => {
    const result = await opener.open(new File(['Email jane@x.com'], 'notes.txt'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.filename).toBe('notes.txt');
    expect(result.document.text).toContain('jane@x.com');
    expect(result.document.allowMapping).toBe(true);
  });

  it('opens a clean PDF as a PDF Document', async () => {
    const bytes = await buildPdf([['Reach alice@example.com here']]);
    const result = await opener.open(pdfFile(bytes));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.filename).toBe('doc.pdf');
    expect(result.document.allowMapping).toBe(false);
    expect(result.document.text).toContain('alice@example.com');
  });

  it('surfaces a scanned PDF as an openable Document carrying a safety warning', async () => {
    const bytes = await buildScannedPdf();
    const result = await opener.open(pdfFile(bytes, 'scan.pdf'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.safetyWarning).toContain('NOT sanitised');
  });

  it('fails to open an encrypted PDF with the password message', async () => {
    const bytes = await buildEncryptedPdf();
    const result = await opener.open(pdfFile(bytes, 'locked.pdf'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('password-protected');
  });

  it('fails to open an unreadable PDF with the generic read message', async () => {
    const result = await opener.open(pdfFile(new Uint8Array([1, 2, 3]), 'broken.pdf'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('Could not read broken.pdf');
  });
});
