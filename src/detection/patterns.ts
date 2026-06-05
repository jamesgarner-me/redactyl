import type { Category, Span } from '../domain/types';
import { mergeSpans, type ScoredSpan } from './merge';

export interface DetectorPattern {
  category: Category;
  pattern: RegExp;
  // Higher wins when spans overlap during merge.
  confidence: number;
  // Optional structural check; a regex match that fails is discarded.
  validate?: (value: string) => boolean;
}

// User-supplied patterns. Accepted from day one; no UI surface in v1.
export interface CustomPattern {
  category: Category;
  pattern: RegExp;
}

// Custom patterns are explicit user intent, so they outrank every built-in.
const CUSTOM_CONFIDENCE = 110;

// Luhn check over the digits of a candidate card number.
function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// ATO weighted mod-11 check for an Australian Tax File Number. A bare 9-digit
// run is too common to mask blind, so the checksum gates it — ~91% of random
// 9-digit numbers fail, and for a redaction tool the rare false positive (a
// masked non-TFN) is the safe direction to err.
const TFN_WEIGHTS = [1, 4, 3, 7, 5, 8, 6, 9, 10];
function tfnValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (digits.charCodeAt(i) - 48) * TFN_WEIGHTS[i];
  return sum % 11 === 0;
}

// ISO 7064 mod-97-10 check for an IBAN.
function ibanValid(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 15 || compact.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const numeric = code >= 65 ? code - 55 : code - 48; // A-Z -> 10..35, 0-9 -> 0..9
    const piece = numeric.toString();
    for (let i = 0; i < piece.length; i++) {
      remainder = (remainder * 10 + (piece.charCodeAt(i) - 48)) % 97;
    }
  }
  return remainder === 1;
}

