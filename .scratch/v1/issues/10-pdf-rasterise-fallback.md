# PDF rasterise fallback for pages that fail verification

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The safety net that makes the true-redaction guarantee hold even for PDFs with tricky fonts (ligatures, CID fonts, kerned `TJ` operators) where the content-stream rewrite leaves residual text.

When `PdfVerifier` finds leaks on specific pages after the initial redaction, `PdfRedactor` rasterises those pages (renders them to image), then re-verifies. If the re-verified output is clean, allow download and show a banner — `✓ Re-verified after flattening pages X, Y` — plus a note that those pages are now images (text not selectable). If a page still leaks after rasterising, block the download and surface an error (consistent with the fail-closed guarantee).

## Acceptance criteria

- [ ] A ligature-heavy fixture that fails the initial rewrite triggers rasterisation of the affected pages
- [ ] After rasterising, the output is re-verified before any download is offered
- [ ] Receipt shows the `✓ Re-verified after flattening pages X, Y` line only when a rasterise fallback actually ran, with the "pages are now images" note
- [ ] If a page still leaks after rasterising, download is blocked and an error is surfaced
- [ ] `PdfRedactor` integration tests: ligature-heavy and kerning-split-word fixtures force the fallback and assert no leaks via `PdfVerifier` and `pdftotext`

## Blocked by

- `.scratch/v1/issues/08-pdf-happy-path.md`
