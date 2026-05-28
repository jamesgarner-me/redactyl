# PDF happy-path tracer bullet — extract, true-redact, verify

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The first end-to-end PDF path on clean text PDFs, proving true redaction before the edge cases (safety checks, rasterise) are layered on.

`PdfExtractor` extracts text from a clean text PDF with per-glyph bounding-box positions via the pdfjs API. The extracted text flows through the existing `Detector` and review screen, with **page-number** locators (`p. 1, 4, 7`). `PdfRedactor` performs *true* redaction with pdf-lib — rewriting the underlying text operators in the content stream so copy/paste yields nothing — and draws a black rectangle over each redacted region. `PdfVerifier` re-parses the output and re-runs the `Detector`, comparing detected Spans (not naive substring containment) so innocent substrings aren't falsely flagged. The receipt shows the `✓ Verified — no detectable PII in the output` badge and offers a manual save of `<basename>.redacted.pdf`.

Scope is clean fixtures only — encryption/scanned/garbled handling is slice 9 and the rasterise fallback is slice 10.

## Acceptance criteria

- [ ] A clean text PDF extracts text with per-glyph bounding boxes
- [ ] PDF Items show page-number locators in the review list
- [ ] Accepted Items are removed from the content stream (copy/paste from the output yields no PII) and covered with a black rectangle
- [ ] `PdfVerifier` re-parses + re-detects and compares Spans, not substrings
- [ ] Receipt shows the `✓ Verified` badge and a manual save of `<basename>.redacted.pdf`
- [ ] Integration tests on clean/multi-page fixtures assert (a) `PdfVerifier` reports no leaks and (b) `pdftotext` on the output produces no accepted PII strings
- [ ] A `PdfVerifier` fixture that still contains a known value reports a leak; a clean fixture reports none

## Blocked by

- `.scratch/v1/issues/03-review-screen-ux.md`
- `.scratch/v1/issues/07-ner-detection-layer.md`
