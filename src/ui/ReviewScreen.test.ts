import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewScreen } from './ReviewScreen';
import type { Item } from '../domain/types';

// The review screen has no jsdom in this repo, so we render to static markup
// (the existing UI-test convention here) and assert on the resulting HTML. That
// is enough for the banner/role distinction and the redact-enabled state, which
// is all this slice changes.

function personItem(value: string, start = 0): Item {
  return {
    value,
    category: 'PERSON',
    spans: [{ start, end: start + value.length, category: 'PERSON', value }],
  };
}

interface Overrides {
  items?: Item[];
  safetyWarning?: string;
  advisory?: string;
  batchPosition?: { index: number; total: number };
}

function render({
  items = [personItem('John Smith')],
  safetyWarning,
  advisory,
  batchPosition,
}: Overrides): string {
  return renderToStaticMarkup(
    createElement(ReviewScreen, {
      filename: 'people.csv',
      batchPosition,
      items,
      locate: () => 'row 2, col 2',
      safetyWarning,
      advisory,
      onRedact: () => {},
      onRedactAnother: () => {},
    }),
  );
}

const ADVISORY =
  'The "name" column looks like a list of people\'s names, but the detector didn\'t recognise any.';

describe('ReviewScreen — name-column advisory', () => {
  // Core behaviour: the advisory is a soft, non-blocking notice — it shows the
  // message, uses the status role (not the alert role the blocking PDF warning
  // uses), and leaves the Redact button enabled so the user can still proceed.
  it('renders the advisory as a non-blocking status banner with redaction enabled', () => {
    const html = render({ advisory: ADVISORY });
    // The markup HTML-escapes quotes/apostrophes, so assert on an entity-free
    // slice of the message rather than the raw string.
    expect(html).toContain('column looks like a list of');
    expect(html).toContain('role="status"');
    // No blocking alert when it's only an advisory.
    expect(html).not.toContain('role="alert"');
    // The reviewed name is listed, and the Redact button is not disabled.
    expect(html).toContain('John Smith');
    expect(html).not.toContain('disabled');
  });

  // Edge case: the blocking safety warning is a different beast — it uses the
  // alert role and hard-disables redaction. Asserting it here guards the
  // distinction between the two banners.
  it('keeps the safety warning a blocking alert that disables redaction', () => {
    const warning = "This PDF is a scanned image — it is NOT sanitised.";
    const html = render({ safetyWarning: warning });
    expect(html).toContain('role="alert"');
    expect(html).toContain(warning);
    expect(html).toContain('disabled');
  });

  // Edge case: in a multi-file Batch an unsafe file must still be skippable so
  // the user can advance without using Home.
  it('offers a batch skip affordance when redaction is blocked in a multi-file Batch', () => {
    const warning = "This PDF is a scanned image — it is NOT sanitised.";
    const html = render({ safetyWarning: warning, batchPosition: { index: 1, total: 3 } });
    expect(html).toContain('Skip this file and continue');
  });
});

describe('ReviewScreen — batch file header', () => {
  // Core behaviour: in a multi-file Batch the header names the file under review
  // and shows its position, so the user knows which file's PII they're confirming.
  it('shows the filename and "File N of M" position in a multi-file Batch', () => {
    const html = render({ batchPosition: { index: 2, total: 5 } });
    expect(html).toContain('people.csv');
    expect(html).toContain('File 2 of 5');
  });

  // Edge case: a Batch of one has no ambiguity, so the position counter is
  // omitted — the filename still shows, but "File 1 of 1" would be noise.
  it('omits the position counter for a Batch of one', () => {
    const html = render({ batchPosition: { index: 1, total: 1 } });
    expect(html).toContain('people.csv');
    expect(html).not.toContain('File 1 of 1');
  });
});
