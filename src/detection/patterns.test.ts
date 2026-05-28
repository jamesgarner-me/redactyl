import { describe, expect, it } from 'vitest';
import { runDetectors } from './patterns';
import type { Category } from '../domain/types';

function valuesOf(text: string, category: Category): string[] {
  return runDetectors(text)
    .filter((span) => span.category === category)
    .map((span) => span.value);
}

describe('EMAIL', () => {
  it('matches a plain email and reports its span', () => {
    const text = 'reach me at alice@example.com please';
    const spans = runDetectors(text);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ category: 'EMAIL', value: 'alice@example.com' });
    expect(text.slice(spans[0].start, spans[0].end)).toBe('alice@example.com');
  });

  it('finds multiple emails in document order, with spans that slice back to the value', () => {
    const text = 'b@x.com early? no, a@x.com is first... wait b@x.com';
    const spans = runDetectors(text);
    expect(spans.map((s) => s.value)).toEqual(['b@x.com', 'a@x.com', 'b@x.com']);
    for (const s of spans) {
      expect(text.slice(s.start, s.end)).toBe(s.value);
    }
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b));
  });

  it('rejects strings that are not emails', () => {
    expect(runDetectors('no address here: not.an.email, @nope, foo@')).toHaveLength(0);
  });
});

describe('PHONE', () => {
  it('matches common formatted phone numbers', () => {
    expect(valuesOf('call (415) 555-2671 now', 'PHONE')).toEqual(['(415) 555-2671']);
    expect(valuesOf('call +1 415 555 2671 now', 'PHONE')).toEqual(['+1 415 555 2671']);
    expect(valuesOf('call 415-555-2671 now', 'PHONE')).toEqual(['415-555-2671']);
    expect(valuesOf('call +14155552671 now', 'PHONE')).toEqual(['+14155552671']);
  });

  it('does not match an unformatted short number or prose', () => {
    expect(valuesOf('order 12345 shipped', 'PHONE')).toEqual([]);
  });
});

describe('URL', () => {
  it('matches http and https URLs', () => {
    expect(valuesOf('see https://example.com/path?q=1 today', 'URL')).toEqual([
      'https://example.com/path?q=1',
    ]);
    expect(valuesOf('http://foo.bar links', 'URL')).toEqual(['http://foo.bar']);
  });

  it('ignores a bare domain with no scheme', () => {
    expect(valuesOf('visit example.com soon', 'URL')).toEqual([]);
  });
});

describe('IP', () => {
  it('matches valid IPv4 addresses', () => {
    expect(valuesOf('host 192.168.0.1 and 255.255.255.255', 'IP')).toEqual([
      '192.168.0.1',
      '255.255.255.255',
    ]);
  });

  it('rejects out-of-range octets', () => {
    expect(valuesOf('not 999.999.999.999 valid', 'IP')).toEqual([]);
  });
});

describe('DATE', () => {
  it('matches numeric and textual dates', () => {
    expect(valuesOf('due 2026-01-31 sharp', 'DATE')).toEqual(['2026-01-31']);
    expect(valuesOf('due 1/31/2026 sharp', 'DATE')).toEqual(['1/31/2026']);
    expect(valuesOf('due Jan 31, 2026 sharp', 'DATE')).toEqual(['Jan 31, 2026']);
  });
});

describe('SSN', () => {
  it('matches a dashed SSN', () => {
    expect(valuesOf('ssn 123-45-6789 on file', 'SSN')).toEqual(['123-45-6789']);
  });
});

describe('CREDIT_CARD', () => {
  it('matches a Luhn-valid card, with or without separators', () => {
    expect(valuesOf('card 4111111111111111 ok', 'CREDIT_CARD')).toEqual(['4111111111111111']);
    expect(valuesOf('card 4111 1111 1111 1111 ok', 'CREDIT_CARD')).toEqual([
      '4111 1111 1111 1111',
    ]);
  });

  it('rejects a number that fails Luhn', () => {
    expect(valuesOf('card 4111111111111112 nope', 'CREDIT_CARD')).toEqual([]);
  });
});

describe('IBAN', () => {
  it('matches a mod-97-valid IBAN, compact or spaced', () => {
    expect(valuesOf('iban GB82WEST12345698765432 ok', 'IBAN')).toEqual([
      'GB82WEST12345698765432',
    ]);
    expect(valuesOf('iban GB82 WEST 1234 5698 7654 32 ok', 'IBAN')).toEqual([
      'GB82 WEST 1234 5698 7654 32',
    ]);
  });

  it('rejects an IBAN with a bad checksum', () => {
    expect(valuesOf('iban GB99WEST12345698765432 no', 'IBAN')).toEqual([]);
  });
});

describe('SECRET', () => {
  const cases: Record<string, string> = {
    aws: 'AKIAIOSFODNN7EXAMPLE',
    openai: 'sk-abcdefghijklmnopqrstuvwx',
    anthropic: 'sk-ant-api03-abcdefghijklmnopqrstuv',
    stripe: 'sk_live_abcdefghijklmnop1234',
    bearer: 'Bearer abc.def-ghi_jkl',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
  };

  for (const [name, value] of Object.entries(cases)) {
    it(`detects a ${name} credential as SECRET`, () => {
      expect(valuesOf(`secret here ${value} end`, 'SECRET')).toContain(value);
    });
  }

  it('detects a PEM block as SECRET', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIBVwIBADANBgkqhkiG\n-----END PRIVATE KEY-----';
    expect(valuesOf(`key:\n${pem}\nthanks`, 'SECRET')).toContain(pem);
  });
});

describe('customPatterns', () => {
  it('applies a user-supplied pattern', () => {
    const spans = runDetectors('ACME-1234 and ACME-5678', [
      { category: 'ACCOUNT_NUMBER', pattern: /ACME-\d+/g },
    ]);
    const accounts = spans.filter((s) => s.category === 'ACCOUNT_NUMBER').map((s) => s.value);
    expect(accounts).toEqual(['ACME-1234', 'ACME-5678']);
  });

  it('lets a custom pattern win an overlap against a built-in', () => {
    // The custom pattern covers the whole token incl. the embedded email.
    const spans = runDetectors('id user@corp.com here', [
      { category: 'ACCOUNT_NUMBER', pattern: /user@corp\.com/g },
    ]);
    expect(spans.map((s) => s.category)).toEqual(['ACCOUNT_NUMBER']);
  });
});
