import { itemKey } from '../domain/items';
import type { ScoredSpan } from './merge';

// The NER forward pass is the one non-deterministic stage of detection (its
// WebGPU backend shifts logits slightly between runs), so a value with weak
// local context — a name in a bare heading, an address in a prose sentence —
// flips between detected and missed run-to-run. But that same value is reliably
// caught elsewhere in the document, where context is strong (its structured
// `- Residential address:` / labelled field).
//
// Propagation closes that gap: once any occurrence of a value is detected as
// PII, every verbatim occurrence of it is emitted as a span. An entity then
// needs to be caught only *once anywhere* to be masked *everywhere*, which
// makes whole-document redaction deterministic despite the per-occurrence
// model flips. This is the Entity concept (a value grouped across all the
// places it appears) applied at detection time rather than only at grouping.
//
// Kept transformers.js-free so tests can import it directly (like merge/nerSpans).

function isWordChar(ch: string | undefined): boolean {
  return ch != null && /[A-Za-z0-9]/.test(ch);
}

// A verbatim occurrence is valid only when it isn't glued to a surrounding word
// character on a side whose own edge is a word character — so "Ng" won't match
// inside "Ngata", but ", Macedon VIC 3440" still matches even though it's
// bounded by punctuation and whitespace rather than string ends.
function boundaryOk(text: string, start: number, end: number, value: string): boolean {
  if (isWordChar(value[0]) && isWordChar(text[start - 1])) return false;
  if (isWordChar(value[value.length - 1]) && isWordChar(text[end])) return false;
  return true;
}

// For every unique (category, value) among the detected spans, find all verbatim
// occurrences in the source text and emit a span for each. Occurrences inherit
// the highest confidence seen for that value, so a propagated span never loses
// the merge to a lower-confidence real detection at the same range. Returns
// un-merged ScoredSpans (including copies of the originating detections); the
// caller folds these into one mergeSpans, which dedupes the overlaps.
//
// `minLength` skips very short values, whose verbatim occurrences are too common
// to mask blindly (a 2-3 char surname or initial would over-redact).
export function propagateOccurrences(
  text: string,
  spans: ScoredSpan[],
  minLength = 4,
): ScoredSpan[] {
  // Highest confidence per value, keyed exactly like an Item.
  const best = new Map<string, ScoredSpan>();
  for (const span of spans) {
    const key = itemKey(span.category, span.value);
    const current = best.get(key);
    if (!current || span.confidence > current.confidence) best.set(key, span);
  }

  const out: ScoredSpan[] = [];
  for (const { category, value, confidence } of best.values()) {
    if (value.trim().length < minLength) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(value, from);
      if (at === -1) break;
      const end = at + value.length;
      if (boundaryOk(text, at, end, value)) {
        out.push({ start: at, end, category, value, confidence });
      }
      from = at + 1;
    }
  }
  return out;
}
