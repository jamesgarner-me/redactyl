import type { Item, Span } from '../domain/types';
import { type Cell, formatCsvLocator, itemCells, makeCellIndex } from '../domain/locators';
import { assignTokens } from '../redaction/tokeniser';
import { buildMapping, mappingName } from '../redaction/mappingExporter';
import { parseCsv, serialiseCsv } from '../csv/csvParser';
import { type Document, type RedactionOutcome, redactedName } from './document';

// The unit separator reserved for flattening cells into the Detect text. It must
// never appear in parsed cell content, so a detection Span can never straddle a
// cell boundary. See docs/adr/0004-csv-cell-flattening-for-detect.md.
const CELL_SEPARATOR = '\x1f';

// A cell with its position in the parsed grid plus its span in the flat text, so
// redaction can rewrite the value in place and re-serialise.
interface FlatCell extends Cell {
  rowIdx: number;
  colIdx: number;
}

// Flatten the parsed grid into a single Detect text by joining cells row-major
// with CELL_SEPARATOR, recording each cell's offset so Spans map back to Cells.
function flatten(rows: string[][]): { text: string; cells: FlatCell[] } {
  const cells: FlatCell[] = [];
  let text = '';
  let offset = 0;
  let first = true;
  rows.forEach((row, rowIdx) => {
    row.forEach((value, colIdx) => {
      if (!first) {
        text += CELL_SEPARATOR;
        offset += CELL_SEPARATOR.length;
      }
      first = false;
      cells.push({ row: rowIdx + 1, col: colIdx + 1, start: offset, rowIdx, colIdx });
      text += value;
      offset += value.length;
    });
  });
  return { text, cells };
}

// The CSV Document adapter (.csv). Parsed into cells at open time; Detect runs on
// the flattened text, locators report physical row/column, and redaction rewrites
// accepted values inside their Cells before re-serialising to valid CSV. Mapping
// is offered (allowMapping) and, like text, redaction never fails closed.
export function createCsvDocument(filename: string, source: string): Document {
  const rows = parseCsv(source);
  const { text, cells } = flatten(rows);
  const cellAt = makeCellIndex(cells);

  return {
    filename,
    text,
    allowMapping: true,
    safetyWarning: undefined,
    locate(item: Item): string {
      return formatCsvLocator(itemCells(item, cellAt));
    },
    async redact(accepted: Span[], { saveMapping }): Promise<RedactionOutcome> {
      const tokens = assignTokens(accepted);

      // Group accepted Spans by the Cell they fall in; replacements within a
      // Cell run right-to-left so earlier splices never shift later offsets.
      const grouped = new Map<string, { cell: FlatCell; spans: Span[] }>();
      for (const span of accepted) {
        const cell = cellAt(span.start) as FlatCell | undefined;
        if (!cell) continue;
        const key = `${cell.row},${cell.col}`;
        const entry = grouped.get(key) ?? { cell, spans: [] };
        entry.spans.push(span);
        grouped.set(key, entry);
      }

      const out = rows.map((row) => [...row]);
      for (const { cell, spans } of grouped.values()) {
        let value = out[cell.rowIdx][cell.colIdx];
        for (const span of [...spans].sort((a, b) => b.start - a.start)) {
          const s = span.start - cell.start;
          const e = span.end - cell.start;
          value = value.slice(0, s) + tokens.tokenFor(span) + value.slice(e);
        }
        out[cell.rowIdx][cell.colIdx] = value;
      }

      const blob = new Blob([serialiseCsv(out)], { type: 'text/csv' });
      const mapping = saveMapping
        ? {
            name: mappingName(filename),
            blob: new Blob([JSON.stringify(buildMapping(tokens.entries, filename), null, 2)], {
              type: 'application/json',
            }),
          }
        : undefined;
      return { ok: true, outputName: redactedName(filename), blob, mapping };
    },
  };
}
