# PDF safety checks — fail-closed for encrypted / scanned / garbled

Status: ready-for-agent

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

- [ ] Encrypted PDF returns `EncryptedPdfError` and shows the blocking error card with no list and no output
- [ ] Scanned PDF returns `ScannedPdfError`; review list still shows partial results under a red banner naming the pages; Redact disabled
- [ ] Garbled PDF returns `GarbledTextError` with the same banner-over-results treatment; Redact disabled
- [ ] No output file is ever produced while any safety check is firing
- [ ] Disabled `Redact →` shows an inline reason
- [ ] `PdfExtractor` fixture tests: clean (extracts), encrypted, scanned, garbled each return the right error type

## Blocked by

- `.scratch/v1/issues/08-pdf-happy-path.md`
