import { describe, expect, it } from 'vitest';
import { applyMapping, redact } from './textRedactor';
import { assignTokens } from './tokeniser';
import { runDetectors } from '../detection/patterns';

function mappingFromTokens(tokens: ReturnType<typeof assignTokens>): Record<string, string> {
  return Object.fromEntries(tokens.entries.map((e) => [e.token, e.value]));
}

describe('redact', () => {
  it('replaces each occurrence with its token', () => {
    const text = 'mail a@x.com and b@x.com then a@x.com again';
    const spans = runDetectors(text);
    const tokens = assignTokens(spans);
    expect(redact(text, spans, tokens)).toBe(
      'mail <EMAIL_1> and <EMAIL_2> then <EMAIL_1> again',
    );
  });

  it('handles adjacent and end-of-string spans (right-to-left offsets)', () => {
    const text = 'a@x.com b@x.com';
    const spans = runDetectors(text);
    const tokens = assignTokens(spans);
    expect(redact(text, spans, tokens)).toBe('<EMAIL_1> <EMAIL_2>');
  });

  it('round-trips: applyMapping(redact(text)) === text', () => {
    const text = 'Contact alice@example.com, bob@example.org, or alice@example.com.';
    const spans = runDetectors(text);
    const tokens = assignTokens(spans);
    const redacted = redact(text, spans, tokens);
    expect(applyMapping(redacted, mappingFromTokens(tokens))).toBe(text);
  });
});

describe('applyMapping', () => {
  it('replaces longer tokens first so prefixes do not collide', () => {
    const mapping = { '<EMAIL_1>': 'a@x.com', '<EMAIL_11>': 'k@x.com' };
    expect(applyMapping('<EMAIL_11> and <EMAIL_1>', mapping)).toBe('k@x.com and a@x.com');
  });
});
