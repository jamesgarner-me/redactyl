import {
  buildPdf,
  buildXObjectPdf,
  buildKerningSplitPdf,
  buildScannedPdf,
  buildEncryptedPdf,
} from '../../src/pdf/pdfTestUtils';

// The PDF corpus the slice 8–10 pipeline is regressed against (issue 12).
//
// Every fixture is generated deterministically with pdf-lib at run time — no
// binary PDFs are checked in (licence-clean by construction; see the policy note
// in test/fixtures/README.md). Each entry names the *real-world shape* it stands
// in for, so the synthetic corpus maps onto the documents users actually drop.
//
// `expected` is the fail-closed contract:
//   - 'clean'     → rewrite alone removes the PII; no page is rasterised.
//   - 'rasterise' → the content-stream rewrite can't remove/cover it, so the page
//                   is flattened to an image and re-verified.
//   - 'blocked'   → a safety check trips at extraction; NO output is ever made.

export type Expected = 'clean' | 'rasterise' | 'blocked';

export interface CorpusFixture {
  name: string;
  // The real document shape this synthetic fixture emulates.
  emulates: string;
  expected: Expected;
  // For 'blocked' fixtures, the safety kind extraction must report.
  safety?: 'encrypted' | 'scanned' | 'garbled';
  // Plain-text PII that must be absent from the output (for redactable fixtures).
  piiAbsent?: string[];
  build(): Promise<Uint8Array>;
}

export const CORPUS: CorpusFixture[] = [
  {
    name: 'clean-single-page',
    emulates: 'a typed letter or invoice exported straight to PDF',
    expected: 'clean',
    piiAbsent: ['alice@example.com', '123-45-6789'],
    build: () => buildPdf([['Reach alice@example.com or ssn 123-45-6789 anytime']]),
  },
  {
    name: 'multi-page',
    emulates: 'a multi-page report with PII on more than one page',
    expected: 'clean',
    piiAbsent: ['alice@example.com', 'bob@example.org', '123-45-6789'],
    build: () =>
      buildPdf([
        ['Page one — reach alice@example.com for access'],
        ['Page two — escalate to bob@example.org', 'SSN on file: 123-45-6789'],
      ]),
  },
  {
    name: 'form-xobject',
    emulates: "a browser's \"Print to PDF\" export (text painted via a Form XObject)",
    // The rewrite follows Resources/XObject into the Form stream and blanks the
    // value there, so re-extraction is clean and verification passes without
    // rasterising. (pdfjs exposes no glyph geometry for XObject-painted text, so
    // no black box is drawn — but verification is leak-based, not box-based, so
    // this stays a clean case. See test/fixtures/README.md.)
    expected: 'clean',
    piiAbsent: ['alice@example.com'],
    build: () => buildXObjectPdf(['Donor email alice@example.com on file']),
  },
  {
    name: 'kerning-split',
    emulates: 'kerned / ligature / CID fonts where a value is split across TJ operands',
    expected: 'rasterise',
    piiAbsent: ['alice@example.com'],
    build: () => buildKerningSplitPdf('alice@example.com'),
  },
  {
    name: 'encrypted',
    emulates: 'a password-protected PDF',
    expected: 'blocked',
    safety: 'encrypted',
    build: () => buildEncryptedPdf(),
  },
  {
    name: 'scanned',
    emulates: 'a scanned, image-only document with no text layer',
    expected: 'blocked',
    safety: 'scanned',
    build: () => buildScannedPdf(),
  },
];
