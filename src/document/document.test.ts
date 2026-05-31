import { describe, expect, it } from 'vitest';
import { redactedName } from './document';

describe('redactedName', () => {
  it('inserts .redacted before the extension', () => {
    expect(redactedName('notes.txt')).toBe('notes.redacted.txt');
    expect(redactedName('report.pdf')).toBe('report.redacted.pdf');
  });

  it('appends .redacted when there is no extension', () => {
    expect(redactedName('README')).toBe('README.redacted');
  });

  it('splits on the last dot for multi-dot names', () => {
    expect(redactedName('a.b.txt')).toBe('a.b.redacted.txt');
  });
});
