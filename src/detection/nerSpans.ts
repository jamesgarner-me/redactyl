import type { Category } from '../domain/types';
import type { ScoredSpan } from './merge';

// One grouped entity from a transformers.js token-classification pipeline run
// with `aggregation_strategy: 'simple'`. `start`/`end` are character offsets in
// the source text; they are usually present but typed optional, so we relocate
// when missing. Kept transformers.js-free so tests can import it directly.
export interface NerToken {
  entity_group: string;
  score: number;
  word: string;
  start?: number;
  end?: number;
}

// The 8 labels openai/privacy-filter emits → Redactyl Categories. SSN,
// CREDIT_CARD, IBAN and IP have no model equivalent and stay regex-only.
const LABEL_TO_CATEGORY: Record<string, Category> = {
  private_person: 'PERSON',
  private_address: 'ADDRESS',
  account_number: 'ACCOUNT_NUMBER',
  private_email: 'EMAIL',
  private_phone: 'PHONE',
  private_url: 'URL',
  private_date: 'DATE',
  secret: 'SECRET',
};

// NER is a second opinion: score (0–1) maps to ~50–70, slotting above the
// ambiguous regex (PHONE 40, DATE 30, URL 60) but below precise/validated regex
// (EMAIL 90, SSN 80, CREDIT_CARD/IBAN 95, SECRET 100) — so a validated card or
// IBAN beats a generic account_number, and identical spans simply collapse.
const NER_BASE = 50;
const NER_RANGE = 20;

export function nerConfidence(score: number): number {
  const clamped = Math.min(Math.max(score, 0), 1);
  return NER_BASE + Math.round(clamped * NER_RANGE);
}

function trimWhitespace(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}

// Resolve a token to a clean, whitespace-trimmed character range. Prefer the
// pipeline's offsets; if absent or stale, locate the trimmed word forward from
// the cursor (NER output is left-to-right, so this disambiguates repeats).
function resolveRange(
  token: NerToken,
  text: string,
  cursor: number,
): [number, number] | null {
  const provided =
    token.start != null && token.end != null && token.end > token.start
      ? trimWhitespace(text, token.start, token.end)
      : null;
  if (provided && provided[1] > provided[0]) return provided;

  const needle = token.word.trim();
  if (!needle) return null;
  const at = text.indexOf(needle, cursor);
  if (at === -1) return null;
  return [at, at + needle.length];
}

// Map grouped NER tokens to ScoredSpans, dropping unmapped labels and anchoring
// each value to the real source text so redaction offsets stay exact.
export function nerSpansFrom(tokens: NerToken[], text: string): ScoredSpan[] {
  const spans: ScoredSpan[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const category = LABEL_TO_CATEGORY[token.entity_group];
    if (!category) continue;
    const range = resolveRange(token, text, cursor);
    if (!range) continue;
    const [start, end] = range;
    const value = text.slice(start, end);
    if (!value) continue;
    spans.push({ start, end, category, value, confidence: nerConfidence(token.score) });
    cursor = end;
  }
  return spans;
}
