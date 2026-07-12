import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { unattendedAction } from './unattended';

// The unattended decision is the safety-critical branch of Auto-redact (ADR
// 0006): with no human in the loop, this pure function alone decides whether a
// Document is redacted, skipped, or quarantined — so it's exercised directly.
function personItem(value: string): Item {
  return {
    value,
    category: 'PERSON',
    spans: [{ start: 0, end: value.length, category: 'PERSON', value }],
  };
}

describe('unattendedAction', () => {
  // Core behaviour: a Document with detected Items and no safety problem is
  // redacted unattended.
  it('redacts when Items were detected and the Document is safe', () => {
    expect(unattendedAction([personItem('John Smith')])).toBe('redact');
  });

  // Edge case: a Document that can't be safely sanitised must never be
  // auto-redacted — it's quarantined as a Batch failure regardless of any Items.
  it('quarantines an unsafe Document even when Items were detected', () => {
    expect(unattendedAction([personItem('John Smith')], 'This PDF is a scanned image')).toBe(
      'quarantine',
    );
  });

  // Edge case: a clean Document produces no output, so it is skipped rather than
  // redacted (matching the attended flow's "no personal data" end state).
  it('skips a clean Document with no detected Items', () => {
    expect(unattendedAction([])).toBe('skip');
  });
});
