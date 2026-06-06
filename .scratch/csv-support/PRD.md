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
4. Detection and redaction run **per cell** so commas, quotes and newlines inside quoted fields are preserved.
5. Unsupported or unreadable CSV fails with a clear dropzone message (no silent corruption).

## Non-goals (this slice)

- Excel `.xlsx` / `.xls`
- User-selectable delimiters (comma only for v1 of CSV support)
- CSV schema inference or column-type-aware detectors
- Re-substitution UI (unchanged — mapping format only)

## Architecture fit

Follow the existing **Document** seam (`CONTEXT.md`, `src/document/`):

- New `CsvDocument` adapter behind `Document`
- `createDocumentOpener` dispatches `.csv` to the adapter
- `FileDropZone` accepts and advertises `.csv`
- `Detect` still runs on a flattened `text` view, but span positions map back to cells for locate/redact

## Parsing baseline

RFC 4180-style parsing:

- Comma delimiter
- Double-quote escaping (`""` inside quoted fields)
- Optional UTF-8 BOM strip on read
- `\r\n`, `\n`, and `\r` line endings

Malformed input (unclosed quotes, ragged row lengths) → fail closed at open with a user-visible error.

## Locator format

User-facing locators for CSV Items use row/column coordinates, e.g. `row 4, col 3` (exact formatting TBD in implementation; must be distinct from text `ln` and PDF `p.` locators).

## Output naming

`export.csv` → `export.redacted.csv` (same `redactedName` helper pattern as text/PDF).

## Open questions

- Whether to surface the header row in locators (`row 1` = header vs data row 1) — prefer 1-based data rows with optional header annotation in the locator when a header row is detected.
- Maximum file size / row count before advisory — defer unless profiling shows a problem.
