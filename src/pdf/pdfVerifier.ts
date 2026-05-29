// PdfVerifier — the trust step. Re-parse the redacted bytes and re-run the same
// Detector used in the first pass, then report a leak when a *detected Span* in
// the output carries an accepted value. Comparing detected Spans (not raw
// substrings) means an innocent substring — `Johnson` containing a redacted
// `John` — is never falsely flagged, because the detector won't emit a Span
// valued `John` for it.
//
// `detect` is injected so production passes the worker detector while tests pass
// a regex-only detector — no 770 MB model needed to verify.

import type { Item, Span } from '../domain/types';
import { extractPdf } from './pdfExtractor';

export interface VerificationResult {
  ok: boolean;
  leaks: Item[];
}

export async function verifyPdf(
  bytes: ArrayBuffer | Uint8Array,
  expectedAbsent: Item[],
  detect: (text: string) => Span[] | Promise<Span[]>,
): Promise<VerificationResult> {
  const { text } = await extractPdf(bytes);
  const spans = await detect(text);
  const detectedValues = new Set(spans.map((s) => s.value));
  const leaks = expectedAbsent.filter((item) => detectedValues.has(item.value));
  return { ok: leaks.length === 0, leaks };
}
