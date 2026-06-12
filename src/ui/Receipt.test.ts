import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Receipt } from './Receipt';
import type { BatchFailure, BatchOutput } from '../batch/batch';

// No jsdom in this repo, so we render the receipt to static markup (the existing
// UI-test convention here) and assert on the resulting HTML. The interactive
// zip assembly is covered directly in batch/zipBundle.test.ts; here we pin the
// receipt's structure — succeeded vs failed separation and the bundle actions.

function output(name: string, mapping?: string): BatchOutput {
  return {
    outputName: name,
    blob: new Blob([name]),
    mapping: mapping ? { name: mapping, blob: new Blob([mapping]) } : undefined,
  };
}

function render(outputs: BatchOutput[], failures: BatchFailure[] = []): string {
  return renderToStaticMarkup(
    createElement(Receipt, { outputs, failures, onRedactAnother: () => {} }),
  );
}

describe('Receipt — batch outputs', () => {
  // Core behaviour: every succeeded output is listed with its name, and a
  // multi-output Batch offers the "Save all" zip alongside the per-file saves.
  it('lists every output and offers Save all for more than one', () => {
    const html = render([output('a.redacted.txt'), output('b.redacted.pdf')]);
    expect(html).toContain('a.redacted.txt');
    expect(html).toContain('b.redacted.pdf');
    expect(html).toContain('Save all (2)');
    // Per-file saves remain (two output cards + the save-all = at least 3).
    expect(html.match(/↓ save/g)?.length).toBeGreaterThanOrEqual(2);
  });

  // A Batch of one keeps the per-file save and shows no "Save all" button.
  it('omits Save all for a Batch of one', () => {
    const html = render([output('only.redacted.txt')]);
    expect(html).toContain('only.redacted.txt');
    expect(html).toContain('↓ save');
    expect(html).not.toContain('Save all');
  });

  // When any Document opted into a mapping, a distinct mappings bundle and the
  // re-identification warning appear; the redacted-outputs section is unchanged.
  it('offers a separate mappings bundle with the re-identification warning', () => {
    const html = render([
      output('a.redacted.txt', 'a.redactyl-mapping.json'),
      output('b.redacted.txt'),
    ]);
    expect(html).toContain('a.redactyl-mapping.json');
    expect(html).toContain('Save all mappings');
    expect(html).toContain('reverse the redaction');
  });

  // Edge case: succeeded and failed are visibly separated; failures show reasons
  // but never a save. An all-failed Batch offers no download at all.
  it('separates failures and offers no download when everything failed', () => {
    const allFailed = render(
      [],
      [
        { filename: 'locked.pdf', reason: 'This PDF is password-protected.' },
        { filename: 'broken.pdf', reason: 'Redaction could not be verified.' },
      ],
    );
    expect(allFailed).toContain('locked.pdf');
    expect(allFailed).toContain('This PDF is password-protected.');
    expect(allFailed).toContain('Couldn’t redact (2)');
    // Nothing to save when no output succeeded.
    expect(allFailed).not.toContain('↓ save');
    expect(allFailed).not.toContain('Save all');
  });
});
