# Flatten CSV cells for Detect, redact per Cell

CSV support needs **Detect** to run on the existing pipeline (regex + NER over a single `text` string with character offsets), but redaction must stay **cell-boundary-safe** so commas, quotes and embedded newlines in quoted fields survive. We flatten the parsed cells into one Detect string and build an authoritative offset→`(row, col)` index alongside it. Spans found in the flat view map back to Cells for `locate` and `redact`; replacement happens inside each affected Cell's string before RFC 4180 re-serialisation.

**The offset index — not the delimiters — is the source of truth.** The flat text is never re-split to recover cells, so the join delimiter carries no structural meaning and can be chosen purely to help the model.

## Layout

Columns are joined with a comma and rows with a newline (CSV-shaped). Each cell records its `[start, end)` offsets in the flat text.

## Considered options

- **Treat CSV as plain text** (the pre-CSV opener fallback for non-PDF files). Rejected for `.csv` uploads and for tabular content that passes the sniff heuristic: spans can straddle cell boundaries, line locators mislead the reviewer, and the saved file may no longer be valid CSV.
- **Run Detect independently on each Cell.** Simpler mentally, but duplicates work, loses cross-cell context the NER model might use, and complicates token assignment order (first-appearance is document-wide today).
- **Join with the ASCII unit separator (`\x1f`).** This was the original choice, on the false premise that cells would be recovered by splitting the flat text, so a delimiter that never appears in content was needed. **Reverted: it regressed NER badly.** The tokeniser folds the control character into adjacent entities, so the model emits person spans that include `\x1f` and even straddle three cells, and returns no character offsets — which sends `nerSpansFrom` to its `indexOf(word.trim())` fallback. `\x1f` is not whitespace, so `.trim()` leaves it on the front and the span anchors on the *separator*. A "largest start ≤ offset" lookup then maps that to the **previous** cell, so the redactor rewrote the wrong cell and the name leaked. (Emails/phones were unaffected because their regex anchors exactly on the value.) `\x1f` also left the flat text newline-free, so the chunker could only fall back to space/hard cuts.

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

- The offset index is authoritative; the delimiter is a model-recall choice, not a parsing contract. Embedded commas/newlines in cell content are harmless because the text is never re-split.
- Newlines between rows let the chunker split on line boundaries instead of slicing a name mid-cell.
- **Defence in depth:** every detected span is clamped to a single cell before `locate`/`redact`, and an offset that lands in the gap between cells is snapped *forward* into the cell it precedes. This makes a separator-glued or straddling span structurally unable to rewrite the wrong cell, independent of model quirks.
- **Column titles as a clue:** a column whose header names people (e.g. "Name", "Full name") has every value marked PERSON, so low-context names the model misses in a bare cell are still caught; when such a column held values but the model recognised none, a non-blocking advisory prompts the reviewer to double-check.
- Unequal row lengths are padded with empty Cells on parse rather than rejected — only syntactic parse failures on `.csv` extension uploads fail closed at open.
- Serialised output uses `\r\n` line endings per RFC 4180; UTF-8 BOM is stripped on read and not written on save.
- Sniffed `.txt` files are redacted with the cell adapter but keep their original extension on download; output remains valid CSV structure even when the filename still says `.txt`.
