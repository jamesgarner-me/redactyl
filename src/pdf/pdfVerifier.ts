// PdfVerifier — the trust step. Re-parse the redacted bytes and re-run the same
// Detector used in the first pass, then report a leak when a *detected Span* in
// the output carries an accepted value. Comparing detected Spans (not raw
// substrings) means an innocent substring — `Johnson` containing a redacted
// `John` — is never falsely flagged, because the detector won't emit a Span
// valued `John` for it.
//
// `detect` is injected so production passes the worker detector while tests pass
// a regex-only detector — no 770 MB model needed to verify.

import type { Item } from '../domain/types';
import { extractPdf } from './pdfExtractor';
import { makePageIndex } from '../domain/locators';

export interface VerificationResult {
  ok: boolean;
  leaks: Item[];
  // 1-based pages of the output where a leaked value still appears — what the
  // rasterise fallback (slice 10) needs to flatten.
  leakPages: number[];
}

export async function verifyPdf(
  bytes: ArrayBuffer | Uint8Array,
  expectedAbsent: Item[],
  detect: (text: string) => Item[] | Promise<Item[]>,
): Promise<VerificationResult> {
  const { text, glyphs } = await extractPdf(bytes);
  const found = await detect(text);
  const foundValues = new Set(found.map((i) => i.value));
  const leakedValues = new Set(expectedAbsent.map((i) => i.value));
  const leaks = expectedAbsent.filter((item) => foundValues.has(item.value));

  const pageAt = makePageIndex(glyphs);
  const pages = new Set<number>();
  for (const item of found)
    if (leakedValues.has(item.value))
      for (const span of item.spans) pages.add(pageAt(span.start));

  return {
    ok: leaks.length === 0,
    leaks,
    leakPages: [...pages].sort((a, b) => a - b),
  };
}
