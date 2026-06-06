# CSV Document adapter — parse, locate by row/column, redact in place

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Add first-class `.csv` support via a **`CsvDocument`** adapter on the existing **Document** seam, so a dropped CSV is parsed into cells, analysed, reviewed and redacted without losing tabular structure.

Today, `.csv` is rejected in `FileDropZone` and was listed out of scope in the v1 PRD (now tracked here). The opener's non-PDF path reads raw bytes as text (`createTextDocument`), which is unsuitable for CSV: detection spans can straddle cell boundaries, line locators mislead the reviewer, and the saved file may no longer be valid CSV.

Treating a CSV as plain text (rename to `.txt` or bypass the dropzone) is unsafe. Users often have tabular exports — CRM dumps, support tickets, payroll spreadsheets — and need a `.redacted.csv` that round-trips as valid CSV.

### Adapter responsibilities

`createCsvDocument` (same factory style as `createTextDocument` / `createPdfDocument`):

- **Parse** the file at open time with RFC 4180-style rules (comma delimiter, quoted fields, `""` escape, BOM strip). Pad short rows with empty cells. Syntactic parse failure → opener returns `{ ok: false, message }` — no review screen.
- Expose a **`text`** view for **Detect** by joining parsed cells row-major with `\x1f`, maintaining an offset→`(row, col)` index. Span offsets in that view map back to **Cells** for locate and redact ([ADR 0004](../../../docs/adr/0004-csv-cell-flattening-for-detect.md)).
- **`locate(item)`** returns physical row/column locators — e.g. `row 2, col 3` or `row 2, col 3, 5 +2` — not `ln` line numbers. Row 1 is the first line of the file (header rows are not renumbered).
- **`allowMapping`**: `true` (same as text).
- **`redact(...)`** replaces accepted values **inside affected Cells only**, then re-serialises to CSV with `\r\n` line endings. Output name: `data.csv` → `data.redacted.csv`. Optional `.redactyl-mapping.json` when requested.
- Text-style **fail-open** posture: redaction does not fail closed (no PDF-style verify pass in this slice).

### Wiring

- `createDocumentOpener`: dispatch `/\.csv$/i` to `createCsvDocument(...)` before the generic text fallback.
- `FileDropZone`: add `.csv` to `ACCEPTED`, the `accept` attribute, type chips, and the unsupported-type message.
- Copy/marketing strings that list supported types (tagline, intro, tests) updated to mention `.csv` where they currently say `.pdf`, `.txt` and `.md` only.

### Suggested module layout

- `src/csv/csvParser.ts` — parse + serialise round-trip
- `src/csv/csvParser.test.ts` — quoted fields, embedded commas/newlines, BOM, malformed input, ragged rows
- `src/domain/locators.ts` — `makeCellIndex`, `itemCells`, `formatCsvLocator` (parallel to line/page helpers)
- `src/document/csvDocument.ts` + `csvDocument.test.ts` — adapter through the `Document` interface
- Extend `src/document/opener.test.ts` with CSV open + reject cases

Keep CSV logic out of `App` — same rule as the document-seam refactor.

### Non-goals (this slice)

- Excel `.xlsx` / `.xls`
- User-selectable delimiters (comma only)
- CSV schema inference or column-type-aware detectors
- Header-row detection or column-name locators (physical indices only)
- File-size or row-count advisories (deferred — same posture as text/PDF v1)
- Re-substitution UI (unchanged — mapping format only)

### Resolved decisions (grill-with-docs, 2026-06-06)

| Question | Decision |
| --- | --- |
| Header row in locators | Physical row numbers only. Row 1 may be a header; no data-row renumbering or column-name suffixes. |
| Max file size / row count | No advisory or hard gate in this slice. Revisit only if profiling shows a problem. |
| Detect text view | Row-major cell join with `\x1f` separator + offset→`(row, col)` index ([ADR 0004](../../../docs/adr/0004-csv-cell-flattening-for-detect.md)). |
| Redaction unit | Per **Cell** string replacement, then RFC 4180 re-serialise. |
| Ragged rows | Pad short rows with empty cells; do not fail. |
| Line endings on save | Normalise to `\r\n` per RFC 4180. |

### Scenario checks

- **Quoted comma:** `"Smith, Jo",jane@x.com` — email detected in col 2; comma inside col 1 preserved after redact.
- **Embedded newline:** `"line1\nline2",secret@x.com` — detection span stays inside col 1; col 2 redacts independently.
- **Header row:** `name,email` on row 1; PII on row 2 → locator `row 2, col 2`, not `row 1, col 2`.
- **Repeated value across rows:** `alice@x.com` in rows 2 and 5 → one **Item**, locator `row 2, col 3, 5`.
- **Malformed:** unclosed `"` on row 4 → open fails; no review screen.

## Acceptance criteria

- [ ] Dropping `contacts.csv` with PII in multiple columns opens review; locators show `row N, col M` coordinates, not line numbers
- [ ] A header row on physical row 1 does not renumber data rows — PII on the first data row shows `row 2, col …`
- [ ] Redacting accepted Items produces `contacts.redacted.csv` that remains valid CSV (re-parseable; quoted fields and embedded commas/newlines preserved)
- [ ] Redacted cell values are replaced with Tokens (`<EMAIL_1>`, etc.); non-PII cell content is preserved (quoting may change per RFC 4180 rules when tokens introduce special characters)
- [ ] Optional mapping checkbox produces `contacts.redactyl-mapping.json` with the same shape as the text path
- [ ] Malformed CSV (e.g. unclosed quote) is rejected at open with a clear dropzone error; no output file
- [ ] Ragged rows (fewer columns than the widest row) parse successfully with trailing empty cells
- [ ] `FileDropZone` accepts `.csv` and rejects unknown extensions with an updated message listing `.csv`
- [ ] Unit tests cover parser round-trip, cell index/locator helpers, adapter locate/redact/mapping, and opener dispatch — no React
- [ ] `tsc` clean; full test suite green

## Blocked by

None — builds on the completed document-seam work (`.scratch/document-seam/`).

## References

- Domain vocabulary: `CONTEXT.md` (**Cell**, CSV **Document** kind)
- ADR: `docs/adr/0004-csv-cell-flattening-for-detect.md`
- Current rejection site: `src/ui/FileDropZone.tsx`
- Current opener dispatch: `src/document/opener.ts`

## Comments

### Opened from Slack #new-channel (2026-06-06)

Feature request: add `.csv` file type support to Redactyl.

### Grill-with-docs session (2026-06-06)

Resolved open queries; decisions captured in §Resolved decisions above. Status moved to `ready-for-agent`.

### Moved from `.scratch/csv-support/` (2026-06-06)

Consolidated into the v1 issue tracker; separate csv-support folder removed.
