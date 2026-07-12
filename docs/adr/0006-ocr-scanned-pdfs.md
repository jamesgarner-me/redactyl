# OCR scanned PDFs with Tesseract, flatten to redact

Redactyl detects scanned PDFs (a page with no text layer that paints an image) but previously could not sanitise them — the page's PII lives in raster pixels the text detector never sees, so those files were flagged `safety: scanned` and blocked. This ADR adds in-browser OCR so scanned pages become reviewable and truly redactable.

**The whole design goal is that OCR is invisible to the rest of the pipeline.** OCR converts a page's pixels into the *same* `text` + `GlyphBox[]` shapes clean extraction produces, so **Detect**, `drawRedactionBoxes`, locators, and propagation run unchanged. OCR's only job is: pixels in → a `PageExtract` out.

## Where OCR runs

Extraction is split into `extractPages` (per-page pdfjs work, page-local glyph offsets, a per-page `kind`) and `assemble` (concatenate pages, rebase glyph offsets to global, derive `safety`). `extractPdf = assemble(extractPages(...))` is unchanged and is what `PdfVerifier` re-runs — **the verify oracle stays text-only and canvas-free; it never triggers OCR.**

OCR is a separate pass in the **opener**, not inside `extractPdf`: for each `scanned` page it renders the page to pixels (`renderPageToImageData`, 2× via canvas), OCRs it, and replaces that page's `PageExtract` with a `kind: 'ocr'` one built from the recognised words. `assemble` then rebases offsets and drops the OCR'd page out of `safety` and into a new `imageTextPages` list. Because offset rebasing lives only in `assemble`, OCR never deals in global offsets.

### Coordinate transform

Tesseract emits per-word boxes in top-left pixel space at scale `S`. `wordsToPage` converts each to `GlyphBox` (PDF user space, bottom-left origin), distributing a word's advance width evenly across its characters exactly like the text extractor: for a page of user-space height `H`,

```
x = x0/S   y = H − y1/S   w = (x1−x0)/S   h = (y1−y0)/S
```

Same-line words join with a space, lines with a newline, so a multi-word value still groups into one box per line via the existing `page:round(y)` run logic.

## Redaction: flatten, don't just box

**A vector black rectangle over a scanned page does not remove the underlying image** — the scan stays extractable. So OCR'd pages (`imageTextPages`) are **always force-flattened**: after the box is drawn, the page is rendered to a PNG and its content replaced (`rasterisePage`), baking the box into pixels and dropping the original scan. This is independent of the text-verify oracle, which is blind to image PII and would falsely pass an image-only page.

**Defence in depth: re-OCR verification.** After flattening, each page is re-OCR'd; if any accepted value's text (normalised to tolerate OCR noise) reappears, redaction **fails closed** — a mis-placed or too-small box is caught rather than shipped. This is the OCR analogue of the existing text verifier.

## Engine choice: Tesseract.js, self-hosted, precached

- **`tesseract.js`** is the mature in-browser OCR with word-level bounding boxes; it runs its WASM core in its own worker (kept separate from the NER detector worker — different lifecycles).
- **Self-hosted under `/ocr`, not the CDN default.** The app runs under COEP `require-corp` (ADR 0001); a cross-origin CDN core/wasm would be blocked, and same-origin is exempt. `scripts/copy-ocr-assets.mjs` copies the worker + LSTM cores (plain/SIMD/relaxed-SIMD, so the browser picks the best it supports) from `node_modules` and downloads `eng.traineddata.gz` (tessdata_fast) into `public/ocr` before dev/build. The binaries are gitignored and regenerated, not committed.
- **Precached with the app** (workbox `globPatterns` gains `gz`), so scanned PDFs work offline with no separate consent gate — unlike the 770 MB NER model. The single-thread cores are shipped so OCR does not depend on SharedArrayBuffer.

## Scope (v1) and consequences

- **Scanned, unrotated (`/Rotate 0`) pages only.** Rotated scans, garbled (bad-font) pages, and mixed image+text pages stay `safety`-blocked and fail closed — the rendered pixels and pdf-lib's draw space only agree at rotation 0.
- A scan **OCR could not read** (engine failure, or OCR disabled) keeps its `scanned` warning and stays blocked; **Batch/unattended** quarantines it as a failure rather than emitting an unsanitised file.
- **OCR accuracy is a detection concern, not a leak.** A word OCR misses is PII left visible (as scans always were), never an already-detected value leaking — force-flatten + re-OCR guarantee detected values are removed. Copy stays honest about this.
- The stale "v1 doesn't OCR" safety copy is replaced with "scans Redactyl couldn't read".
