# Flatten CSV cells with a unit separator for Detect, redact per Cell

CSV support needs **Detect** to run on the existing pipeline (regex + NER over a single `text` string with character offsets), but redaction must stay **cell-boundary-safe** so commas, quotes and embedded newlines in quoted fields survive. We flatten parsed cells into one string by joining them row-major with ASCII unit separator (`\x1f`), building an offset→`(row, col)` index alongside. Spans found in the flat view map back to Cells for `locate` and `redact`; replacement happens inside each affected Cell's string before RFC 4180 re-serialisation.

## Considered options

- **Treat CSV as plain text** (the pre-CSV opener fallback for non-PDF files). Rejected for `.csv` uploads and for tabular content that passes the sniff heuristic: spans can straddle cell boundaries, line locators mislead the reviewer, and the saved file may no longer be valid CSV.
- **Run Detect independently on each Cell.** Simpler mentally, but duplicates work, loses cross-cell context the NER model might use, and complicates token assignment order (first-appearance is document-wide today).
- **Flatten with newline delimiters between rows.** Rejected: parsed cell values can contain `\n` inside quoted fields, so row delimiters are ambiguous.

## Opening strategy

Files reach the CSV adapter (`createCsvDocument`) in two ways:

1. **Extension dispatch** — filenames ending in `.csv` are parsed at open time. A syntactic parse failure (e.g. an unclosed quote) is **fail-closed**: the opener returns an error and no review screen is shown.
2. **Content sniff for misnamed `.txt` uploads** — before falling through to the plain-text adapter, `.txt` files are checked with `looksLikeCsv()` in `src/csv/csvParser.ts`. When the heuristic passes, the same `createCsvDocument` path runs while **preserving the original filename** (`contacts.txt` → `contacts.redacted.txt`). This addresses renamed exports from legacy systems or upload restrictions (GitHub #11).

Sniffing is **not** applied to `.md` files. There is no in-app notice when a `.txt` was opened via the CSV path.

### `looksLikeCsv` heuristic

The sniff reuses `parseCsvRows` (RFC 4180 parse without row padding) and requires:

- at least two rows;
- at least two columns in the widest row;
- at least two rows with two or more fields;
- at least two rows at the widest (unpadded) column count.

Parse errors return `false` and the opener falls back to plain text (**fail-open**), unlike `.csv` extension uploads which fail closed.

**Accepted tradeoffs:**

- **False positives:** multi-line prose where every line contains a comma may qualify as CSV.
- **False negatives:** single-row CSV, TSV/semicolon-delimited files, and ragged grids where only one row reaches the max column count still open as plain text.

## Consequences

- The flattening delimiter must never appear in parsed cell content; `\x1f` is reserved for this purpose only.
- Unequal row lengths are padded with empty Cells on parse rather than rejected — only syntactic parse failures on `.csv` extension uploads fail closed at open.
- Serialized output uses `\r\n` line endings per RFC 4180; UTF-8 BOM is stripped on read and not written on save.
- Sniffed `.txt` files are redacted with the cell adapter but keep their original extension on download; output remains valid CSV structure even when the filename still says `.txt`.
