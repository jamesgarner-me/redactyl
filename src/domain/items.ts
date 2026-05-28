import type { Category, Item, Span } from './types';

// A value can in principle be flagged under more than one Category, so Items
// are keyed by both. Category strings are a fixed A-Z/underscore enum, so a
// space before the value is an unambiguous, collision-proof separator.
export function itemKey(category: Category, value: string): string {
  return `${category} ${value}`;
}

// Collapse Spans into Items, preserving first-appearance order. Assumes spans
// are already sorted by `start` (runDetectors guarantees this).
export function groupItems(spans: Span[]): Item[] {
  const byKey = new Map<string, Item>();
  for (const span of spans) {
    const key = itemKey(span.category, span.value);
    const existing = byKey.get(key);
    if (existing) {
      existing.spans.push(span);
    } else {
      byKey.set(key, { value: span.value, category: span.category, spans: [span] });
    }
  }
  return [...byKey.values()];
}
