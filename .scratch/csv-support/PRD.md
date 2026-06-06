# CSV support — Redactyl post-v1

## Summary

Add first-class support for `.csv` files so users can sanitise tabular exports (CRM dumps, support ticket exports, payroll spreadsheets saved as CSV) without converting to `.txt` first.

## Motivation

CSV is called out as out of scope in the v1 PRD (`.scratch/v1/PRD.md` §Out of Scope). It is a common real-world format for structured PII — names, emails, phone numbers, account IDs in columns — and users often have a `.csv` in hand when they want to paste a safe subset into an LLM.

Treating a CSV as a plain text file (rename to `.txt` or bypass the dropzone) is unsafe: redaction spans can cross cell boundaries, locators become misleading line numbers, and the output no longer round-trips as valid CSV.

## Product goals

1. A user can drop a `.csv` and get a `.redacted.csv` back with the same row/column structure.
2. Review locators reference **row and column** (not line numbers).
3. **Mapping** sidecar is offered (same posture as text — off by default).
4. Detection and redaction run with **cell-boundary safety** — commas, quotes and newlines inside quoted fields are preserved.
5. Unsupported or unreadable CSV fails with a clear dropzone message (no silent corruption).

## Non-goals (this slice)

- Excel `.xlsx` / `.xls`
- User-selectable delimiters (comma only for v1 of CSV support)
- CSV schema inference or column-type-aware detectors
- Header-row detection or column-name locators (physical indices only in v1)
- File-size or row-count advisories (deferred — same posture as text/PDF v1)
- Re-substitution UI (unchanged — mapping format only)

## Architecture fit

Follow the existing **Document** seam (`CONTEXT.md`, `src/document/`):

- New `CsvDocument` adapter behind `Document` via `createCsvDocument`
- `createDocumentOpener` dispatches `.csv` to the adapter
- `FileDropZone` accepts and advertises `.csv`
- **Detect** runs on a flattened `text` view; span offsets map back to **Cells** for locate/redact (see [ADR 0004](../../docs/adr/0004-csv-cell-flattening-for-detect.md))

## Parsing baseline

RFC 4180-style parsing:

- Comma delimiter
- Double-quote escaping (`""` inside quoted fields)
- UTF-8 BOM stripped on read; not written on save
- `\r\n`, `\n`, and `\r` line endings accepted on read
- Unequal row lengths padded with empty cells on parse
- Syntactic failures only (unclosed quotes, unparseable structure) → fail closed at open with a user-visible error

## Locator format

Physical 1-based coordinates — row 1 is the first line of the file (often a header; no renumbering). Column 1 is the leftmost cell.

User-facing format mirrors text/PDF truncation: `row 2, col 3` or `row 2, col 3, 5 +2` when an Item spans many cells.

## Output naming

`export.csv` → `export.redacted.csv` (same `redactedName` helper pattern as text/PDF).

## Resolved decisions (grill-with-docs, 2026-06-06)

| Question | Decision |
| --- | --- |
| Header row in locators | Physical row numbers only. Row 1 may be a header; no data-row renumbering or column-name suffixes in v1. |
| Max file size / row count | No advisory or hard gate in this slice. Revisit only if profiling shows a problem. |
| Detect text view | Row-major cell join with `\x1f` separator + offset→`(row, col)` index ([ADR 0004](../../docs/adr/0004-csv-cell-flattening-for-detect.md)). |
| Redaction unit | Per **Cell** string replacement, then RFC 4180 re-serialise. |
| Ragged rows | Pad short rows with empty cells; do not fail. |
| Line endings on save | Normalise to `\r\n` per RFC 4180. |

## Scenario checks

- **Quoted comma:** `"Smith, Jo",jane@x.com` — email detected in col 2; comma inside col 1 preserved after redact.
- **Embedded newline:** `"line1\nline2",secret@x.com` — detection span stays inside col 1; col 2 redacts independently.
- **Header row:** `name,email` on row 1; PII on row 2 → locator `row 2, col 2`, not `row 1, col 2`.
- **Repeated value across rows:** `alice@x.com` in rows 2 and 5 → one **Item**, locator `row 2, col 3, 5`.
- **Malformed:** unclosed `"` on row 4 → open fails; no review screen.
