import { describe, expect, it } from 'vitest';
import { bucketFor, isMasked, maskHint } from './buckets';

describe('bucketFor', () => {
  it('rolls the four identifier Categories into ID', () => {
    for (const c of ['SSN', 'CREDIT_CARD', 'IBAN', 'ACCOUNT_NUMBER'] as const) {
      expect(bucketFor(c)).toBe('ID');
    }
  });

  it('rolls URL and IP into NETWORK', () => {
    expect(bucketFor('URL')).toBe('NETWORK');
    expect(bucketFor('IP')).toBe('NETWORK');
  });

  it('maps every other Category 1:1 to its own name', () => {
    for (const c of ['EMAIL', 'PHONE', 'DATE', 'SECRET', 'PERSON', 'ADDRESS'] as const) {
      expect(bucketFor(c)).toBe(c);
    }
  });
});

describe('isMasked', () => {
  it('masks SECRET and every ID-Bucket Category', () => {
    expect(isMasked('SECRET')).toBe(true);
    expect(isMasked('SSN')).toBe(true);
    expect(isMasked('CREDIT_CARD')).toBe(true);
  });

  it('shows other Categories in clear', () => {
    expect(isMasked('EMAIL')).toBe(false);
    expect(isMasked('URL')).toBe(false);
    expect(isMasked('PERSON')).toBe(false);
  });
});

describe('maskHint', () => {
  it('keeps the last 4 characters and bullets the rest', () => {
    expect(maskHint('123456789')).toBe('•••••6789');
  });

  it('caps the run of bullets for long values', () => {
    expect(maskHint('4111111111111111')).toBe('••••••••1111');
  });

  it('leaves a short value as-is (nothing to hide)', () => {
    expect(maskHint('1234')).toBe('1234');
  });
});
