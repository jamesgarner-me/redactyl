import { env, pipeline, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { ScoredSpan } from './merge';
import { nerSpansFrom, type NerToken } from './nerSpans';

// The NER layer: openai/privacy-filter run client-side via transformers.js v4.
// Lives only inside the detection worker. Weights are fetched from the HF CDN on
// first download and cached in browser storage (Cache name `transformers-cache`).
const MODEL_ID = 'openai/privacy-filter';

// Always resolve the model from the network/cache, never a bundled local copy.
env.allowLocalModels = false;

export interface LoadProgress {
  file: string;
  loaded: number;
  total: number;
}

let pipe: TokenClassificationPipeline | null = null;
let loading: Promise<TokenClassificationPipeline> | null = null;

async function build(
  device: 'webgpu' | 'wasm',
  onProgress?: (p: LoadProgress) => void,
): Promise<TokenClassificationPipeline> {
  return pipeline('token-classification', MODEL_ID, {
    dtype: 'q4',
    device,
    progress_callback: (info: unknown) => {
      const p = info as Partial<LoadProgress> & { status?: string };
      if (p.status === 'progress' && p.file != null && p.total != null) {
        onProgress?.({ file: p.file, loaded: p.loaded ?? 0, total: p.total });
      }
    },
  });
}

// Probe for a *usable* WebGPU adapter, not merely `navigator.gpu`. Headless or
// GPU-less environments expose `navigator.gpu` but `requestAdapter()` resolves
// null (or hangs) — so we await an adapter and treat absence/timeout as "no
// WebGPU", which avoids hanging the model load.
async function hasWorkingWebGPU(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    return adapter != null;
  } catch {
    return false;
  }
}

// Idempotent. Uses WebGPU when a real adapter is available, else WASM. A failed
// WebGPU attempt leaves fetched weights cached, so the fallback won't re-download.
export async function loadNerPipeline(onProgress?: (p: LoadProgress) => void): Promise<void> {
  if (pipe) return;
  if (!loading) {
    loading = (async () => {
      if (await hasWorkingWebGPU()) {
        try {
          return await build('webgpu', onProgress);
        } catch {
          /* fall back to WASM below */
        }
      }
      return build('wasm', onProgress);
    })();
  }
  pipe = await loading;
}

export function clearNerPipeline(): void {
  pipe = null;
  loading = null;
}

// Runs NER if the model has been (or is being) loaded; otherwise returns nothing
// so the caller falls back to regex-only. Awaits an in-flight warm-load so a
// cached return visit doesn't miss NER on the first analyze.
export async function detectNer(text: string): Promise<ScoredSpan[]> {
  if (!pipe && !loading) return [];
  if (!pipe) pipe = await loading!;
  const output = (await pipe(text, { aggregation_strategy: 'simple' })) as NerToken[];
  return nerSpansFrom(output, text);
}
