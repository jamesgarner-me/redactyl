# PDF safety checks — fail-closed for encrypted / scanned / garbled

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The fail-closed guarantee for PDFs Redactyl can't safely sanitise — so the tool never hands back a file that pretends to be clean but isn't.

During extraction, run three checks, each of which prevents any output file from being produced:

1. **Encrypted** — pdfjs reports the document encrypted or throws `PasswordException` → `EncryptedPdfError`.
2. **Scanned (no text layer)** — a page has zero text items but its operator list contains image-drawing operators (`Do`, `paintImageXObject`) → `ScannedPdfError`.
3. **Garbled** — a page exceeds 5% non-printable / U+FFFD / unmapped-glyph characters → `GarbledTextError`.

Surface two UI shapes: **Encrypted** → a standalone blocking error card with no list ("PDF is password-protected; decrypt it first." + `Choose another file`). **Scanned / Garbled** → a persistent red banner pinned above a normally-rendered review list (partial detection results preserved), naming the affected pages and stating the file is **NOT** sanitised, with the `Redact →` button hard-disabled and an inline reason.

## Acceptance criteria

- [x] Encrypted PDF flagged and shows the blocking error card with no list and no output — modelled as `safety: { kind: 'encrypted' }` (a discriminated union on `ExtractedPdf`, not a thrown `EncryptedPdfError` class); App shows a dropzone error card and never enters review
- [x] Scanned PDF → `safety: { kind: 'scanned', pages }`; review list still renders partial results under a red `.safety-banner` naming the pages; Redact disabled
- [x] Garbled PDF → `safety: { kind: 'garbled', pages }` with the same banner-over-results treatment; Redact disabled
- [x] No output file is ever produced while any safety check is firing — Redact hard-disabled in the UI **and** `redactPdfFile` returns early when a warning is present
- [x] Disabled `Redact →` shows an inline reason (`RedactButton` `reason` prop)
- [x] `PdfExtractor` fixture tests: clean, encrypted, scanned each return the right `safety` (real pdf-lib fixtures); garbled is covered by `garbleRatio` unit tests on the pure predicate (authoring a truly garbled PDF needs a broken-ToUnicode font — disproportionate; the 5% threshold logic is what matters)

## Blocked by

- `.scratch/v1/issues/08-pdf-happy-path.md`

## Comments

### Implemented (2026-05-30, agent)

`extractPdf` now returns `safety: PdfSafety | null`. Three checks: **encrypted** (pdfjs throws
`PasswordException` → `{kind:'encrypted'}`, no usable text), **scanned** (a page with no text but
image-paint operators in its operator list → `{kind:'scanned',pages}`), **garbled** (a page over a 5%
unreadable-character ratio via the exported `garbleRatio` → `{kind:'garbled',pages}`; scanned outranks
garbled when both fire). App branches: encrypted → blocking dropzone error card; scanned/garbled →
review with partial results, a red banner (`safetyMessage`), and Redact hard-disabled with an inline
reason, plus a defensive early-return in `redactPdfFile`. `ReviewScreen` keeps the reassuring "all
clear" empty state only when no safety warning is set.

Naming note: the PRD/issue named thrown error classes (`EncryptedPdfError` etc.); I used a discriminated
`safety` union instead because scanned/garbled must carry **partial results** alongside the flag, which a
thrown error can't. Encrypted is the only fatal case.

Fixtures: `buildEncryptedPdf` injects a Standard `/Encrypt` dict (pdf-lib has no encryption API);
`buildScannedPdf` draws an embedded PNG with no text. Verified: tsc clean; 127 tests pass (1 skipped
`pdftotext`); `pnpm build` clean.
