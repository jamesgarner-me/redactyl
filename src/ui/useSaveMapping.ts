import { useCallback, useState } from 'react';

export type SaveMapping = boolean;

const KEY = 'redactyl-save-mapping-v1';

// Whether every successful Redact also writes a re-identification Mapping
// sidecar. A global, persisted preference (Settings → Output) — off by default
// because the mapping can reverse a redaction, so opting in is deliberate. Read
// at each Redact run; applies to all Document kinds (PDF included). See
// CONTEXT.md and ADR 0005.
function storedSaveMapping(): SaveMapping {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return false;
}

export function useSaveMapping(): [SaveMapping, (value: SaveMapping) => void] {
  const [enabled, setEnabled] = useState<SaveMapping>(storedSaveMapping);

  const set = useCallback((value: SaveMapping) => {
    setEnabled(value);
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* persistence is best-effort */
    }
  }, []);

  return [enabled, set];
}
