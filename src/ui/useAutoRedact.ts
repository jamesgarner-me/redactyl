import { useCallback, useState } from 'react';

export type AutoRedact = boolean;

const KEY = 'redactyl-auto-redact-v1';

// Auto-redact runs a whole Batch unattended: every detected Item is accepted and
// each Document is redacted with no review (see ADR 0006 / CONTEXT.md). Off by
// default — putting a human in front of every redaction is the safer stance, so
// this is an opt-in for users who don't want to click through each file. The
// value is snapshotted onto the Batch at creation, so a change here only affects
// the next Batch. Persisted so the choice survives reloads.
function storedAutoRedact(): AutoRedact {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return false;
}

export function useAutoRedact(): [AutoRedact, (value: AutoRedact) => void] {
  const [enabled, setEnabled] = useState<AutoRedact>(storedAutoRedact);

  // Persist only on an explicit toggle, not on mount — otherwise the default
  // gets written before the user has chosen, masking future default changes.
  const set = useCallback((value: AutoRedact) => {
    setEnabled(value);
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* persistence is best-effort */
    }
  }, []);

  return [enabled, set];
}
