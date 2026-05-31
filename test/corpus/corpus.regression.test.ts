import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { extractPdf } from '../../src/pdf/pdfExtractor';
import { redactAndVerifyPdf } from '../../src/pdf/pdfRedactor';
import { verifyPdf } from '../../src/pdf/pdfVerifier';
import { PIXEL_PNG } from '../../src/pdf/pdfTestUtils';
import { runDetectors } from '../../src/detection/patterns';
import { spansToItems } from '../../src/domain/items';
import { CORPUS, type CorpusFixture } from '../fixtures/corpus';

// Issue 12 — real-world PDF corpus regression across the slice 8–10 pipeline
// (extract → safety → detect → true-redact → verify → rasterise fallback).
//
// The oracle is the production verification pass itself: a fixture only passes if
// re-extracting the output and re-detecting finds none of its accepted values —
// the same fail-closed test that gates a real download. Where the `pdftotext` CLI
// is present we add it as a second, independent extractor, guarding against a
// blind spot shared by pdfjs and our own detector.
//
// Detection here is regex-only (`runDetectors`); the NER model needs a browser
// runtime and isn't part of this headless regression. Rasterisation is stubbed
// with a 1×1 PNG — real rendering needs a canvas — because what the regression
// asserts is that flattening *drops the text layer*, not the rendered pixels.

// The verification surface returns Items (the Spans → Items reduction); raw
// `runDetectors` is used directly where the redactor needs flat accepted Spans.
const detect = (text: string) => spansToItems(runDetectors(text));
const renderPage = async () => PIXEL_PNG;

const hasPdftotext = (() => {
  try {
    execFileSync('which', ['pdftotext'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

interface ResultRow {
  fixture: CorpusFixture;
  outcome: 'clean' | 'rasterise' | 'blocked';
  rasterisedPages: number[];
  leaks: number;
  pdftotextClean: boolean | null; // null = CLI unavailable / not applicable
  pass: boolean;
}

const results: ResultRow[] = [];
const record = (row: ResultRow) => results.push(row);

describe('PDF corpus regression (slice 8–10)', () => {
  describe.each(CORPUS.filter((f) => f.expected !== 'blocked'))(
    'redactable: $name',
    (fixture) => {
      it(`true-redacts and verifies clean (${fixture.expected})`, async () => {
        const bytes = await fixture.build();
        const { text, glyphs, safety } = await extractPdf(bytes);
        expect(safety).toBeNull();

        const spans = runDetectors(text);
        const items = spansToItems(spans);
        const outcome = await redactAndVerifyPdf(bytes, spans, glyphs, { detect, renderPage });

        // (1) fail-closed verification passed
        expect(outcome.ok).toBe(true);
        // (2) the rasterise fallback ran iff the fixture needs it
        const expectRaster = fixture.expected === 'rasterise';
        expect(outcome.rasterisedPages.length > 0).toBe(expectRaster);
        // (3) the production verifier (re-parse + re-detect) sees no leaks
        const verification = await verifyPdf(outcome.bytes, items, detect);
        expect(verification.ok).toBe(true);
        // (4) re-extraction confirms each value is gone (copy/paste yields nothing)
        const after = await extractPdf(outcome.bytes);
        for (const value of fixture.piiAbsent ?? []) {
          expect(after.text).not.toContain(value);
        }

        // (5) second, independent oracle: pdftotext on the output (when present)
        let pdftotextClean: boolean | null = null;
        if (hasPdftotext && (fixture.piiAbsent?.length ?? 0) > 0) {
          const dir = mkdtempSync(join(process.cwd(), '.scratch', 'corpus-'));
          try {
            const path = join(dir, 'out.pdf');
            writeFileSync(path, outcome.bytes);
            const out = execFileSync('pdftotext', [path, '-']).toString();
            pdftotextClean = (fixture.piiAbsent ?? []).every((v) => !out.includes(v));
            expect(pdftotextClean).toBe(true);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }

        record({
          fixture,
          outcome: expectRaster ? 'rasterise' : 'clean',
          rasterisedPages: outcome.rasterisedPages,
          leaks: verification.leaks.length,
          pdftotextClean,
          pass: true,
        });
      });
    },
  );

  describe.each(CORPUS.filter((f) => f.expected === 'blocked'))(
    'blocked: $name',
    (fixture) => {
      it(`trips the ${fixture.safety} safety check and produces no output`, async () => {
        const bytes = await fixture.build();
        const { safety } = await extractPdf(bytes);
        // Fail-closed: extraction flags it and the app never reaches redaction.
        expect(safety?.kind).toBe(fixture.safety);
        record({
          fixture,
          outcome: 'blocked',
          rasterisedPages: [],
          leaks: 0,
          pdftotextClean: null,
          pass: true,
        });
      });
    },
  );

  // Record the run as a committed artefact. Content is deterministic (no
  // timestamp), so it only changes when the pipeline's behaviour does — exactly
  // what you want a regression record to do.
  afterAll(() => {
    const ordered = CORPUS.map((f) => results.find((r) => r.fixture.name === f.name)).filter(
      (r): r is ResultRow => r != null,
    );
    if (ordered.length !== CORPUS.length) return; // partial run (e.g. -t filter)

    const oracleNote = hasPdftotext
      ? 'pdfjs re-extraction + production verifier + pdftotext (second oracle).'
      : 'pdfjs re-extraction + production verifier. (pdftotext not installed on this run — second oracle skipped.)';

    const rows = ordered
      .map((r) => {
        const raster = r.outcome === 'rasterise' ? `yes (p. ${r.rasterisedPages.join(', ')})` : '—';
        const second =
          r.pdftotextClean === null ? '—' : r.pdftotextClean ? 'clean' : '**LEAK**';
        return `| \`${r.fixture.name}\` | ${r.fixture.emulates} | ${r.fixture.expected} | ${r.outcome} | ${raster} | ${r.leaks} | ${second} | ${r.pass ? '✅ pass' : '❌ FAIL'} |`;
      })
      .join('\n');

    const md = `# PDF corpus regression — results

_Auto-generated by \`test/corpus/corpus.regression.test.ts\` on every \`pnpm test\` run.
Do not edit by hand; content is deterministic and changes only when pipeline
behaviour changes._

Pipeline under test: **extract → safety checks → detect → true-redact → verify →
rasterise fallback** (issues 08–10). Detection is regex-only here; the NER layer
needs a browser runtime (see the README threat model).

**Leak oracle:** ${oracleNote}

| Fixture | Emulates | Expected | Outcome | Rasterised | Leaks | 2nd oracle | Result |
|---|---|---|---|---|---|---|---|
${rows}

**Summary:** ${ordered.filter((r) => r.pass).length}/${ordered.length} fixtures pass, **0 leaks** across the corpus.
`;

    const dir = dirname(fileURLToPath(import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'RESULTS.md'), md);
  });
});
