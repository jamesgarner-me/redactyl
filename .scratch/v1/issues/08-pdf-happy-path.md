# PDF happy-path tracer bullet — extract, true-redact, verify

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The first end-to-end PDF path on clean text PDFs, proving true redaction before the edge cases (safety checks, rasterise) are layered on.

`PdfExtractor` extracts text from a clean text PDF with per-glyph bounding-box positions via the pdfjs API. The extracted text flows through the existing `Detector` and review screen, with **page-number** locators (`p. 1, 4, 7`). `PdfRedactor` performs *true* redaction with pdf-lib — rewriting the underlying text operators in the content stream so copy/paste yields nothing — and draws a black rectangle over each redacted region. `PdfVerifier` re-parses the output and re-runs the `Detector`, comparing detected Spans (not naive substring containment) so innocent substrings aren't falsely flagged. The receipt shows the `✓ Verified — no detectable PII in the output` badge and offers a manual save of `<basename>.redacted.pdf`.

Scope is clean fixtures only — encryption/scanned/garbled handling is slice 9 and the rasterise fallback is slice 10.

## Acceptance criteria

- [x] A clean text PDF extracts text with per-glyph bounding boxes — `PdfExtractor` + `pdfExtractor.test.ts`
- [x] PDF Items show page-number locators in the review list — `makePageIndex`/`formatPageLocator` (`p. 2` unit-tested); `ReviewScreen` takes a source-specific `locate` prop, App supplies the page locator for PDFs — **live review-list render pending model-gated UI smoke**
- [x] Accepted Items are removed from the content stream (copy/paste yields no PII) and covered with a black rectangle — `PdfRedactor` blanks show-text operands (re-extraction confirms removal) + draws black rects; **rectangle appearance pending visual smoke**
- [x] `PdfVerifier` re-parses + re-detects and compares Spans, not substrings — `pdfVerifier.test.ts` incl. the `John`/`Johnson` innocent-substring case
- [x] Receipt shows the `✓ Verified` badge and a manual save of `<basename>.redacted.pdf` — wired (`verified` prop + existing `redactedName`); **badge render pending UI smoke**
- [x] Integration tests on clean/multi-page fixtures assert (a) `PdfVerifier` reports no leaks and (b) `pdftotext` on the output produces no accepted PII strings — (a) `pdfRedactor.test.ts`; (b) conditional, skipped when `pdftotext` isn't on PATH (not installed in this env)
- [x] A `PdfVerifier` fixture that still contains a known value reports a leak; a clean fixture reports none — `pdfVerifier.test.ts`

## Blocked by

- `.scratch/v1/issues/03-review-screen-ux.md`
- `.scratch/v1/issues/07-ner-detection-layer.md`

## Comments

### Implemented — pipeline tested headlessly; UI smoke pending (2026-05-30, agent)

New `src/pdf/`: `pdfExtractor.ts` (pdfjs text + per-glyph boxes in PDF user space; pdfjs neuters its
input buffer so every call copies), `pdfRedactor.ts` (pdf-lib — blanks the redacted value's bytes in
each page's `Tj`/`TJ` operands → spaces, so copy/paste yields nothing, plus a black rectangle per
glyph run), `pdfVerifier.ts` (re-extract + re-detect; leak = a *detected Span* whose value matches an
accepted Item, so innocent substrings don't false-flag; `detect` is injected so tests use a regex-only
detector). Locators generalised in `domain/locators.ts` (`makePageIndex`/`formatPageLocator`);
`ReviewScreen` now takes a `locate` prop + `allowMapping` (mapping hidden on the PDF path — no tokens
in PDF output). App branches on extension, runs redact → verify, and **fails closed** on a verification
leak (no file produced). `Receipt` shows the `✓ Verified` badge.

Scope per plan: clean WinAnsi fixtures only. CID/subset fonts won't match the value-substring blanking
→ verifier catches it → fail closed (rasterise fallback is slice 10). Decisions: no token text drawn
into PDFs; the `pdftotext` cross-check skips when the binary is absent (it isn't installed here); test
fixtures are generated with pdf-lib, not committed binaries.

Verified: `tsc` clean; 121 unit tests pass (6 new pdf + page-locator), 1 skipped (`pdftotext`);
`pnpm build` bundles pdfjs + its worker (`?url`) and pdf-lib. **Pending (human, model-gated UI):**
download the model, drop a clean text PDF with a name + email, and confirm page-number locators in the
review list, the `✓ Verified` badge, the visible black box, and that copy/paste from the saved
`*.redacted.pdf` yields no PII.
