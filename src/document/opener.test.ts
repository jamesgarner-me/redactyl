import { describe, expect, it } from 'vitest';
import { createDocumentOpener } from './opener';
import type { PdfDocumentDeps } from './pdfDocument';
import { buildPdf, buildEncryptedPdf, buildScannedPdf } from '../pdf/pdfTestUtils';
import { runDetectors } from '../detection/patterns';
import { spansToItems } from '../domain/items';
import { parseCsv } from '../csv/csvParser';

const deps: PdfDocumentDeps = {
  detect: (t) => spansToItems(runDetectors(t)),
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
    const items = await deps.detect(result.document.text);
    const email = items.find((i) => i.value === 'jane@x.com');
    expect(email).toBeDefined();
    expect(result.document.locate(email!)).toMatch(/^ln /);
  });

  it('sniffs CSV content in a .txt file and opens it with row/column locators', async () => {
    const result = await opener.open(
      new File(['name,email\nAlice,jane@x.com'], 'contacts.txt', { type: 'text/plain' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.filename).toBe('contacts.txt');
    const items = await deps.detect(result.document.text);
    const email = items.find((i) => i.value === 'jane@x.com');
    expect(email).toBeDefined();
    expect(result.document.locate(email!)).toBe('row 2, col 2');
  });

  it('redacts sniffed CSV-in-.txt via the cell adapter, preserving structure', async () => {
    const result = await opener.open(
      new File(['"Smith, Jo",jane@x.com'], 'contacts.txt', { type: 'text/plain' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = await deps.detect(result.document.text);
    const email = items.find((i) => i.value === 'jane@x.com');
    expect(email).toBeDefined();
    const spans = email!.spans;
    const outcome = await result.document.redact(spans, { saveMapping: false });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.outputName).toBe('contacts.redacted.txt');
    const grid = parseCsv(await outcome.blob.text());
    expect(grid).toEqual([['Smith, Jo', '<EMAIL_1>']]);
  });

  it('falls back to plain text when .txt content fails CSV parse', async () => {
    const body = 'name,email\nAlice,"unclosed';
    const result = await opener.open(new File([body], 'notes.txt'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const items = await deps.detect(result.document.text);
    const alice = items.find((i) => i.value === 'Alice');
    if (alice) {
      expect(result.document.locate(alice)).toMatch(/^ln /);
    }
  });

  it('opens a CSV file as a CSV Document with row/column locators', async () => {
    const result = await opener.open(
      new File(['name,email\nAlice,jane@x.com'], 'contacts.csv', { type: 'text/csv' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.filename).toBe('contacts.csv');
    expect(result.document.allowMapping).toBe(true);
    const items = await deps.detect(result.document.text);
    const email = items.find((i) => i.value === 'jane@x.com');
    expect(email).toBeDefined();
    expect(result.document.locate(email!)).toBe('row 2, col 2');
  });

  it('rejects a malformed CSV (unclosed quote) at open with a clear message', async () => {
    const result = await opener.open(
      new File(['name,email\nAlice,"unclosed'], 'broken.csv', { type: 'text/csv' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("broken.csv isn't valid CSV");
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
