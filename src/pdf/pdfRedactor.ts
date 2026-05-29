// PdfRedactor — *true* redaction for clean text PDFs. Two independent moves per
// accepted value:
//
//   1. Blank the value's bytes inside the page content stream's show-text
//      operands (Tj / TJ strings), replacing each character with a space so the
//      surrounding positioning operators stay valid. Copy/paste from the output
//      then yields nothing — the text is gone, not merely hidden.
//   2. Draw a filled black rectangle over the value's glyphs so the redaction is
//      visible.
//
// The blanking matches by value, decoupled from the fragile offset->operator
// correlation, which is safe because every occurrence of an accepted value
// should disappear anyway. Fonts whose string bytes are glyph indices (CID /
// subset) won't match the literal value; `PdfVerifier` catches that and the
// caller fails closed (the rasterise fallback is slice 10).

import { PDFDocument, PDFName, PDFArray, PDFRef, decodePDFRawStream, rgb } from 'pdf-lib';
import type { Span } from '../domain/types';
import type { GlyphBox } from './pdfExtractor';

const latin1 = new TextDecoder('latin1');

export async function redactPdf(
  bytes: ArrayBuffer | Uint8Array,
  acceptedSpans: Span[],
  glyphs: GlyphBox[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const values = [...new Set(acceptedSpans.map((s) => s.value))].filter(Boolean);

  blankContentStreams(doc, values);
  drawRedactionBoxes(doc, acceptedSpans, glyphs);

  return doc.save();
}

// Rewrite every page's content stream(s), blanking accepted values in place.
function blankContentStreams(doc: PDFDocument, values: string[]): void {
  if (values.length === 0) return;
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of('Contents'));
    const refs: PDFRef[] =
      contents instanceof PDFArray
        ? (contents.asArray().filter((r) => r instanceof PDFRef) as PDFRef[])
        : contents instanceof PDFRef
          ? [contents]
          : [];
    for (const ref of refs) {
      const stream = ctx.lookup(ref);
      if (!stream || !('dict' in stream)) continue;
      const decoded = latin1.decode(decodePDFRawStream(stream as never).decode());
      const { text, changed } = blankOperands(decoded, values);
      if (changed) {
        ctx.assign(ref, ctx.flateStream(toLatin1Bytes(text)));
      }
    }
  }
}

// Walk a content stream, transforming only string operands. `<<`/`>>` dict
// delimiters are passed through untouched; hex `<...>` and literal `(...)`
// strings are decoded, scanned for accepted values, and (only if a value is
// present) re-emitted as a blanked hex string. Operands with no PII are copied
// byte-for-byte so the blast radius stays minimal.
export function blankOperands(stream: string, values: string[]): { text: string; changed: boolean } {
  let out = '';
  let i = 0;
  let changed = false;
  const n = stream.length;
  while (i < n) {
    const ch = stream[i];
    if (ch === '<' && stream[i + 1] === '<') {
      out += '<<';
      i += 2;
    } else if (ch === '>' && stream[i + 1] === '>') {
      out += '>>';
      i += 2;
    } else if (ch === '<') {
      let j = i + 1;
      while (j < n && stream[j] !== '>') j++;
      const raw = hexToStr(stream.slice(i + 1, j).replace(/\s+/g, ''));
      const blanked = blankValue(raw, values);
      if (blanked === null) out += stream.slice(i, j + 1);
      else {
        out += `<${strToHex(blanked)}>`;
        changed = true;
      }
      i = j + 1;
    } else if (ch === '(') {
      const { value, end } = parseLiteral(stream, i);
      const blanked = blankValue(value, values);
      if (blanked === null) out += stream.slice(i, end);
      else {
        out += `<${strToHex(blanked)}>`;
        changed = true;
      }
      i = end;
    } else {
      out += ch;
      i++;
    }
  }
  return { text: out, changed };
}

// Replace each accepted value with equal-length spaces. Returns null when the
// operand contains no accepted value (so the caller leaves it untouched).
function blankValue(value: string, values: string[]): string | null {
  let out = value;
  let changed = false;
  for (const v of values) {
    let idx = out.indexOf(v);
    while (idx >= 0) {
      out = out.slice(0, idx) + ' '.repeat(v.length) + out.slice(idx + v.length);
      changed = true;
      idx = out.indexOf(v, idx + v.length);
    }
  }
  return changed ? out : null;
}

// Parse a PDF literal string starting at the opening '(', honouring backslash
// escapes, octal codes and balanced inner parens. Returns the decoded byte
// string and the index just past the closing ')'.
function parseLiteral(s: string, start: number): { value: string; end: number } {
  let i = start + 1;
  let depth = 1;
  let value = '';
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (c === '\\') {
      const next = s[i + 1];
      const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (next in simple) {
        value += simple[next];
        i += 2;
      } else if (next === '\n') {
        i += 2; // line continuation
      } else if (next === '\r') {
        i += s[i + 2] === '\n' ? 3 : 2;
      } else if (next >= '0' && next <= '7') {
        let oct = '';
        let k = i + 1;
        while (k < s.length && oct.length < 3 && s[k] >= '0' && s[k] <= '7') oct += s[k++];
        value += String.fromCharCode(parseInt(oct, 8) & 0xff);
        i = k;
      } else {
        value += next ?? '';
        i += 2;
      }
    } else if (c === '(') {
      depth++;
      value += c;
      i++;
    } else if (c === ')') {
      depth--;
      if (depth > 0) value += c;
      i++;
    } else {
      value += c;
      i++;
    }
  }
  return { value, end: i };
}

function hexToStr(hex: string): string {
  const padded = hex.length % 2 ? hex + '0' : hex;
  let s = '';
  for (let i = 0; i < padded.length; i += 2) s += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16));
  return s;
}

function strToHex(s: string): string {
  let h = '';
  for (let i = 0; i < s.length; i++) h += (s.charCodeAt(i) & 0xff).toString(16).padStart(2, '0');
  return h.toUpperCase();
}

function toLatin1Bytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytes;
}

// One black rectangle per contiguous run of an accepted span's glyphs, grouped
// by page and baseline so a value that wraps a line gets a box per line.
function drawRedactionBoxes(doc: PDFDocument, acceptedSpans: Span[], glyphs: GlyphBox[]): void {
  const pages = doc.getPages();
  const byStart = new Map<number, GlyphBox>();
  for (const g of glyphs) byStart.set(g.start, g);

  for (const span of acceptedSpans) {
    const runs = new Map<string, GlyphBox[]>();
    for (let off = span.start; off < span.end; off++) {
      const g = byStart.get(off);
      if (!g) continue;
      const key = `${g.page}:${Math.round(g.y)}`;
      const run = runs.get(key);
      if (run) run.push(g);
      else runs.set(key, [g]);
    }
    for (const run of runs.values()) {
      const page = pages[run[0].page - 1];
      if (!page) continue;
      const x = Math.min(...run.map((g) => g.x));
      const y = Math.min(...run.map((g) => g.y));
      const right = Math.max(...run.map((g) => g.x + g.w));
      const top = Math.max(...run.map((g) => g.y + g.h));
      page.drawRectangle({ x, y, width: right - x, height: top - y, color: rgb(0, 0, 0) });
    }
  }
}
