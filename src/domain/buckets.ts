import type { Category } from './types';

// Display-only groupings used solely in the review summary strip. Buckets never
// affect Tokens or list rows, which stay granular. See CONTEXT.md.
const ID_CATEGORIES: ReadonlySet<Category> = new Set([
  'SSN',
  'CREDIT_CARD',
  'IBAN',
  'ACCOUNT_NUMBER',
]);
const NETWORK_CATEGORIES: ReadonlySet<Category> = new Set(['URL', 'IP']);

// The Bucket a Category rolls up into. All Categories outside ID/NETWORK map 1:1
// to a Bucket of their own name.
export function bucketFor(category: Category): string {
  if (ID_CATEGORIES.has(category)) return 'ID';
  if (NETWORK_CATEGORIES.has(category)) return 'NETWORK';
  return category;
}

// SECRET and any ID-Bucket value is masked in the review list (hint + eye to
// reveal); every other Category is shown in clear.
export function isMasked(category: Category): boolean {
  return category === 'SECRET' || bucketFor(category) === 'ID';
}

// A recognisable hint: the last 4 characters in clear, the rest bulleted (capped
// so a long value doesn't produce an unwieldy run of dots).
export function maskHint(value: string): string {
  const tail = value.slice(-4);
  const hidden = Math.max(value.length - tail.length, 0);
  return '•'.repeat(Math.min(hidden, 8)) + tail;
}
