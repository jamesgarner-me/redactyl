import type { Span } from '../domain/types';
import type { ModelClient, ModelProgress } from '../model/modelGate';
import type { CustomPattern } from './patterns';

// Worker → main messages.
type Outgoing =
  | { type: 'spans'; id: number; spans: Span[] }
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'cleared' };

// The single externally-callable detection surface. Hides the worker boundary
// behind a promise; both detection layers live inside the worker.
export interface Detector {
  detect(text: string, customPatterns?: CustomPattern[]): Promise<Span[]>;
}

// One worker owns the model, shared by the gate client (download/probe/clear)
// and the detector (inference) so the loaded pipeline is reused.
export interface ModelWorker {
  detector: Detector;
  client: ModelClient;
  terminate(): void;
}

// We track "downloaded" ourselves (consistent with slice 6) rather than probing
// transformers.js internals; `clear()` wipes the real cache so they can't desync.
const CACHE_FLAG = 'redactyl-model-cached';

function cached(): boolean {
  try {
    return localStorage.getItem(CACHE_FLAG) === '1';
  } catch {
    return false;
  }
}

export function createModelWorker(): ModelWorker {
  let worker = spawn();
  let nextId = 0;
  const pending = new Map<number, (spans: Span[]) => void>();
  let activeLoad: {
    onProgress: (p: ModelProgress) => void;
    resolve: () => void;
    reject: (err: unknown) => void;
  } | null = null;
  let onCleared: (() => void) | null = null;

  function spawn(): Worker {
    return new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
  }

  function wire(w: Worker) {
    w.onmessage = (event: MessageEvent<Outgoing>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'spans': {
          const resolve = pending.get(msg.id);
          if (resolve) {
            pending.delete(msg.id);
            resolve(msg.spans);
          }
          break;
        }
        case 'progress':
          activeLoad?.onProgress({ file: msg.file, loaded: msg.loaded, total: msg.total });
          break;
        case 'ready': {
          try {
            localStorage.setItem(CACHE_FLAG, '1');
          } catch {
            /* best effort */
          }
          const load = activeLoad;
          activeLoad = null;
          load?.resolve();
          break;
        }
        case 'error': {
          const load = activeLoad;
          activeLoad = null;
          load?.reject(new Error(msg.message));
          break;
        }
        case 'cleared': {
          const done = onCleared;
          onCleared = null;
          done?.();
          break;
        }
      }
    };
  }

  wire(worker);

  const client: ModelClient = {
    async probe() {
      const hit = cached();
      // Warm-load the pipeline from cache in the background so the first analyze
      // doesn't miss NER. Progress/ready are ignored (no active download).
      if (hit) worker.postMessage({ type: 'load' });
      return hit;
    },

    download({ onProgress, signal }) {
      return new Promise<void>((resolve, reject) => {
        activeLoad = { onProgress, resolve, reject };
        signal.addEventListener(
          'abort',
          () => {
            if (!activeLoad) return;
            activeLoad = null;
            // transformers.js can't abort an in-flight fetch, so replace the
            // worker to truly stop the download.
            worker.terminate();
            pending.clear();
            worker = spawn();
            wire(worker);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
        worker.postMessage({ type: 'load' });
      });
    },

    clear() {
      try {
        localStorage.removeItem(CACHE_FLAG);
      } catch {
        /* best effort */
      }
      return new Promise<void>((resolve) => {
        onCleared = resolve;
        worker.postMessage({ type: 'clear' });
      });
    },
  };

  const detector: Detector = {
    detect(text, customPatterns) {
      const id = nextId++;
      return new Promise<Span[]>((resolve) => {
        pending.set(id, resolve);
        // RegExp is structured-cloneable, so customPatterns cross the boundary.
        worker.postMessage({ type: 'detect', id, text, customPatterns });
      });
    },
  };

  return {
    detector,
    client,
    terminate() {
      worker.terminate();
    },
  };
}
