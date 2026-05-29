import { describe, expect, it } from 'vitest';
import { extractPdf } from './pdfExtractor';
import { verifyPdf } from './pdfVerifier';
import { buildPdf } from './pdfTestUtils';
import { runDetectors } from '../detection/patterns';
import { groupItems } from '../domain/items';
import type { Item } from '../domain/types';

const detect = (text: string) => runDetectors(text);

describe('verifyPdf', () => {
  it('reports a leak when an accepted value still appears in the output', async () => {
    // Unredacted bytes: the email is still present, so verification must fail.
    const bytes = await buildPdf([['Contact alice@example.com today']]);
    const { text } = await extractPdf(bytes);
    const items = groupItems(detect(text));

    const result = await verifyPdf(bytes, items, detect);
    expect(result.ok).toBe(false);
    expect(result.leaks.map((i) => i.value)).toContain('alice@example.com');
  });

  it('reports no leaks for a clean output', async () => {
    const bytes = await buildPdf([['Nothing sensitive on this page']]);
    const expectedAbsent: Item[] = [
      { value: 'alice@example.com', category: 'EMAIL', spans: [] },
    ];

    const result = await verifyPdf(bytes, expectedAbsent, detect);
    expect(result).toEqual({ ok: true, leaks: [] });
  });

  it('does not flag an innocent substring as a leak (Span comparison, not substring)', async () => {
    // The redacted value is `John`; the output legitimately contains `Johnson`.
    // A substring check would false-positive; a detected-Span check does not,
    // because the detector emits no Span valued `John` for `Johnson`.
    const bytes = await buildPdf([['Johnson manufacturing report']]);
    const expectedAbsent: Item[] = [{ value: 'John', category: 'PERSON', spans: [] }];

    const result = await verifyPdf(bytes, expectedAbsent, detect);
    expect(result).toEqual({ ok: true, leaks: [] });
  });
});
