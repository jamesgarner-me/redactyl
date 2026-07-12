import type { Item, Span } from '../domain/types';
import { formatPageLocator, itemLines, makePageIndex } from '../domain/locators';
import { type GlyphBox, type PdfSafety } from '../pdf/pdfExtractor';
import type { OcrAugmentDeps } from '../pdf/pdfOcr';
import { redactAndVerifyPdf, type RenderPageToPng } from '../pdf/pdfRedactor';
import { assignTokens } from '../redaction/tokeniser';
import { buildMapping, mappingName } from '../redaction/mappingExporter';
import { type Document, type RedactionOutcome, redactedName } from './document';

// Deps the PDF adapter needs to re-verify its own output: re-detect on the
// rewritten text, rasterise a page that still leaks, and (when OCR is available)
// re-OCR flattened image pages to confirm the redacted values are gone. Injected
// once (at opener construction) so open()/redact() stay dep-free at the call site.
export interface PdfDocumentDeps {
  detect: (text: string) => Item[] | Promise<Item[]>;
  renderPage: RenderPageToPng;
  // OCR engine + pixel renderer. Present enables OCR of scanned pages at open
  // time and re-OCR verification of flattened pages at redact time.
  ocr?: OcrAugmentDeps;
}

export interface PdfDocumentInput {
  filename: string;
  text: string;
  glyphs: GlyphBox[];
  // Original bytes — pdfjs neuters its input, so these are the buffer redaction
  // and verification re-read.
  bytes: Uint8Array;
  // The non-fatal safety result (scanned/garbled). Encrypted never reaches here
  // — the opener turns it into an open failure instead.
  safety: Exclude<PdfSafety, { kind: 'encrypted' }> | null;
  // Pages whose text came from OCR — redaction must flatten them to destroy the
  // scan pixels a vector box alone would leave extractable.
  imageTextPages: number[];
}

// Banner copy for a non-fatal PDF safety issue (scanned/garbled). Both block
// redaction and stress that the file is NOT sanitised. A `scanned` warning only
// survives to here when OCR could not read the page (it failed or was disabled).
function safetyMessage(safety: Exclude<PdfSafety, { kind: 'encrypted' }>): string {
  const pages = safety.pages.join(', ');
  const plural = safety.pages.length > 1 ? 's' : '';
  return safety.kind === 'scanned'
    ? `Page${plural} ${pages} are scans Redactyl couldn't read, so this file is NOT sanitised — don't paste it into an AI tool assuming it's clean.`
    : `Page${plural} ${pages} produced unreadable text, so detection can't be trusted. This file is NOT sanitised.`;
}

// The PDF Document adapter. Owns page locators, the safety-warning string, and
// true redaction (blank glyphs + black boxes → verify → rasterise leaking pages
// → re-verify). Redaction is fail-closed: a leak surviving rasterisation, or a
// file already flagged unsafe, returns a failure result and produces no output.
// When the user opts into a Mapping sidecar, tokens are assigned from the
// accepted Spans and recorded; unlike text/CSV those tokens are not written into
// the output (glyphs are blanked) — the sidecar records what was removed.
export function createPdfDocument(input: PdfDocumentInput, deps: PdfDocumentDeps): Document {
  const { filename, text, glyphs, bytes, safety, imageTextPages } = input;
  const pageAt = makePageIndex(glyphs);
  const safetyWarning = safety ? safetyMessage(safety) : undefined;

  return {
    filename,
    text,
    safetyWarning,
    locate(item: Item): string {
      return formatPageLocator(itemLines(item, pageAt));
    },
    async redact(accepted: Span[], { saveMapping }): Promise<RedactionOutcome> {
      // Defence in depth: the UI disables Redact when a safety warning is
      // present, but never produce output for a file we've flagged as unsafe.
      if (safetyWarning) {
        return { ok: false, message: safetyWarning };
      }
      try {
        const outcome = await redactAndVerifyPdf(bytes, accepted, glyphs, imageTextPages, deps);
        if (!outcome.ok) {
          // A leak survived even the rasterise fallback — fail closed.
          return {
            ok: false,
            message:
              "Redaction couldn't be verified even after flattening affected pages. No file was produced.",
          };
        }
        // Uint8Array.from yields an ArrayBuffer-backed copy (a valid BlobPart);
        // pdf-lib's save() return is typed over the broader ArrayBufferLike.
        const blob = new Blob([Uint8Array.from(outcome.bytes)], { type: 'application/pdf' });
        const mapping = saveMapping
          ? {
              name: mappingName(filename),
              blob: new Blob(
                [JSON.stringify(buildMapping(assignTokens(accepted).entries, filename), null, 2)],
                { type: 'application/json' },
              ),
            }
          : undefined;
        return {
          ok: true,
          outputName: redactedName(filename),
          blob,
          mapping,
          rasterisedPages: outcome.rasterisedPages,
        };
      } catch {
        return { ok: false, message: 'Could not redact this PDF. No file was produced.' };
      }
    },
  };
}
