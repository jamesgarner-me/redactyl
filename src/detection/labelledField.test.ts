import { describe, expect, it } from 'vitest';
import { labelledFieldSpans } from './patterns';
import { mergeSpans, type ScoredSpan } from './merge';
import { propagateOccurrences } from './propagate';
import type { Category } from '../domain/types';

function values(text: string): { value: string; category: Category }[] {
  return labelledFieldSpans(text).map(({ value, category }) => ({ value, category }));
}

describe('labelledFieldSpans', () => {
  it('captures the value of a "- Residential address:" line, anchored exactly', () => {
    const text = '- Residential address: Unit 3, 22 Park Street, Brunswick VIC 3056';
    const spans = labelledFieldSpans(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      category: 'ADDRESS',
      value: 'Unit 3, 22 Park Street, Brunswick VIC 3056',
    });
    expect(text.slice(spans[0].start, spans[0].end)).toBe(spans[0].value);
  });

  it('recognises all four address-label variants', () => {
    const text = [
      '- Residential address: 1 A St, Kew VIC 3101',
      '- Postal address: 2 B St, Kew VIC 3101',
      'Home address: 3 C St, Kew VIC 3101',
      '* Street address: 4 D St, Kew VIC 3101',
    ].join('\n');
    expect(values(text).map((v) => v.value)).toEqual([
      '1 A St, Kew VIC 3101',
      '2 B St, Kew VIC 3101',
      '3 C St, Kew VIC 3101',
      '4 D St, Kew VIC 3101',
    ]);
  });

  it('is case-insensitive on the label and tolerates spacing/markers', () => {
    expect(values('residential address:33 Sackville Street, Kew VIC 3101')).toEqual([
      { value: '33 Sackville Street, Kew VIC 3101', category: 'ADDRESS' },
    ]);
    expect(values('   -   RESIDENTIAL ADDRESS :   5 E St, Kew VIC 3101  ')).toEqual([
      { value: '5 E St, Kew VIC 3101', category: 'ADDRESS' },
    ]);
  });

  it('trims trailing whitespace but keeps internal punctuation', () => {
    const text = '- Postal address: Level 8, 90 Collins Street, Melbourne VIC 3000   ';
    expect(values(text)).toEqual([
      { value: 'Level 8, 90 Collins Street, Melbourne VIC 3000', category: 'ADDRESS' },
    ]);
  });

  it('ignores a label with no value', () => {
    expect(labelledFieldSpans('- Residential address:')).toHaveLength(0);
    expect(labelledFieldSpans('- Residential address:   ')).toHaveLength(0);
  });

  it('does not match an unrelated "address" mention in prose', () => {
    // Requires a known label word at line start, so prose "address:" never fires.
    expect(labelledFieldSpans('Please update your address: it is important.')).toHaveLength(0);
    expect(labelledFieldSpans('We could not address: the issue today.')).toHaveLength(0);
  });

  it('closes the single-occurrence leak: a structured-only address with no prose copy', () => {
    // The exact round-3 failure — value appears once, only in the field. The
    // label detector catches it deterministically; propagation is a no-op here
    // (one occurrence) but the value is now masked.
    const text =
      'Client: someone\n- Residential address: 33 Sackville Street, Kew VIC 3101\nNotes: none.';
    const labelled = labelledFieldSpans(text);
    const propagated = propagateOccurrences(text, labelled);
    const merged = mergeSpans([...labelled, ...propagated]).filter((s) => s.category === 'ADDRESS');
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('33 Sackville Street, Kew VIC 3101');
  });

  it('label detection + propagation spreads a field address to its prose occurrence', () => {
    const addr = '9 Aberdeen Road, Macedon VIC 3440';
    const text =
      `- Residential address: ${addr}\n` +
      `During the review meeting held at ${addr}, the client reaffirmed the IPS.`;
    const labelled = labelledFieldSpans(text); // catches the field occurrence only
    expect(labelled).toHaveLength(1);
    const propagated = propagateOccurrences(text, labelled); // spreads to prose
    const merged = mergeSpans([...labelled, ...propagated]).filter((s) => s.category === 'ADDRESS');
    expect(merged).toHaveLength(2);
  });

  it('collapses with an overlapping model ADDRESS span (no double redaction)', () => {
    const text = '- Residential address: 9 Aberdeen Road, Macedon VIC 3440';
    const labelled = labelledFieldSpans(text)[0];
    // A lower-confidence NER span over the same range.
    const ner: ScoredSpan = { ...labelled, confidence: 65 };
    const merged = mergeSpans([labelled, ner]);
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(labelled.value);
  });
});

