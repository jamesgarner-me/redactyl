# Flatten CSV cells with a unit separator for Detect, redact per Cell

CSV support needs **Detect** to run on the existing pipeline (regex + NER over a single `text` string with character offsets), but redaction must stay **cell-boundary-safe** so commas, quotes and embedded newlines in quoted fields survive. We flatten parsed cells into one string by joining them row-major with ASCII unit separator (`\x1f`), building an offset→`(row, col)` index alongside. Spans found in the flat view map back to Cells for `locate` and `redact`; replacement happens inside each affected Cell's string before RFC 4180 re-serialisation.

## Considered options

- **Treat CSV as plain text** (today's opener fallback). Rejected: spans can straddle cell boundaries, line locators mislead the reviewer, and the saved file may no longer be valid CSV.
- **Run Detect independently on each Cell.** Simpler mentally, but duplicates work, loses cross-cell context the NER model might use, and complicates token assignment order (first-appearance is document-wide today).
- **Flatten with newline delimiters between rows.** Rejected: parsed cell values can contain `\n` inside quoted fields, so row delimiters are ambiguous.

## Consequences

- The flattening delimiter must never appear in parsed cell content; `\x1f` is reserved for this purpose only.
- Unequal row lengths are padded with empty Cells on parse rather than rejected — only syntactic parse failures (e.g. unclosed quotes) fail closed at open.
- Serialized output uses `\r\n` line endings per RFC 4180; UTF-8 BOM is stripped on read and not written on save.
