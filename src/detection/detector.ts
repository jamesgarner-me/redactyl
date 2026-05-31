import type { Item } from '../domain/types';
import type { ModelClient, ModelProgress } from '../model/modelGate';
import type { CustomPattern } from './patterns';

// Worker → main messages.
type Outgoing =
  | { type: 'items'; id: number; items: Item[] }
  | { type: 'detect-progress'; id: number; processed: number; total: number }
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'cleared' };

// The single externally-callable detection surface. Hides the worker boundary
// behind a promise; both detection layers live inside the worker.
export interface Detector {
  detect(
    text: string,
    opts?: {
      customPatterns?: CustomPattern[];
      regex?: boolean;
      onProgress?: (processed: number, total: number) => void;
    },
  ): Promise<Item[]>;
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
  const pending = new Map<number, (items: Item[]) => void>();
  const progressCbs = new Map<number, (processed: number, total: number) => void>();
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
        case 'items': {
          const resolve = pending.get(msg.id);
          if (resolve) {
            pending.delete(msg.id);
            progressCbs.delete(msg.id);
            resolve(msg.items);
          }
          break;
        }
        case 'detect-progress':
          progressCbs.get(msg.id)?.(msg.processed, msg.total);
          break;
        case 'progress':
          if (activeLoad) armStall(); // progress means it's alive — restart the clock
          activeLoad?.onProgress({ file: msg.file, loaded: msg.loaded, total: msg.total });
          break;
        case 'ready': {
          disarmStall();
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
          disarmStall();
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

  // A stalled load (e.g. a stale cache handing the ONNX runtime an HTML document
  // where it expects a .wasm module) hangs the worker silently — no progress, no
  // error. Watch for progress and, if none arrives for STALL_MS, tear the worker
  // down (as Cancel does) and surface an actionable error so the gate shows
  // "clear the cache and retry" rather than an endless spinner.
  const STALL_MS = 30_000;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  function disarmStall() {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  // Replace the worker to truly stop an in-flight (or hung) load — transformers.js
  // can't abort its own fetch. Shared by Cancel and the stall watchdog.
  function replaceWorker() {
    worker.terminate();
    pending.clear();
    progressCbs.clear();
    worker = spawn();
    wire(worker);
  }

  function armStall() {
    disarmStall();
    stallTimer = setTimeout(() => {
      const load = activeLoad;
      if (!load) return;
      activeLoad = null;
      replaceWorker();
      load.reject(
        new Error('Model load stalled. This is usually a stale cache — clear the cache and retry.'),
      );
    }, STALL_MS);
  }

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
            disarmStall();
            replaceWorker();
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
        armStall();
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
    detect(text, opts) {
      const id = nextId++;
      return new Promise<Item[]>((resolve) => {
        pending.set(id, resolve);
        if (opts?.onProgress) progressCbs.set(id, opts.onProgress);
        // RegExp is structured-cloneable, so customPatterns cross the boundary.
        worker.postMessage({
          type: 'detect',
          id,
          text,
          customPatterns: opts?.customPatterns,
          regex: opts?.regex ?? false,
        });
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
