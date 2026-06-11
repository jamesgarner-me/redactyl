import { extractPdf } from '../pdf/pdfExtractor';
import { createTextDocument } from './textDocument';
import { createCsvDocument } from './csvDocument';
import { CsvParseError, looksLikeCsv } from '../csv/csvParser';
import { createPdfDocument, type PdfDocumentDeps } from './pdfDocument';
import type { Document } from './document';

// Opening a file either yields a Document ready for Detect, or a failure message
// to show on the dropzone (encrypted/unreadable PDF). Extraction never reaches
// review on failure.
export type OpenOutcome = { ok: true; document: Document } | { ok: false; message: string };

export interface DocumentOpener {
  open(file: File): Promise<OpenOutcome>;
}

// The single place a raw file becomes a Document. Owns extension dispatch, PDF
// extraction, and open-time error handling — so App never branches on source.
// The PDF verify deps are captured here (built once at construction); the text
// adapter ignores them.
export function createDocumentOpener(deps: PdfDocumentDeps): DocumentOpener {
  return {
    async open(file: File): Promise<OpenOutcome> {
      try {
        if (/\.pdf$/i.test(file.name)) {
          // Keep the original bytes — extractPdf copies internally (pdfjs neuters
          // its input), so the same buffer feeds redaction later.
          const bytes = new Uint8Array(await file.arrayBuffer());
          const { text, glyphs, safety } = await extractPdf(bytes);
          // Encrypted is fatal: no usable text, so fail rather than show a list.
          if (safety?.kind === 'encrypted') {
            return {
              ok: false,
              message: 'This PDF is password-protected. Decrypt it first, then try again.',
            };
          }
          return {
            ok: true,
            document: createPdfDocument(
              { filename: file.name, text, glyphs, bytes, safety: safety ?? null },
              deps,
            ),
          };
        }
        if (/\.csv$/i.test(file.name)) {
          // A syntactic parse failure (e.g. an unclosed quote) is fatal: there
          // is no trustworthy grid to review, so fail with a clear message
          // rather than fall back to the plain-text path.
          try {
            return { ok: true, document: createCsvDocument(file.name, await file.text()) };
          } catch (err) {
            if (err instanceof CsvParseError) {
              return {
                ok: false,
                message: `${file.name} isn't valid CSV (${err.message}) Fix it, then try again.`,
              };
            }
            throw err;
          }
        }
        const text = await file.text();
        // Misnamed exports (e.g. `contacts.txt` that is really CSV) must not fall
        // through to the line-based text adapter — sniff before plain-text open.
        if (/\.txt$/i.test(file.name) && looksLikeCsv(text)) {
          return { ok: true, document: createCsvDocument(file.name, text) };
        }
        return { ok: true, document: createTextDocument(file.name, text) };
      } catch {
        return {
          ok: false,
          message: `Could not read ${file.name}. It may be encrypted or not a supported PDF.`,
        };
      }
    },
  };
}
