import { describe, expect, it } from 'vitest';
import { CsvParseError, looksLikeCsv, parseCsv, serialiseCsv } from './csvParser';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    expect(parseCsv('name,email\nAlice,alice@x.com')).toEqual([
      ['name', 'email'],
      ['Alice', 'alice@x.com'],
    ]);
  });

  it('preserves a comma inside a quoted field', () => {
    expect(parseCsv('"Smith, Jo",jane@x.com')).toEqual([['Smith, Jo', 'jane@x.com']]);
  });

  it('preserves an embedded newline inside a quoted field', () => {
    expect(parseCsv('"line1\nline2",secret@x.com')).toEqual([['line1\nline2', 'secret@x.com']]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('"she said ""hi""",x')).toEqual([['she said "hi"', 'x']]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('\uFEFFname,email')).toEqual([['name', 'email']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('does not synthesise an empty row from a trailing newline', () => {
    expect(parseCsv('a,b\r\n')).toEqual([['a', 'b']]);
  });

  it('pads ragged rows with trailing empty cells to the widest row', () => {
    expect(parseCsv('a,b,c\nd\ne,f')).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
      ['e', 'f', ''],
    ]);
  });

  it('throws CsvParseError on an unclosed quoted field', () => {
    expect(() => parseCsv('a,b\nc,"unclosed')).toThrow(CsvParseError);
  });
});

describe('looksLikeCsv', () => {
  it('accepts a multi-row comma-separated grid', () => {
    expect(looksLikeCsv('name,email\nAlice,alice@x.com')).toBe(true);
  });

  it('rejects single-line prose with one comma', () => {
    expect(looksLikeCsv('Hello, world')).toBe(false);
  });

  it('rejects multi-line prose where only one line has comma-separated fields', () => {
    expect(looksLikeCsv('Dear Sir,\n\nI am writing to you.\n\nRegards')).toBe(false);
  });

  it('rejects ragged grids where only one row reaches the widest column count', () => {
    expect(looksLikeCsv('a,b,c\nd\ne,f')).toBe(false);
  });

  it('returns false on malformed CSV instead of throwing', () => {
    expect(looksLikeCsv('a,b\nc,"unclosed')).toBe(false);
  });
});

describe('serialiseCsv', () => {
  it('serialises with CRLF line endings and a trailing terminator', () => {
    expect(serialiseCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });

  it('quotes fields containing commas, quotes or newlines', () => {
    expect(serialiseCsv([['Smith, Jo', 'a"b', 'x\ny']])).toBe('"Smith, Jo","a""b","x\ny"\r\n');
  });

  it('returns an empty string for an empty grid', () => {
    expect(serialiseCsv([])).toBe('');
  });

  // Round-trip is the contract redaction relies on: a re-serialised grid must
  // parse back to the same cells so the output stays valid CSV.
  it('round-trips quoted commas and embedded newlines', () => {
    const grid = [
      ['Smith, Jo', 'jane@x.com'],
      ['line1\nline2', 'a"b'],
    ];
    expect(parseCsv(serialiseCsv(grid))).toEqual(grid);
  });

  it('round-trips a padded ragged grid stably', () => {
    const parsed = parseCsv('a,b,c\nd\ne,f');
    expect(parseCsv(serialiseCsv(parsed))).toEqual(parsed);
  });
});
