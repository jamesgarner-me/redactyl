import { extractPdf } from '../pdf/pdfExtractor';
import { createTextDocument } from './textDocument';
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
        const text = await file.text();
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
