import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  initialModelState,
  modelGateReducer,
  type ModelClient,
  type ModelState,
} from './modelGate';
import { isMobilePlatform } from './platform';

export interface ModelGate {
  state: ModelState;
  startDownload: () => void;
  retry: () => void;
  cancel: () => void;
  clearCache: () => Promise<void>;
}

// Network/disk failures surface as a clear, actionable line; anything else
// falls back to the raw message.
function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/network|fetch|connection|offline/i.test(raw)) {
    return 'Network error. Check your connection and retry.';
  }
  if (/quota|disk|storage|space/i.test(raw)) {
    return 'Not enough storage to cache the 770 MB model. Free up disk space and retry.';
  }
  return raw || 'Download failed, please retry.';
}

export function useModelGate(client: ModelClient): ModelGate {
  const [state, dispatch] = useReducer(modelGateReducer, initialModelState);
  const abortRef = useRef<AbortController | null>(null);

  // Cache probe on mount → ready (cached) or missing (first visit).
  // Pre-flight: the WASM threading model needs SharedArrayBuffer, which the
  // browser only grants under cross-origin isolation (our COOP/COEP headers).
  // Absent it, fail fast to the unsupported gate rather than a confusing
  // mid-inference crash — covers browsers too old for cross-origin isolation.
  useEffect(() => {
    // Phones/tablets can't fit the 770 MB model in memory — gate them out before
    // any download so they don't hit the iOS crash-and-re-download loop. See
    // `isMobilePlatform`. Checked first as it's the more specific advisory.
    if (isMobilePlatform()) {
      dispatch({ type: 'probe_unsupported', reason: 'platform' });
      return;
    }
    if (typeof SharedArrayBuffer === 'undefined') {
      dispatch({ type: 'probe_unsupported', reason: 'browser' });
      return;
    }
    let active = true;
    client
      .probe()
      .then((hit) => active && dispatch({ type: hit ? 'probe_hit' : 'probe_miss' }))
      .catch(() => active && dispatch({ type: 'probe_miss' }));
    return () => {
      active = false;
    };
  }, [client]);

  const startDownload = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'download_start' });
    client
      .download({
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'progress', progress }),
      })
      .then(() => {
        if (!controller.signal.aborted) dispatch({ type: 'download_success' });
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // cancellation handled by `cancel`
        dispatch({ type: 'download_error', message: describeError(err) });
      });
  }, [client]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'cancel' });
  }, []);

  const clearCache = useCallback(async () => {
    await client.clear();
    dispatch({ type: 'clear' });
  }, [client]);

  // Warn before leaving only while a download is in flight (it would restart).
  useEffect(() => {
    if (state.name !== 'downloading') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.name]);

  return { state, startDownload, retry: startDownload, cancel, clearCache };
}
