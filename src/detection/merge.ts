import type { Span } from '../domain/types';

// A Span carrying the detection confidence used only to resolve overlaps.
// Confidence is detection-internal; the rest of the app sees plain Spans.
export interface ScoredSpan extends Span {
  confidence: number;
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

// Resolve overlapping Spans: highest confidence wins, then the longer span,
// then the earlier one. Returns clean Spans sorted by position. Two detectors
// flagging the same range collapse to a single Span (no double-redaction).
export function mergeSpans(spans: ScoredSpan[]): Span[] {
  const byPriority = [...spans].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) return lengthDiff;
    return a.start - b.start;
  });

  const accepted: ScoredSpan[] = [];
  for (const span of byPriority) {
    if (!accepted.some((kept) => overlaps(span, kept))) {
      accepted.push(span);
    }
  }

  return accepted
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, category, value }) => ({ start, end, category, value }));
}
