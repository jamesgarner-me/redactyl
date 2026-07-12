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
      // Optional re-identification sidecar, written when the global save-mapping
      // preference is on. Produced for every Document kind (PDF included).
      mapping?: { name: string; blob: Blob };
      // Pages flattened to images during PDF redaction; absent for text.
      rasterisedPages?: number[];
    }
  | { ok: false; message: string };

// The outcome of a source-specific pass over the shared detector's Items.
export interface RefinedDetection {
  items: Item[];
  // A non-blocking advisory to surface in review (e.g. a CSV name column the
  // model recognised no names in). Distinct from `safetyWarning`, which is a
  // hard, redaction-blocking alert.
  advisory?: string;
}

export interface Document {
  readonly filename: string;
  readonly text: string;
  readonly safetyWarning?: string;
  // The source-specific locator for an Item's Occurrences: line for text,
  // row/column for CSV, page for PDF.
  locate(item: Item): string;
  // Optional source-specific refinement of the shared detector's Items, run once
  // after Detect. The CSV adapter uses it to treat values in name-titled columns
  // as names (catching low-context names the model misses) and to advise when it
  // had to. Text and PDF omit it — their Items pass straight through.
  refineDetection?(items: Item[]): RefinedDetection;
  redact(accepted: Span[], opts: { saveMapping: boolean }): Promise<RedactionOutcome>;
}

// `notes.txt` -> `notes.redacted.txt`; `report.pdf` -> `report.redacted.pdf`.
export function redactedName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return `${filename}.redacted`;
  return `${filename.slice(0, dot)}.redacted${filename.slice(dot)}`;
}
