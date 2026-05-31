# PdfDocument adapter

Status: completed

## Parent

Architecture review candidate B — "the `Document` seam".

## What to build

Add the **PDF** adapter behind the `Document` interface and route the PDF redaction path through it, so a `.pdf` drops, analyses, reviews and redacts exactly as today — including true-redaction, fail-closed verification, and the rasterise fallback — but all PDF-source-specific knowledge now lives in `PdfDocument`.

`PdfDocument` owns: page-locator construction (`p. 1, 4`), the safety warning string for scanned/garbled PDFs (computed at open time and surfaced as `safetyWarning`), and `redact(...)` wrapping the existing true-redaction-and-verify pipeline. It captures the **detect** and **renderPage** deps needed for re-verification (injected at construction — see slice 03). The defence-in-depth guard "never produce output when a safety warning is present" lives inside `PdfDocument.redact`, returning the fail-closed failure result. A verification leak that survives rasterisation returns the same fail-closed failure.

At this slice the opener still doesn't exist; `App` constructs a `PdfDocument` in its PDF branch (temporarily passing the deps) and uses it for locate/redact/capabilities. Encrypted-PDF handling and `ReviewBase`/`makeLocator` removal come in slice 03.

## Acceptance criteria

- [ ] `PdfDocument` implements the `Document` interface: page locators, `safetyWarning` for scanned/garbled PDFs, `allowMapping` false
- [ ] `redact(...)` runs true-redaction + verify + rasterise fallback; a surviving leak returns the fail-closed failure result (no file produced)
- [ ] The safety-warning guard is enforced inside `redact` (never outputs a flagged-unsafe file)
- [ ] The PDF drop → review → redact flow is routed through `PdfDocument`; clean PDFs redact and verify identically to before, including rasterised-pages reporting on the receipt
- [ ] Unit tests exercise `PdfDocument` through the interface: page locator, fail-closed on unverifiable leak, guard blocks output when `safetyWarning` set
- [ ] `tsc` clean; full suite green

## Blocked by

- `.scratch/document-seam/issues/01-document-interface-text-adapter.md`
