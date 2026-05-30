# PDF rasterise fallback for pages that fail verification

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The safety net that makes the true-redaction guarantee hold even for PDFs with tricky fonts (ligatures, CID fonts, kerned `TJ` operators) where the content-stream rewrite leaves residual text.

When `PdfVerifier` finds leaks on specific pages after the initial redaction, `PdfRedactor` rasterises those pages (renders them to image), then re-verifies. If the re-verified output is clean, allow download and show a banner — `✓ Re-verified after flattening pages X, Y` — plus a note that those pages are now images (text not selectable). If a page still leaks after rasterising, block the download and surface an error (consistent with the fail-closed guarantee).

## Acceptance criteria

- [x] A fixture that fails the initial rewrite triggers rasterisation of the affected pages — kerning-split `TJ` fixture (`buildKerningSplitPdf`); `verifyPdf` reports the leaking pages and `redactAndVerifyPdf` rasterises exactly those
- [x] After rasterising, the output is re-verified before any download is offered — pipeline re-runs `verifyPdf` on the rasterised bytes and only returns `ok: true` if clean
- [x] Receipt shows the `✓ Re-verified after flattening pages X, Y` line only when a rasterise fallback actually ran, with the "pages are now images" note — `Receipt` renders `.raster-note` only when `rasterisedPages.length > 0`
- [x] If a page still leaks after rasterising, download is blocked and an error is surfaced — `redactAndVerifyPdf` returns `ok: false`; App fails closed (no file) with an error
- [x] `PdfRedactor` integration tests: kerning-split fixture forces the fallback and asserts no leaks via `PdfVerifier`; `pdftotext` cross-check remains conditional (binary absent here). Ligature-specific fixture folded into the same residual-text path (kerning-split is the tractable, deterministic case to author)

## Blocked by

- `.scratch/v1/issues/08-pdf-happy-path.md`

## Comments

### Implemented (2026-05-30, agent)

`redactAndVerifyPdf(source, spans, glyphs, { detect, renderPage })` is the full pipeline: rewrite +
boxes → verify → if leaks, rasterise each leaking page (rendered from the already-box-drawn bytes, so
the image carries the black boxes) → re-verify; returns `{ bytes, ok, rasterisedPages }`, failing
closed if a leak survives. `verifyPdf` now also returns `leakPages` (leaked values mapped to output
pages via `makePageIndex`). Rasterising replaces a page's `Contents` with a single full-page image and
swaps its `Resources` to just that image, dropping the text layer entirely.

Rendering needs a canvas, so it's injected (`RenderPageToPng`): browser uses `src/pdf/pdfRender.ts`
(pdfjs → `<canvas>` → PNG); tests pass a stub PNG, which is enough to prove the pipeline (what matters
is that rasterising removes the text layer, not the pixels). App wires `renderPageToPng` and shows the
flatten note on the receipt.

Validated against the real CID-font receipt that prompted this work (`$20 ... Riddells Primary.pdf`):
rewrite-only leaks on pages 1–2; the pipeline rasterises both and re-verifies clean. The only
browser-only untested bit is canvas render fidelity. tsc clean; 130 tests pass (1 skipped `pdftotext`);
`pnpm build` clean.
