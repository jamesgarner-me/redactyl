import type { Item } from '../domain/types';

// What an unattended (Auto-redact) Batch should do with a Document once it has
// been detected, with no human to review it. Kept pure and React-free so the
// orchestration branch in App is unit-testable — see ADR 0006.
//
// - `quarantine`: the Document can't be safely sanitised (a `safetyWarning` PDF).
//   Recorded as a Batch failure and listed on the receipt; never auto-redacted.
// - `skip`: nothing was detected, so — as in the attended flow — the Document
//   produces no output and is simply absent from the receipt.
// - `redact`: accept every detected Item and redact (mapping off), mirroring the
//   review screen's defaults exactly.
export type UnattendedAction = 'quarantine' | 'skip' | 'redact';

export function unattendedAction(items: Item[], safetyWarning?: string): UnattendedAction {
  if (safetyWarning) return 'quarantine';
  if (items.length === 0) return 'skip';
  return 'redact';
}