export const BUILTIN_PATTERNS: DetectorPattern[] = [
  // Credentials — most specific, highest confidence.
  { category: 'SECRET', pattern: /\bAKIA[0-9A-Z]{16}\b/g, confidence: 100 },
  { category: 'SECRET', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, confidence: 100 },
  { category: 'SECRET', pattern: /\b(?:sk|pk|rk)_live_[A-Za-z0-9]{16,}/g, confidence: 100 },
  { category: 'SECRET', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/g, confidence: 100 },
  {
    category: 'SECRET',
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    confidence: 100,
  },
  {
    category: 'SECRET',
    pattern: /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
    confidence: 100,
  },

  // Validated identifiers.
  {
    category: 'CREDIT_CARD',
    pattern: /\b\d(?:[ -]?\d){12,18}\b/g,
    confidence: 95,
    validate: luhnValid,
  },
  {
    category: 'IBAN',
    pattern: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g,
    confidence: 95,
    validate: ibanValid,
  },
  // Australian TFN — 9 digits, optionally grouped 3-3-3. Classed as
  // ACCOUNT_NUMBER (no dedicated category) so it shares the ID bucket and
  // collapses with the model's account_number spans. Checksum-gated (above).
  // The negative lookbehind keeps the 9-digit run from claiming the tail of a
  // +CC phone number (e.g. the `400 000 004` in `+61 400 000 004`): those digits
  // belong to a phone, not a TFN. Without it the higher-confidence TFN span beats
  // PHONE at merge and the `+CC` prefix is stranded outside the token. This is the
  // mirror of the PHONE 3-3-3 branch requiring a leading + — the guard runs both ways.
  {
    category: 'ACCOUNT_NUMBER',
    pattern: /(?<!\+\d{1,3}[\s.-]?)\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
    confidence: 85,
    validate: tfnValid,
  },

  { category: 'EMAIL', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 90 },
  { category: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, confidence: 80 },

  {
    category: 'IP',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
    confidence: 70,
  },
  { category: 'URL', pattern: /https?:\/\/[^\s<>"')]+/gi, confidence: 60 },

  // Ambiguous formats — lowest confidence, so structured matches win overlaps.
  {
    // Four alternatives, tried in order: a bare international run (+CC then
    // 10-15 digits); the 3-3-4 grouping (optionally with a +CC); a +CC 3-3-3
    // grouping for AU mobiles like `+61 408 776 221`; and — last, so it can't
    // truncate any of the above — a +CC 1-4-4 grouping for AU landlines with a
    // single-digit area code like `+61 3 9602 8899`. The 3-3-3 branch requires
    // the leading + so it never collides with a bare 9-digit TFN; the 1-4-4
    // branch requires both inter-group separators to keep false positives down.
    category: 'PHONE',
    pattern:
      /(?:\+\d{10,15})|(?:(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})|(?:\+\d{1,3}[\s.-]?\d{3}[\s.-]\d{3}[\s.-]\d{3})|(?:\+\d{1,3}[\s.-]\d[\s.-]\d{4}[\s.-]\d{4})/g,
    confidence: 40,
  },
  {
    category: 'DATE',
    pattern: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\.\d{1,2}\.\d{2,4})\b/g,
    confidence: 30,
  },
  {
    category: 'DATE',
    pattern:
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    confidence: 30,
  },
];

// Explicitly-labelled fields, keyed off the *author's* label rather than the
// value's shape. ADDRESS is the one Category with no value-shape regex (street
// formats are too varied to match precisely), so a single-occurrence address
// the model misses leaks with nothing to catch it. But where the document spells
// out the label — "- Residential address: <value>" — we can tag the value with
// near-zero false-positive risk and let propagation spread it to any prose
// occurrence. Extensible: add { labels, category } rows for other labelled PII.
interface LabelledField {
  // Label words preceding the colon, as a regex alternation fragment.
  labels: string;
  category: Category;
  // High enough to beat the model's ADDRESS span (50–70) and collapse with it,
  // but below validated identifiers — an explicit label is strong evidence.
  confidence: number;
}

const LABELLED_FIELDS: LabelledField[] = [
  { labels: 'Residential|Postal|Home|Street', category: 'ADDRESS', confidence: 90 },
];

// Match a labelled line and capture the value after the colon. Allows an
// optional list-marker ("- "/"* ") and surrounding whitespace; the value is the
// rest of the line, trimmed. Case-insensitive on the label; the `d` flag yields
// the capture group's absolute offsets so the span anchors exactly.
function labelRegex(field: LabelledField): RegExp {
  return new RegExp(
    `^[ \\t]*[-*]?[ \\t]*(?:${field.labels})[ \\t]+address[ \\t]*:[ \\t]*(\\S.*?)[ \\t]*$`,
    'gimd',
  );
}

export function labelledFieldSpans(text: string): ScoredSpan[] {
  const scored: ScoredSpan[] = [];
  for (const field of LABELLED_FIELDS) {
    const re = labelRegex(field);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const indices = match.indices?.[1];
      if (!indices) continue;
      const [start, end] = indices;
      const value = text.slice(start, end);
      if (!value) continue;
      scored.push({ start, end, category: field.category, value, confidence: field.confidence });
    }
  }
  return scored;
}

// Built-in + custom patterns as scored (un-merged) spans. Exposed so the worker
// can fold these into one merge alongside the NER layer's spans. No worker, no
// DOM — safe to import from tests.
export function regexScoredSpans(text: string, customPatterns: CustomPattern[] = []): ScoredSpan[] {
  const patterns: DetectorPattern[] = [
    ...BUILTIN_PATTERNS,
    ...customPatterns.map((c) => ({ ...c, confidence: CUSTOM_CONFIDENCE })),
  ];

  const scored: ScoredSpan[] = [];
  for (const { category, pattern, confidence, validate } of patterns) {
    // Fresh, always-global RegExp so lastIndex never leaks between calls.
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      if (match.index === re.lastIndex) re.lastIndex++;
      if (value.length === 0) continue;
      if (validate && !validate(value)) continue;
      scored.push({ start: match.index, end: match.index + value.length, category, value, confidence });
    }
  }

  return scored;
}

// The regex-only detection surface (merges its own spans). Unchanged for the
// existing callers/tests; the worker now merges across layers itself.
export function runDetectors(text: string, customPatterns: CustomPattern[] = []): Span[] {
  return mergeSpans(regexScoredSpans(text, customPatterns));
}
