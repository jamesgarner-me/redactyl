import type { Span, TokenAssignment } from '../domain/types';

// Replace each Span's range with its token. Right-to-left so that splicing an
// earlier match never shifts the offsets of matches not yet processed.
export function redact(text: string, spans: Span[], tokens: TokenAssignment): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const span of ordered) {
    out = out.slice(0, span.start) + tokens.tokenFor(span) + out.slice(span.end);
  }
  return out;
}

// Inverse of `redact` given a token -> value mapping. Longest tokens first so a
// token that is a prefix of another (`<EMAIL_1>` vs `<EMAIL_11>`) can't corrupt
// it. Used by the round-trip test now and by v1.5 re-substitution later.
export function applyMapping(text: string, mapping: Record<string, string>): string {
  const ordered = Object.entries(mapping).sort((a, b) => b[0].length - a[0].length);
  let out = text;
  for (const [token, value] of ordered) {
    out = out.split(token).join(value);
  }
  return out;
}
