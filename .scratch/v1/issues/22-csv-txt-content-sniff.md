# CSV content sniffing for misnamed `.txt` uploads

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## Tracker mapping

GitHub issue **#11** — local issue `22` (GitHub `11` is the offline service worker in `.scratch/v1/issues/11-offline-service-worker.md`).

## Problem

When a valid CSV is uploaded with a `.txt` extension, the opener dispatched by extension only and routed to `createTextDocument`. Redaction then operated on the raw string rather than individual **Cells**, corrupting row/column structure and producing output that no longer round-tripped as valid CSV.

## What was built

Before falling through to `createTextDocument` for `.txt` uploads, `createDocumentOpener` now calls `looksLikeCsv()` (`src/csv/csvParser.ts`). When the heuristic passes, the file opens through `createCsvDocument` with the same cell flattening and redaction path as a `.csv` upload ([ADR 0004](../../../docs/adr/0004-csv-cell-flattening-for-detect.md)).

### Resolved decisions (delivered)

| Question | Decision |
| --- | --- |
| Sniff scope | `.txt` only — not `.md` |
| Heuristic | RFC 4180 parse must succeed; ≥2 rows; ≥2 columns somewhere; ≥2 rows at the widest column count (unpadded widths via `parseCsvRows`) |
| False positives | Multi-line prose where every line contains a comma may qualify — accepted tradeoff for catching renamed exports |
| False negatives | Single-row CSV, TSV/semicolon files, and ragged grids with only one row at max width still open as plain text |
| User feedback | No in-app notice when a `.txt` was opened via the CSV path |
| Output naming | Original filename preserved (`contacts.txt` → `contacts.redacted.txt`) |
| Malformed sniff | Parse failure → fall back to plain text (fail open), unlike `.csv` which fails closed at open |
| User notice | None — sniffing is silent |

## Acceptance criteria

- [x] A valid CSV renamed to `.txt` opens with row/column locators (`row N, col M`), not line numbers — `opener.test.ts`
- [x] Redacted output remains valid CSV (re-parseable; quoted fields and embedded commas preserved) — `opener.test.ts`
- [x] A genuine prose `.txt` file still opens as plain text — `opener.test.ts`, `csvParser.test.ts`
- [x] Malformed content that fails CSV parse still opens as plain text — `opener.test.ts`, `looksLikeCsv` returns `false`
- [x] Unit tests in `src/document/opener.test.ts` covering sniff success, sniff fallback, and prose `.txt` unchanged
- [x] `pnpm test` green

## Blocked by

- `.scratch/v1/issues/21-csv-document-adapter.md` (CSV adapter and parser)

## References

- ADR: `docs/adr/0004-csv-cell-flattening-for-detect.md` (§ Misnamed `.txt` uploads)
- `src/document/opener.ts`, `src/csv/csvParser.ts` (`looksLikeCsv`)

## Comments

### Implemented (2026-06-11, PR #13)

- Added `looksLikeCsv()` to `src/csv/csvParser.ts`, sharing `parseCsvRows` with `parseCsv`.
- Wired sniff into `createDocumentOpener` for `/\.txt$/i` before the text fallback.
- Tests in `csvParser.test.ts` and `opener.test.ts` cover BOM/CRLF, prose rejection, malformed fallback, and cell-based redaction through the sniff path.
