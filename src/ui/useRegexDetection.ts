import { useCallback, useState } from 'react';

export type RegexDetection = boolean;

// v2: the v1 key was auto-written with the default on mount, so it can't be
// distinguished from a deliberate choice. Starting a fresh key lets the new
// on-by-default take effect for everyone, and we now only persist explicit
// toggles (below) so the stored value always reflects an actual user choice.
const KEY = 'redactyl-regex-detection-v2';

// Regex pattern matching is a second detection layer alongside the NER model.
// On by default: the model alone misses patterned values (emails, phones, TFNs)
// embedded in prose, which regex reliably catches anywhere. This is an Advanced
// escape hatch we may drop later. Persisted so the choice survives reloads.
function storedRegexDetection(): RegexDetection {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return true;
}

export function useRegexDetection(): [RegexDetection, (value: RegexDetection) => void] {
  const [enabled, setEnabled] = useState<RegexDetection>(storedRegexDetection);

  // Persist only on an explicit toggle, not on mount — otherwise the default
  // gets written before the user has chosen, masking future default changes.
  const set = useCallback((value: RegexDetection) => {
    setEnabled(value);
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      /* persistence is best-effort */
    }
  }, []);

  return [enabled, set];
}