// GitHub #12: labelled numeric identifiers (TFN, driver's licence, Medicare,
// passport) were surfacing under the Phone bucket as <PHONE_n>. The author's
// explicit label is stronger evidence than any digit-shape guess, so these now
// land in the ID bucket (ACCOUNT_NUMBER) and beat both the bare PHONE regex and
// the model's private_phone span at merge.
describe('labelled ID fields (GitHub #12)', () => {
  it('classifies labelled TFN and licence lines as ACCOUNT_NUMBER, anchored exactly', () => {
    const cases: { line: string; value: string }[] = [
      { line: 'TFN: 123 456 782', value: '123 456 782' },
      { line: 'Tax File Number: 123 456 782', value: '123 456 782' },
      { line: "- Driver's licence: 1234 5678 9012", value: '1234 5678 9012' },
      { line: 'Licence number: D1234567', value: 'D1234567' },
      { line: 'Medicare number: 2123 45670 1', value: '2123 45670 1' },
      { line: 'Passport No: PA1234567', value: 'PA1234567' },
    ];
    for (const { line, value } of cases) {
      const spans = labelledFieldSpans(line);
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({ category: 'ACCOUNT_NUMBER', value });
      // The span anchors to the value only, never the label or padding.
      expect(line.slice(spans[0].start, spans[0].end)).toBe(value);
    }
  });

  it('beats a competing PHONE / private_phone span over the same value at merge', () => {
    // The core bug: a TFN the model misreads as a phone. The labelled span (90)
    // must win the overlap so the value is tokenised as an ID, not <PHONE_n>.
    const labelled = labelledFieldSpans('TFN: 123 456 782')[0];
    const phoneRegex: ScoredSpan = { ...labelled, category: 'PHONE', confidence: 40 };
    const phoneNer: ScoredSpan = { ...labelled, category: 'PHONE', confidence: 65 };
    const merged = mergeSpans([phoneRegex, phoneNer, labelled]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ category: 'ACCOUNT_NUMBER', value: '123 456 782' });
  });

  it('propagates a labelled TFN to a bare occurrence elsewhere in the document', () => {
    const text = 'TFN: 123 456 782\nPlease quote 123 456 782 in correspondence.';
    const labelled = labelledFieldSpans(text); // catches the labelled occurrence only
    expect(labelled).toHaveLength(1);
    const propagated = propagateOccurrences(text, labelled); // spreads to the prose copy
    const ids = mergeSpans([...labelled, ...propagated]).filter(
      (s) => s.category === 'ACCOUNT_NUMBER',
    );
    expect(ids).toHaveLength(2);
    expect(ids.every((s) => s.value === '123 456 782')).toBe(true);
  });

  // Edge case: an ID label whose value isn't numeric is prose, not an identifier.
  it('does not mask a non-numeric value after an ID-ish label', () => {
    expect(labelledFieldSpans('Licence: granted on appeal')).toHaveLength(0);
    expect(labelledFieldSpans('Passport: ready for collection')).toHaveLength(0);
  });

  // Edge case: a labelled phone line is not an ID label, so the ID layer ignores
  // it and the value is left for the PHONE detectors — no PHONE→ID regression.
  it('leaves a labelled phone line for the PHONE detectors', () => {
    expect(labelledFieldSpans('Phone: +61 408 776 221')).toHaveLength(0);
    expect(labelledFieldSpans('Mobile: 0412 345 678')).toHaveLength(0);
  });
});
