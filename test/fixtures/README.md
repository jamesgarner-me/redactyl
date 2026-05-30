# PDF test-fixture corpus

The corpus the PDF pipeline (extraction → safety checks → true-redaction →
verification → rasterise fallback, issues 08–10) is regressed against.

## Policy: no binary PDFs are checked in

Every fixture is **generated deterministically at run time** with `pdf-lib`
(builders live in [`src/pdf/pdfTestUtils.ts`](../../src/pdf/pdfTestUtils.ts) and
the corpus is assembled in [`corpus.ts`](./corpus.ts)). This keeps the repo
licence-clean by construction — there are no third-party documents to attribute
or risk re-distributing — and keeps the fixtures diffable and reviewable as code
rather than opaque binaries. Each synthetic fixture is annotated with the
**real-world document shape it stands in for**, so the corpus maps onto the files
users actually drop in.

To add a genuinely real-world PDF later, keep it **small and licence-clean**
(public-domain or your own), add a builder/loader, and extend `CORPUS` with its
`emulates` description and `expected` outcome.

## The corpus

| Fixture | Builder | Emulates | Expected outcome |
|---|---|---|---|
| `clean-single-page` | `buildPdf` | a typed letter/invoice exported straight to PDF | **clean** — rewrite removes the text, no page rasterised |
| `multi-page` | `buildPdf` (2 pages) | a report with PII on more than one page | **clean** — rewrite + verify span every page |
| `form-xobject` | `buildXObjectPdf` | a browser "Print to PDF" export (text painted via a Form XObject) | **clean** — see note below |
| `kerning-split` | `buildKerningSplitPdf` | kerned / ligature / CID fonts where a value is split across `TJ` operands | **rasterise** — per-operand rewrite can't remove it, so the page is flattened |
| `encrypted` | `buildEncryptedPdf` | a password-protected PDF | **blocked** — `encrypted` safety check; no output |
| `scanned` | `buildScannedPdf` | a scanned, image-only document (no text layer) | **blocked** — `scanned` safety check; no output |

> The third fail-closed case — **garbled** extraction (a PDF whose font tables
> yield >5% unmappable / U+FFFD glyphs) — has no deterministic `pdf-lib` builder
> (standard-font synthesis always extracts cleanly), so it isn't in the corpus.
> Its safety check is covered directly by the `garbleRatio` unit tests in
> [`src/pdf/pdfExtractor.test.ts`](../../src/pdf/pdfExtractor.test.ts).

### Note — `form-xobject` and the missing visual box

The content-stream rewrite **follows `Resources` → `XObject` into the Form
stream** and blanks the value there, so re-extraction yields `"Donor email  on
file"` and verification passes **without** rasterising — copy/paste from the
output reveals nothing.

There is, however, a real visual limitation: pdfjs exposes **no glyph geometry**
for text painted through a Form XObject, so the redactor can't place the black
rectangle that *marks* the redaction. The text is gone (the security guarantee
holds), but on these pages there's no visible black box. This is a known
limitation of browser-printed PDFs, recorded here and in the top-level README;
the verification pass — which is leak-based, not box-based — still passes the
file because no PII is extractable.

## Outcome vocabulary (`expected`)

- **clean** — the content-stream rewrite alone removes the PII; no page is rasterised.
- **rasterise** — the rewrite can't fully remove/cover it, so the affected page is
  flattened to an image and re-verified. Text on that page becomes non-selectable.
- **blocked** — a safety check trips at extraction; **fail-closed: no output file is
  ever produced.** Partial detection results are still shown to the user.

## Running the regression

```sh
pnpm test                                  # runs the whole suite, corpus included
pnpm exec vitest run test/corpus           # just the corpus regression
```

The oracle is the **production verification pass itself** — a fixture only passes
if re-extracting the output and re-detecting finds none of its accepted values
(the same fail-closed check that gates a real download). When the `pdftotext` CLI
is installed, it is added as a **second, independent extractor** to guard against a
blind spot shared by pdfjs and our own detector.

Detection in the regression is **regex-only** (`runDetectors`); the NER layer
needs a browser runtime and isn't part of this headless run. Rasterisation is
stubbed with a 1×1 PNG because what's asserted is that flattening *drops the text
layer*, not the rendered pixels.

Results are written to [`../corpus/RESULTS.md`](../corpus/RESULTS.md) on every run
(deterministic — it only changes when pipeline behaviour changes).
