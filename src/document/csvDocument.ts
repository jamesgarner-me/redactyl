import type { Item, Span } from '../domain/types';
import {
  type Cell,
  clampSpanToCell,
  formatCsvLocator,
  itemCells,
  makeCellResolver,
} from '../domain/locators';
import { mergeSpans, type ScoredSpan } from '../detection/merge';
import { spansToItems } from '../domain/items';
import { assignTokens } from '../redaction/tokeniser';
import { buildMapping, mappingName } from '../redaction/mappingExporter';
import { parseCsv, serialiseCsv } from '../csv/csvParser';
import { isNameHeader } from '../csv/nameColumns';
import { type Document, type RedactionOutcome, type RefinedDetection, redactedName } from './document';

// Cells are flattened into the Detect text as model-friendly, CSV-shaped rows:
// columns joined with a comma, rows with a newline. The authoritative source of
// truth for "which cell is this offset in" is the offset→Cell index, NOT the
// delimiters — the flat text is never re-split — so the join can favour the
// model's recall. Newlines between rows also let the chunker split on line
// boundaries instead of slicing a name mid-cell. See
// docs/adr/0004-csv-cell-flattening-for-detect.md.
const COLUMN_SEPARATOR = ',';
const ROW_SEPARATOR = '\n';

// An explicit column title ("Name") is strong evidence, on a par with the
// labelled-field address detector (90): it beats the model's PERSON span
// (50–70) so the whole cell is masked, but stays below validated identifiers.
const NAME_COLUMN_CONFIDENCE = 90;
// The shared detector's Items have already been merged, so their internal
// confidence is gone; re-floor them below the name-column signal when re-merging
// so an explicit column title supersedes a partial model span in the same cell.
const DETECTED_CONFIDENCE = 60;

// A cell with its position in the parsed grid plus its span in the flat text, so
// redaction can rewrite the value in place and re-serialise.
interface FlatCell extends Cell {
  end: number;
  rowIdx: number;
  colIdx: number;
}

// Flatten the parsed grid into a single Detect text, recording each cell's
// [start, end) offsets so Spans map back to Cells.
function flatten(rows: string[][]): { text: string; cells: FlatCell[] } {
  const cells: FlatCell[] = [];
  let text = '';
  let offset = 0;
  rows.forEach((row, rowIdx) => {
    if (rowIdx > 0) {
      text += ROW_SEPARATOR;
      offset += ROW_SEPARATOR.length;
    }
    row.forEach((value, colIdx) => {
      if (colIdx > 0) {
        text += COLUMN_SEPARATOR;
        offset += COLUMN_SEPARATOR.length;
      }
      const start = offset;
      text += value;
      offset += value.length;
      cells.push({ row: rowIdx + 1, col: colIdx + 1, start, end: offset, rowIdx, colIdx });
    });
  });
  return { text, cells };
}

