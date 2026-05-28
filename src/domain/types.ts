// Canonical domain vocabulary — see CONTEXT.md.

// The full v1 Category set. Only EMAIL is produced in this slice; the rest are
// defined now so later detection layers (slices 2, 7) are purely additive.
export type Category =
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'IP'
  | 'DATE'
  | 'SSN'
  | 'CREDIT_CARD'
  | 'IBAN'
  | 'ACCOUNT_NUMBER'
  | 'SECRET'
  | 'PERSON'
  | 'ADDRESS';

// One appearance of one piece of data within the extracted text.
export interface Span {
  start: number;
  end: number;
  category: Category;
  value: string;
}

// A unique value grouped across every place it appears — the unit the user
// accepts or opts out of. `spans.length` is its Occurrence count.
export interface Item {
  value: string;
  category: Category;
  spans: Span[];
}

// One token assignment, in first-appearance order. The `entries` shape is what
// slice 4's MappingExporter will consume.
export interface TokenEntry {
  token: string;
  category: Category;
  value: string;
}

export interface TokenAssignment {
  tokenFor(span: Span): string;
  entries: TokenEntry[];
}
