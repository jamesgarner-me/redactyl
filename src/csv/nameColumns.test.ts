import { describe, expect, it } from 'vitest';
import { isNameHeader } from './nameColumns';

describe('isNameHeader', () => {
  // Core behaviour: the common ways a person-name column is titled, across the
  // casing/spacing/underscore variants real exports use.
  it('recognises person-name headings regardless of case, spacing or separators', () => {
    for (const header of [
      'Name',
      'name',
      'NAMES',
      'Full Name',
      'full_name',
      'fullName',
      'First Name',
      'last_name',
      'Surname',
      'Contact Name',
      'Customer Name',
      'Employee Name',
      'Cardholder Name',
    ]) {
      expect(isNameHeader(header)).toBe(true);
    }
  });

  // Edge case: "...name" compounds that are emphatically NOT people. The
  // allowlist (not a "contains name" rule) is what keeps these out, so they're
  // the headings most worth pinning down.
  it('does not mistake non-person "name" columns for people', () => {
    for (const header of [
      'filename',
      'File Name',
      'username',
      'User Name',
      'nickname',
      'company_name',
      'Company Name',
      'domain name',
      'product name',
      'field name',
      'host name',
    ]) {
      expect(isNameHeader(header)).toBe(false);
    }
  });

  // Edge case: empty / unrelated headers never match.
  it('returns false for empty or unrelated headers', () => {
    expect(isNameHeader('')).toBe(false);
    expect(isNameHeader('   ')).toBe(false);
    expect(isNameHeader('email')).toBe(false);
    expect(isNameHeader('phone')).toBe(false);
  });
});
