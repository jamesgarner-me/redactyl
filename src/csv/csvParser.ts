// RFC 4180-style CSV parse + serialise. Comma delimiter only (no user-selectable
// delimiters in this slice), `"` quoting with `""` as the in-field escape, and a
// leading UTF-8 BOM stripped on read. Short rows are padded to the widest row so
// every row is rectangular; only a syntactic failure (an unclosed quoted field)
// throws. Serialisation normalises line endings to `\r\n` and never writes a BOM.

const SEP = ',';
const QUOTE = '"';

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

// Strip a leading UTF-8 BOM if present — it is metadata, never cell content.
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

// Parse a CSV string into rows of cell strings without padding short rows.
// Throws a `CsvParseError` on an unclosed quoted field; every other input parses.
function parseCsvRows(input: string): string[][] {
  const source = stripBom(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Whether the current row has any content yet, so a trailing line ending does
  // not synthesise a spurious empty final row.
  let rowHasContent = false;

  let i = 0;
  while (i < source.length) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === QUOTE) {
        if (source[i + 1] === QUOTE) {
          // Escaped quote inside a quoted field.
          field += QUOTE;
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // A quote only opens a quoted field at the start of a field; elsewhere it is
    // a literal character (lenient handling of real-world exports).
    if (ch === QUOTE && field === '') {
      inQuotes = true;
      rowHasContent = true;
      i += 1;
      continue;
    }

    if (ch === SEP) {
      row.push(field);
      field = '';
      rowHasContent = true;
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      rowHasContent = false;
      // Treat a CRLF pair as a single line ending.
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += ch;
    rowHasContent = true;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvParseError('Unclosed quoted field — the CSV is malformed.');
  }

  // Flush the final pending row unless the file ended exactly on a line ending.
  if (rowHasContent || field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Parse a CSV string into a rectangular grid of cell strings. Throws a
// `CsvParseError` on an unclosed quoted field; every other input parses.
export function parseCsv(input: string): string[][] {
  return padRows(parseCsvRows(input));
}

// Heuristic for misnamed `.txt` uploads: valid RFC 4180 parse plus enough
// tabular structure (multiple rows with comma-separated fields) to avoid routing
// prose that happens to contain an occasional comma.
export function looksLikeCsv(input: string): boolean {
  try {
    const rows = parseCsvRows(input);
    if (rows.length < 2) return false;

    const widths = rows.map((row) => row.length);
    const maxWidth = Math.max(...widths);
    if (maxWidth < 2) return false;

    const multiFieldRows = widths.filter((w) => w >= 2).length;
    if (multiFieldRows < 2) return false;

    // Require at least two rows at the widest column count so a single
    // comma-heavy sentence in otherwise plain prose does not qualify.
    const rowsAtMaxWidth = widths.filter((w) => w === maxWidth).length;
    return rowsAtMaxWidth >= 2;
  } catch {
    return false;
  }
}

// Pad short rows with trailing empty cells so the grid is rectangular. Ragged
// input is valid; padding keeps cell coordinates aligned across rows.
function padRows(rows: string[][]): string[][] {
  let width = 0;
  for (const row of rows) width = Math.max(width, row.length);
  for (const row of rows) {
    while (row.length < width) row.push('');
  }
  return rows;
}

// A field needs quoting when it contains the delimiter, a quote, or a line
// ending; embedded quotes are doubled.
function quoteField(value: string): string {
  if (value.includes(SEP) || value.includes(QUOTE) || value.includes('\r') || value.includes('\n')) {
    return `${QUOTE}${value.split(QUOTE).join(`${QUOTE}${QUOTE}`)}${QUOTE}`;
  }
  return value;
}

// Serialise a grid back to CSV with `\r\n` line endings (including a trailing
// one, per RFC 4180). The result re-parses to the same grid.
export function serialiseCsv(rows: string[][]): string {
  if (rows.length === 0) return '';
  return rows.map((row) => row.map(quoteField).join(SEP)).join('\r\n') + '\r\n';
}
