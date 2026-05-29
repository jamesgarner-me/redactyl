import { describe, expect, it } from 'vitest';
import { buildMapping, mappingName } from './mappingExporter';
import { assignTokens } from './tokeniser';
import { runDetectors } from '../detection/patterns';

describe('buildMapping', () => {
  it('matches the documented shape: version, createdAt, originalFilename, tokens', () => {
    const entries = [
      { token: '<EMAIL_1>', category: 'EMAIL' as const, value: 'alice@example.com' },
      { token: '<PERSON_1>', category: 'PERSON' as const, value: 'Alice Smith' },
    ];
    const mapping = buildMapping(entries, 'contract.pdf', new Date('2026-05-28T11:23:45.000Z'));
    expect(mapping).toEqual({
      version: 1,
      createdAt: '2026-05-28T11:23:45Z',
      originalFilename: 'contract.pdf',
      tokens: {
        '<EMAIL_1>': { category: 'EMAIL', value: 'alice@example.com' },
        '<PERSON_1>': { category: 'PERSON', value: 'Alice Smith' },
      },
    });
  });

  it('records Token -> { category, value } only — no positions/offsets/bboxes', () => {
    const text = 'mail alice@example.com and bob@example.org';
    const tokens = assignTokens(runDetectors(text));
    const mapping = buildMapping(tokens.entries, 'notes.txt');
    for (const entry of Object.values(mapping.tokens)) {
      expect(Object.keys(entry).sort()).toEqual(['category', 'value']);
      expect(entry).not.toHaveProperty('start');
      expect(entry).not.toHaveProperty('end');
      expect(entry).not.toHaveProperty('page');
      expect(entry).not.toHaveProperty('bbox');
    }
  });

  it('strips milliseconds from createdAt', () => {
    const mapping = buildMapping([], 'x.txt', new Date('2026-01-02T03:04:05.678Z'));
    expect(mapping.createdAt).toBe('2026-01-02T03:04:05Z');
  });
});

describe('mappingName', () => {
  it('replaces the extension with .redactyl-mapping.json', () => {
    expect(mappingName('contract.pdf')).toBe('contract.redactyl-mapping.json');
    expect(mappingName('notes.txt')).toBe('notes.redactyl-mapping.json');
  });

  it('appends to an extension-less name', () => {
    expect(mappingName('README')).toBe('README.redactyl-mapping.json');
  });
});
