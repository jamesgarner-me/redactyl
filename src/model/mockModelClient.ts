import type { ModelClient, ModelProgress } from './modelGate';

// Stand-in for the transformers.js client until slice 7. It simulates a
// multi-file 770 MB download with byte-level progress, honours cancellation via
// the AbortSignal, and records "cached" in localStorage so the probe can skip
// the gate on return visits. `?modelfail` makes the first attempt fail (then
// succeed on retry) so the error/retry UX can be reviewed.
const CACHE_KEY = 'redactyl-model-cached';

const FILES: ReadonlyArray<{ file: string; total: number }> = [
  { file: 'config.json', total: 1_400 },
  { file: 'tokenizer.json', total: 2_300_000 },
  { file: 'onnx/model_quantized.onnx', total: 767_700_000 },
];

const STEPS_PER_FILE = 12;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function failOnceEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('modelfail');
  } catch {
    return false;
  }
}

export function createMockModelClient(): ModelClient {
  let attempts = 0;

  return {
    async probe() {
      try {
        return localStorage.getItem(CACHE_KEY) === '1';
      } catch {
        return false;
      }
    },

    async download({ onProgress, signal }: { onProgress: (p: ModelProgress) => void; signal: AbortSignal }) {
      attempts += 1;
      const failThisRun = failOnceEnabled() && attempts === 1;

      for (const { file, total } of FILES) {
        for (let step = 1; step <= STEPS_PER_FILE; step++) {
          await delay(110, signal); // throws AbortError if cancelled
          const loaded = Math.round((total * step) / STEPS_PER_FILE);
          onProgress({ file, loaded, total });
          // Simulate a mid-download network drop on the largest file.
          if (failThisRun && file === 'onnx/model_quantized.onnx' && step === 4) {
            throw new Error('network: connection lost during download');
          }
        }
      }

      try {
        localStorage.setItem(CACHE_KEY, '1');
      } catch {
        /* best effort */
      }
    },

    async clear() {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* best effort */
      }
    },
  };
}
