// The consent-first gate for the 770 MB PII detection model. This module is the
// pure state machine; effects (probe, download, cancel, clear) live in the
// useModelGate hook, and the actual transformers.js download arrives in slice 7
// behind the ModelClient interface. See the PRD's "Model gate" screen.

export interface ModelProgress {
  // A friendly label for what's downloading (the model id), held stable across
  // all of the model's files so the UI doesn't flicker between filenames.
  file: string;
  loaded: number;
  total: number;
}

export type ModelState =
  | { name: 'probing' } // checking IndexedDB cache on load
  | { name: 'missing' } // first visit — the quiet card
  | { name: 'unsupported' } // browser lacks SharedArrayBuffer (Safari < 17.4)
  | { name: 'downloading'; progress: ModelProgress | null }
  | { name: 'ready' }
  | { name: 'error'; message: string };

export type ModelEvent =
  | { type: 'probe_hit' } // cache probe found the model
  | { type: 'probe_miss' } // no cached model
  | { type: 'probe_unsupported' } // browser lacks SharedArrayBuffer — terminal
  | { type: 'download_start' } // begin (or re-)download / retry
  | { type: 'progress'; progress: ModelProgress }
  | { type: 'download_success' }
  | { type: 'download_error'; message: string }
  | { type: 'cancel' }
  | { type: 'clear' }; // Clear cache → back to the gate

// The download mechanism, abstracted so the gate UX can be built and tested
// without transformers.js (slice 7 supplies the real implementation).
export interface ModelClient {
  probe(): Promise<boolean>;
  download(opts: {
    onProgress: (progress: ModelProgress) => void;
    signal: AbortSignal;
  }): Promise<void>;
  clear(): Promise<void>;
}

export const initialModelState: ModelState = { name: 'probing' };

export function modelGateReducer(state: ModelState, event: ModelEvent): ModelState {
  switch (event.type) {
    case 'probe_hit':
      return state.name === 'probing' ? { name: 'ready' } : state;
    case 'probe_miss':
      return state.name === 'probing' ? { name: 'missing' } : state;
    case 'probe_unsupported':
      return state.name === 'probing' ? { name: 'unsupported' } : state;
    case 'download_start':
      // From the gate (missing / error retry) or a Re-download while ready.
      return state.name === 'missing' || state.name === 'error' || state.name === 'ready'
        ? { name: 'downloading', progress: null }
        : state;
    case 'progress':
      return state.name === 'downloading'
        ? { name: 'downloading', progress: event.progress }
        : state;
    case 'download_success':
      return state.name === 'downloading' ? { name: 'ready' } : state;
    case 'download_error':
      return state.name === 'downloading' ? { name: 'error', message: event.message } : state;
    case 'cancel':
      return state.name === 'downloading' ? { name: 'missing' } : state;
    case 'clear':
      return { name: 'missing' };
  }
}
