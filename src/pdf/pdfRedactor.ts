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

import {
  PDFDocument,
  PDFDict,
  PDFName,
  PDFArray,
  PDFRef,
  PDFRawStream,
  decodePDFRawStream,
  rgb,
  type PDFPage,
} from 'pdf-lib';
import type { Item, Span } from '../domain/types';
import { spansToItems } from '../domain/items';
import type { GlyphBox } from './pdfExtractor';
import type { OcrAugmentDeps } from './pdfOcr';
import { verifyPdf } from './pdfVerifier';

const latin1 = new TextDecoder('latin1');

// Renders one page (1-based) of a PDF to a PNG. Injected because rendering needs
// a canvas — the browser supplies a real one; the pipeline stays env-agnostic.
export type RenderPageToPng = (bytes: Uint8Array, pageNumber: number) => Promise<Uint8Array>;

export interface RedactionOutcome {
  bytes: Uint8Array;
  // Whether the output passed verification. False means a leak survived even the
  // rasterise fallback — the caller must fail closed.
  ok: boolean;
  // Pages flattened to an image because the content-stream rewrite left residual
  // text (CID/subset fonts, kerned `TJ`). Empty when the rewrite alone sufficed.
  rasterisedPages: number[];
}

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

// The full true-redaction pipeline: rewrite + verify, then rasterise any page
// that still leaks and re-verify. Returns fail-closed (`ok: false`) if a leak
// survives even rasterisation. Matches the PRD's PDF redaction pipeline.
//
// `forcedRasterPages` (OCR'd image pages) are *always* flattened regardless of
// the text-verify oracle: their PII lives in raster pixels the oracle can't see,
// and a vector box alone would leave the scan extractable. When OCR is available
// those pages are also re-OCR'd to confirm no accepted value survives — a
// defence against a mis-placed box — and fail closed if one does.
export async function redactAndVerifyPdf(
  source: Uint8Array,
  acceptedSpans: Span[],
  glyphs: GlyphBox[],
  forcedRasterPages: number[],
  deps: {
    detect: (text: string) => Item[] | Promise<Item[]>;
    renderPage: RenderPageToPng;
    ocr?: OcrAugmentDeps;
  },
): Promise<RedactionOutcome> {
  const expectedAbsent = spansToItems(acceptedSpans);
  const values = [...new Set(acceptedSpans.map((s) => s.value))].filter(Boolean);

  const doc = await PDFDocument.load(source);
  blankContentStreams(doc, values);
  drawRedactionBoxes(doc, acceptedSpans, glyphs);
  let bytes = await doc.save();

  // Force-flatten OCR'd image pages first, before trusting any verify: the box is
  // now drawn, so rendering bakes it into pixels and `rasterisePage` drops the
  // original scan image entirely.
  const forced = [...new Set(forcedRasterPages)].sort((a, b) => a - b);
  for (const pageNumber of forced) {
    const png = await deps.renderPage(bytes, pageNumber);
    await rasterisePage(doc, pageNumber, png);
  }
  if (forced.length) bytes = await doc.save();

  // Re-OCR the flattened pages to confirm the redacted values are gone from the
  // pixels — the text oracle is blind to image PII. Any reappearance fails closed.
  if (forced.length && deps.ocr && (await reOcrLeaks(bytes, forced, values, deps.ocr))) {
    return { bytes, ok: false, rasterisedPages: forced };
  }

  let result = await verifyPdf(bytes, expectedAbsent, deps.detect);
  if (result.ok) return { bytes, ok: true, rasterisedPages: forced };

  // Residual text on other pages (tricky fonts). Flatten each to an image of the
  // already-box-drawn render, so the PII is both covered and unselectable.
  const leakPages = result.leakPages.filter((p) => !forced.includes(p));
  for (const pageNumber of leakPages) {
    const png = await deps.renderPage(bytes, pageNumber);
    await rasterisePage(doc, pageNumber, png);
  }
  bytes = await doc.save();

  const rasterisedPages = [...forced, ...leakPages].sort((a, b) => a - b);
  result = await verifyPdf(bytes, expectedAbsent, deps.detect);
  return { bytes, ok: result.ok, rasterisedPages };
}

