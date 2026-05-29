import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdfExtractor';
import { redactPdf } from './pdfRedactor';
import { verifyPdf } from './pdfVerifier';
import { buildPdf } from './pdfTestUtils';
import { runDetectors } from '../detection/patterns';
import { groupItems } from '../domain/items';

// Regex-only detector — the same surface the worker merges, without the model.
const detect = (text: string) => runDetectors(text);

const hasPdftotext = (() => {
  try {
    execFileSync('which', ['pdftotext'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('redactPdf + verifyPdf (integration)', () => {
  it('removes accepted PII from the content stream and verifies no leaks', async () => {
    const bytes = await buildPdf([['Reach alice@example.com or ssn 123-45-6789 anytime']]);
    const { text, glyphs } = await extractPdf(bytes);
    const spans = detect(text);
    const items = groupItems(spans);

    expect(items.map((i) => i.value).sort()).toEqual(['123-45-6789', 'alice@example.com']);

    const redacted = await redactPdf(bytes, spans, glyphs);

    // (a) the verifier reports no leaks
    const result = await verifyPdf(redacted, items, detect);
    expect(result).toEqual({ ok: true, leaks: [] });

    // (b) re-extracted text no longer contains the PII (copy/paste yields nothing)
    const after = await extractPdf(redacted);
    expect(after.text).not.toContain('alice@example.com');
    expect(after.text).not.toContain('123-45-6789');
  });

  it.skipIf(!hasPdftotext)('pdftotext on the output produces no accepted PII strings', async () => {
    const bytes = await buildPdf([['Reach alice@example.com or ssn 123-45-6789 anytime']]);
    const { text, glyphs } = await extractPdf(bytes);
    const redacted = await redactPdf(bytes, detect(text), glyphs);

    // Repo-local temp (not the system /tmp), auto-cleaned below.
    const dir = mkdtempSync(join(process.cwd(), '.scratch', 'pdf-'));
    try {
      const path = join(dir, 'out.pdf');
      writeFileSync(path, redacted);
      const out = execFileSync('pdftotext', [path, '-']).toString();
      expect(out).not.toContain('alice@example.com');
      expect(out).not.toContain('123-45-6789');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
