import type { Category, TokenEntry } from '../domain/types';

// The optional re-identification sidecar. Records Token -> { category, value }
// only — positional data (page, char offset, bbox) is deliberately omitted so
// the mapping can never re-anchor values back into a document. See CONTEXT.md.
export interface MappingFile {
  version: 1;
  createdAt: string;
  originalFilename: string;
  tokens: Record<string, { category: Category; value: string }>;
}

export function buildMapping(
  entries: TokenEntry[],
  originalFilename: string,
  createdAt: Date = new Date(),
): MappingFile {
  const tokens: MappingFile['tokens'] = {};
  for (const entry of entries) {
    tokens[entry.token] = { category: entry.category, value: entry.value };
  }
  return {
    version: 1,
    // Match the documented shape: ISO 8601, seconds precision, no millis.
    createdAt: createdAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    originalFilename,
    tokens,
  };
}

// `contract.pdf` -> `contract.redactyl-mapping.json`
export function mappingName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return `${base}.redactyl-mapping.json`;
}
