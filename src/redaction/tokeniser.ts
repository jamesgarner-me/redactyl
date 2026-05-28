import { itemKey } from '../domain/items';
import type { Category, Span, TokenAssignment, TokenEntry } from '../domain/types';

// Assign a stable `<CATEGORY_N>` token to each unique value. N is a per-Category
// counter assigned in first-appearance order; the same value reuses its token.
export function assignTokens(spans: Span[]): TokenAssignment {
  const ordered = [...spans].sort((a, b) => a.start - b.start);
  const counters = new Map<Category, number>();
  const tokenByKey = new Map<string, string>();
  const entries: TokenEntry[] = [];

  for (const span of ordered) {
    const key = itemKey(span.category, span.value);
    if (tokenByKey.has(key)) continue;
    const n = (counters.get(span.category) ?? 0) + 1;
    counters.set(span.category, n);
    const token = `<${span.category}_${n}>`;
    tokenByKey.set(key, token);
    entries.push({ token, category: span.category, value: span.value });
  }

  return {
    tokenFor: (span) => tokenByKey.get(itemKey(span.category, span.value))!,
    entries,
  };
}
