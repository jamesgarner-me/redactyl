// The Document seam — see CONTEXT.md. A Document is the opened file under
// redaction: its extracted text plus whatever the source kind needs to locate
// Occurrences and produce a sanitised copy. Detect runs on `text`; `redact`
// produces the output. Three adapters implement this: TextDocument, CsvDocument,
// and PdfDocument. App holds a Document and never branches on source.

import type { Item, Span } from '../domain/types';

// Shared redaction result. Text never fails closed, but PDF can (a verification
// leak surviving rasterisation), so both adapters return this union.
export type RedactionOutcome =
  | {
      ok: true;
      outputName: string;
      blob: Blob;
      // Optional re-identification sidecar (text only, on request).
      mapping?: { name: string; blob: Blob };
      // Pages flattened to images during PDF redaction; absent for text.
      rasterisedPages?: number[];
    }
  | { ok: false; message: string };

export interface Document {
  readonly filename: string;
  readonly text: string;
  readonly allowMapping: boolean;
  readonly safetyWarning?: string;
  // The source-specific locator for an Item's Occurrences: line for text,
  // row/column for CSV, page for PDF.
  locate(item: Item): string;
  redact(accepted: Span[], opts: { saveMapping: boolean }): Promise<RedactionOutcome>;
}

// `notes.txt` -> `notes.redacted.txt`; `report.pdf` -> `report.redacted.pdf`.
export function redactedName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return `${filename}.redacted`;
  return `${filename.slice(0, dot)}.redacted${filename.slice(dot)}`;
}
