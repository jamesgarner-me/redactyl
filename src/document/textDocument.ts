import type { Item, Span } from '../domain/types';
import { formatLocator, itemLines, makeLineIndex } from '../domain/locators';
import { assignTokens } from '../redaction/tokeniser';
import { redact } from '../redaction/textRedactor';
import { buildMapping, mappingName } from '../redaction/mappingExporter';
import { type Document, type RedactionOutcome, redactedName } from './document';

// The text Document adapter (.txt / .md). Owns line locators, the tokenise →
// redact → blob rewrite, and the optional Mapping sidecar. Mapping is offered
// (allowMapping) and there is no safety warning; text redaction never fails
// closed. The line index is built once per opened Document.
export function createTextDocument(filename: string, text: string): Document {
  const lineAt = makeLineIndex(text);
  return {
    filename,
    text,
    allowMapping: true,
    safetyWarning: undefined,
    locate(item: Item): string {
      return formatLocator(itemLines(item, lineAt));
    },
    async redact(accepted: Span[], { saveMapping }): Promise<RedactionOutcome> {
      const tokens = assignTokens(accepted);
      const output = redact(text, accepted, tokens);
      const blob = new Blob([output], { type: 'text/plain' });
      const mapping = saveMapping
        ? {
            name: mappingName(filename),
            blob: new Blob([JSON.stringify(buildMapping(tokens.entries, filename), null, 2)], {
              type: 'application/json',
            }),
          }
        : undefined;
      return { ok: true, outputName: redactedName(filename), blob, mapping };
    },
  };
}