// Re-OCR each flattened page and report whether any accepted value's text
// survives in the pixels. Comparison is normalised (lowercase, alphanumerics
// only) to tolerate OCR noise. Long needles (4+ chars) use substring matching;
// shorter ones require an exact word match to avoid spurious hits. A survivor
// means the redaction box missed — fail closed.
async function reOcrLeaks(
  bytes: Uint8Array,
  pages: number[],
  values: string[],
  ocr: OcrAugmentDeps,
): Promise<boolean> {
  const normalised = values.map(normaliseForOcr).filter((v) => v.length > 0);
  if (normalised.length === 0) return false;
  const longNeedles = normalised.filter((v) => v.length >= 4);
  const shortNeedles = normalised.filter((v) => v.length < 4);
  for (const pageNumber of pages) {
    const { data } = await ocr.render(bytes, pageNumber);
    const words = await ocr.engine.recognizeWords(data);
    const wordTexts = words
      .map((w) => normaliseForOcr(w.text))
      .filter((w) => w.length > 0);
    const haystack = wordTexts.join(' ');
    if (longNeedles.some((n) => haystack.includes(n))) return true;
    if (shortNeedles.some((n) => wordTexts.includes(n))) return true;
  }
  return false;
}

function normaliseForOcr(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Replace a page's content with a single full-page image, dropping every text
// operator (and the fonts they referenced) so nothing is selectable/extractable.
async function rasterisePage(doc: PDFDocument, pageNumber: number, png: Uint8Array): Promise<void> {
  const page = doc.getPage(pageNumber - 1);
  const image = await doc.embedPng(png);
  const { width, height } = page.getSize();
  const ctx = doc.context;

  // `w 0 0 h 0 0 cm` maps the unit image square onto the whole page.
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/RedactylRaster Do\nQ\n`;
  page.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(content)));
  page.node.set(
    PDFName.of('Resources'),
    ctx.obj({ XObject: ctx.obj({ RedactylRaster: image.ref }) }),
  );
}

// Rewrite every content stream that can show text, blanking accepted values in
// place. Text often lives in Form XObjects (the page paints them with `Do`), so
// we follow Resources/XObject transitively rather than only the page Contents —
// otherwise XObject-wrapped PDFs (common from browser/HTML-to-PDF exports) leak.
function blankContentStreams(doc: PDFDocument, values: string[]): void {
  if (values.length === 0) return;
  const ctx = doc.context;
  const refs = new Set<PDFRef>();
  for (const page of doc.getPages()) collectContentRefs(ctx, page, refs);

  for (const ref of refs) {
    const stream = ctx.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const decoded = latin1.decode(decodePDFRawStream(stream).decode());
    const { text, changed } = blankOperands(decoded, values);
    if (!changed) continue;
    // Preserve the stream's own dictionary — a Form XObject's /Subtype, /BBox,
    // /Resources and /Matrix must survive — and only swap in the blanked bytes,
    // stored uncompressed (drop /Filter, refresh /Length).
    const bytes = toLatin1Bytes(text);
    const dict = stream.dict;
    dict.delete(PDFName.of('Filter'));
    dict.delete(PDFName.of('DecodeParms'));
    dict.set(PDFName.of('Length'), ctx.obj(bytes.length));
    ctx.assign(ref, PDFRawStream.of(dict, bytes));
  }
}

// Collect the refs of every content-bearing stream reachable from a page: its
// Contents plus the Form XObjects in its (and their nested) Resources. The
// `seen` set both dedupes shared XObjects and guards against reference cycles.
function collectContentRefs(
  ctx: PDFDocument['context'],
  page: PDFPage,
  seen: Set<PDFRef>,
): void {
  const contents = page.node.get(PDFName.of('Contents'));
  if (contents instanceof PDFArray) {
    for (const r of contents.asArray()) if (r instanceof PDFRef) seen.add(r);
  } else if (contents instanceof PDFRef) {
    seen.add(contents);
  }
  collectFormXObjects(ctx, page.node.get(PDFName.of('Resources')), seen);
}

function collectFormXObjects(
  ctx: PDFDocument['context'],
  resources: unknown,
  seen: Set<PDFRef>,
): void {
  const res = resources instanceof PDFRef ? ctx.lookup(resources) : resources;
  if (!(res instanceof PDFDict)) return;
  const xobjects = res.get(PDFName.of('XObject'));
  const xdict = xobjects instanceof PDFRef ? ctx.lookup(xobjects) : xobjects;
  if (!(xdict instanceof PDFDict)) return;
  for (const ref of xdict.values()) {
    if (!(ref instanceof PDFRef) || seen.has(ref)) continue;
    const xobj = ctx.lookup(ref);
    if (!(xobj instanceof PDFRawStream)) continue;
    if (xobj.dict.get(PDFName.of('Subtype')) !== PDFName.of('Form')) continue;
    seen.add(ref);
    collectFormXObjects(ctx, xobj.dict.get(PDFName.of('Resources')), seen);
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
