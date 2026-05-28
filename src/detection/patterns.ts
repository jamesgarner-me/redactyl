import type { Category, Span } from '../domain/types';

interface PatternDef {
  category: Category;
  pattern: RegExp;
}

// Pragmatic email matcher. Refined and joined by the rest of the category set
// in slice 2; kept deliberately narrow here.
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export const PATTERNS: PatternDef[] = [{ category: 'EMAIL', pattern: EMAIL }];

// Pure detection over the registered patterns. No worker, no DOM — safe to
// import directly from tests and (later) the NER layer.
export function runDetectors(text: string): Span[] {
  const spans: Span[] = [];
  for (const { category, pattern } of PATTERNS) {
    // Fresh RegExp per run so lastIndex never leaks between calls.
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
        category,
        value: match[0],
      });
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  spans.sort((a, b) => a.start - b.start);
  return spans;
}