// Join two or more headers into prose: `"Name"`, `"Name" and "Owner"`,
// `"Name", "Owner", and "Contact"`.
function listHeaders(headers: string[]): string {
  const quoted = headers.map((h) => `"${h}"`);
  if (quoted.length === 1) return quoted[0];
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`;
}

// The advisory shown when a name-titled column held values but the model
// recognised no names in it — the column-title heuristic was load-bearing, so
// prompt the reviewer to double-check.
function nameColumnAdvisory(headers: string[]): string {
  const single = headers.length === 1;
  return (
    `The ${listHeaders(headers)} ${single ? 'column looks' : 'columns look'} like ` +
    `${single ? 'a list' : 'lists'} of people's names, but the detector didn't recognise any. ` +
    `Redactyl has marked every value in ${single ? 'that column' : 'those columns'} as a name ` +
    `to be safe — double-check the result before sharing.`
  );
}

// The CSV Document adapter (.csv and sniffed tabular .txt). Parsed into cells at
// open time; Detect runs on
// the flattened text, locators report physical row/column, and redaction rewrites
// accepted values inside their Cells before re-serialising to valid CSV. Mapping
// is offered (allowMapping) and, like text, redaction never fails closed.
export function createCsvDocument(filename: string, source: string): Document {
  const rows = parseCsv(source);
  const { text, cells } = flatten(rows);
  const cellAt = makeCellResolver(cells);
  const header = rows[0] ?? [];
  const nameCols = header.map((h, colIdx) => ({ colIdx, header: h })).filter((c) => isNameHeader(c.header));

  return {
    filename,
    text,
    allowMapping: true,
    safetyWarning: undefined,
    locate(item: Item): string {
      return formatCsvLocator(itemCells(item, cellAt));
    },
    refineDetection(items: Item[]): RefinedDetection {
      // No name-titled columns → nothing CSV-specific to add.
      if (nameCols.length === 0) return { items };

      // Which name columns did the shared detector already flag a PERSON in?
      const detectedCols = new Set<number>();
      for (const item of items) {
        if (item.category !== 'PERSON') continue;
        for (const span of item.spans) {
          const cell = cellAt(span.start) as FlatCell | undefined;
          if (cell) detectedCols.add(cell.colIdx);
        }
      }

      // Mark every non-empty value in a name column as PERSON, anchored on the
      // trimmed text so the token replaces the name and not the cell's padding.
      const cellByKey = new Map<string, FlatCell>();
      for (const cell of cells) cellByKey.set(`${cell.rowIdx},${cell.colIdx}`, cell);

      const personSpans: ScoredSpan[] = [];
      const missed: string[] = [];
      for (const { colIdx, header: title } of nameCols) {
        let hasValues = false;
        for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
          const raw = rows[rowIdx]?.[colIdx] ?? '';
          const value = raw.trim();
          if (!value) continue;
          hasValues = true;
          const cell = cellByKey.get(`${rowIdx},${colIdx}`);
          if (!cell) continue;
          const start = cell.start + (raw.length - raw.trimStart().length);
          personSpans.push({
            start,
            end: start + value.length,
            category: 'PERSON',
            value,
            confidence: NAME_COLUMN_CONFIDENCE,
          });
        }
        // Advise only when there was something to catch and the model caught none.
        if (hasValues && !detectedCols.has(colIdx)) missed.push(title.trim());
      }

      if (personSpans.length === 0) return { items };

      // Re-merge the shared detector's Items (re-floored) with the name-column
      // spans, so an explicit column title supersedes an overlapping partial
      // model span in the same cell and nothing double-redacts.
      const detected: ScoredSpan[] = items.flatMap((item) =>
        item.spans.map((span) => ({ ...span, confidence: DETECTED_CONFIDENCE })),
      );
      const refined = spansToItems(mergeSpans([...detected, ...personSpans]));
      const advisory = missed.length > 0 ? nameColumnAdvisory(missed) : undefined;
      return { items: refined, advisory };
    },
    async redact(accepted: Span[], { saveMapping }): Promise<RedactionOutcome> {
      const tokens = assignTokens(accepted);

      // Group accepted Spans by the Cell they fall in, clamping each to a single
      // cell first so a separator-glued or straddling span can never rewrite the
      // wrong cell. Replacements within a Cell run right-to-left so earlier
      // splices never shift later offsets.
      const grouped = new Map<string, { cell: FlatCell; edits: { start: number; end: number; span: Span }[] }>();
      for (const span of accepted) {
        const clamped = clampSpanToCell(cells, span);
        if (!clamped) continue;
        const cell = clamped.cell;
        const key = `${cell.row},${cell.col}`;
        const entry = grouped.get(key) ?? { cell, edits: [] };
        entry.edits.push({ start: clamped.start, end: clamped.end, span });
        grouped.set(key, entry);
      }

      const out = rows.map((row) => [...row]);
      for (const { cell, edits } of grouped.values()) {
        let value = out[cell.rowIdx][cell.colIdx];
        for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
          const s = edit.start - cell.start;
          const e = edit.end - cell.start;
          value = value.slice(0, s) + tokens.tokenFor(edit.span) + value.slice(e);
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
