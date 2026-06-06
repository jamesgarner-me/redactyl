# CSV Document adapter — parse, locate by row/column, redact in place

Status: needs-triage

## Parent

`.scratch/csv-support/PRD.md`

## What to build

Add first-class `.csv` support via a **`CsvDocument`** adapter on the existing **Document** seam, so a dropped CSV is parsed into cells, analysed, reviewed and redacted without losing tabular structure.

Today, `.csv` is rejected in `FileDropZone` and was explicitly out of v1 scope (`.scratch/v1/PRD.md` §Out of Scope). The opener's non-PDF path reads raw bytes as text (`createTextDocument`), which is unsuitable for CSV: detection spans can straddle cell boundaries, line locators mislead the reviewer, and the saved file may no longer be valid CSV.

### Adapter responsibilities

`CsvDocument` (name TBD — follow existing `createTextDocument` / `createPdfDocument` factory style):

- **Parse** the file at open time with RFC 4180-style rules (comma delimiter, quoted fields, `""` escape, BOM strip). Malformed CSV → opener returns `{ ok: false, message }` — no review screen.
- Expose a **`text`** view for **Detect** by flattening cell values in a stable, documented order (e.g. row-major, cells joined with a delimiter that cannot appear in parsed cell content). Span offsets in that view must map back to `(row, col)` for locate and redact.
- **`locate(item)`** returns row/column locators (e.g. `row 4, col 3`) for the Item's Occurrences — not `ln` line numbers.
- **`allowMapping`**: `true` (same as text).
- **`redact(...)`** replaces accepted values **inside the affected cells only**, then re-serialises to CSV bytes. Output name: `data.csv` → `data.redacted.csv`. Optional `.redactyl-mapping.json` when requested.
- Text-style **fail-open** posture: redaction does not fail closed (no PDF-style verify pass in this slice).

### Wiring

- `createDocumentOpener`: dispatch `/\.csv$/i` to `createCsvDocument(...)` before the generic text fallback.
- `FileDropZone`: add `.csv` to `ACCEPTED`, the `accept` attribute, type chips, and the unsupported-type message.
- Copy/marketing strings that list supported types (tagline, intro, tests) updated to mention `.csv` where they currently say `.pdf`, `.txt` and `.md` only.

### Suggested module layout

- `src/csv/csvParser.ts` — parse + serialise round-trip
- `src/csv/csvParser.test.ts` — quoted fields, embedded commas/newlines, BOM, malformed input
- `src/document/csvDocument.ts` + `csvDocument.test.ts` — adapter through the `Document` interface
- Extend `src/document/opener.test.ts` with CSV open + reject cases

Keep CSV logic out of `App` — same rule as the document-seam refactor.

## Acceptance criteria

- [ ] Dropping `contacts.csv` with PII in multiple columns opens review; locators show row/column coordinates, not line numbers
- [ ] Redacting accepted Items produces `contacts.redacted.csv` that remains valid CSV (re-parseable; quoted fields and embedded commas preserved)
- [ ] Redacted cell values are replaced with Tokens (`<EMAIL_1>`, etc.); non-PII cells are byte-identical aside from normalised line endings if the serializer normalises them (document the choice in tests)
- [ ] Optional mapping checkbox produces `contacts.redactyl-mapping.json` with the same shape as the text path
- [ ] Malformed CSV (e.g. unclosed quote) is rejected at open with a clear dropzone error; no output file
- [ ] `FileDropZone` accepts `.csv` and rejects unknown extensions with an updated message listing `.csv`
- [ ] Unit tests cover parser round-trip, adapter locate/redact/mapping, and opener dispatch — no React
- [ ] `tsc` clean; full test suite green

## Blocked by

None — can start once triaged. Builds on the completed document-seam work (`.scratch/document-seam/`).

## References

- Domain vocabulary: `CONTEXT.md`
- v1 explicit deferral: `.scratch/v1/PRD.md` ("DOCX, CSV, images — file types beyond PDF + text")
- Current rejection site: `src/ui/FileDropZone.tsx`
- Current opener dispatch: `src/document/opener.ts`

## Comments

### Opened from Slack #new-channel (2026-06-06)

Feature request: add `.csv` file type support to Redactyl.
