import { env, pipeline, type TokenClassificationPipeline } from '@huggingface/transformers';
import type { ScoredSpan } from './merge';
import { ProgressTracker, type LoadProgress } from './loadProgress';
import { nerSpansFrom, type NerToken } from './nerSpans';
import { chunkText } from './chunk';

// The NER layer: openai/privacy-filter run client-side via transformers.js v4.
// Lives only inside the detection worker. Weights are fetched from the HF CDN on
// first download and cached in browser storage (Cache name `transformers-cache`).
const MODEL_ID = 'openai/privacy-filter';

// Always resolve the model from the network/cache, never a bundled local copy.
env.allowLocalModels = false;

let pipe: TokenClassificationPipeline | null = null;
let loading: Promise<TokenClassificationPipeline> | null = null;

interface RawProgress {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
}

async function build(
  device: 'webgpu' | 'wasm',
  onProgress?: (p: LoadProgress) => void,
): Promise<TokenClassificationPipeline> {
  // Fresh per build() — a retry or WebGPU→WASM fallback starts a clean tally.
  const tracker = new ProgressTracker();
  return pipeline('token-classification', MODEL_ID, {
    // q4f16 is the smallest variant of this model (~772 MB vs ~875 MB for q4).
    dtype: 'q4f16',
    device,
    progress_callback: (info: unknown) => {
      const p = info as RawProgress;
      // Per-file events (initiate/download announce a file at 0 bytes; progress
      // streams loaded/total). Aggregate across files so the bar/filename don't
      // thrash between the several small files fetched at the start. The library
      // also emits a `progress_total`, which we skip to avoid double-counting.
      if (!p.file) return;
      if (p.status === 'progress' || p.status === 'initiate' || p.status === 'download') {
        const agg = tracker.update(p.file, p.loaded ?? 0, p.total ?? 0);
        // Report one friendly, stable label for the whole download (the model id)
        // rather than the individual filenames, which flicker as the several
        // small files stream in. The tracker still keys bytes by real filename.
        onProgress?.({ file: MODEL_ID, loaded: agg.loaded, total: agg.total });
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
// cached return visit doesn't miss NER on the first analyze. `onProgress` fires
// after each chunk (processed/total) so the UI can show real progress.
export async function detectNer(
  text: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<ScoredSpan[]> {
  if (!pipe && !loading) return [];
  if (!pipe) pipe = await loading!;

  const chunks = chunkText(text);
  const started = performance.now();
  console.debug(`[redactyl] NER: ${text.length} chars → ${chunks.length} chunk(s)`);

  const spans: ScoredSpan[] = [];
  for (let c = 0; c < chunks.length; c++) {
    const { text: chunk, offset } = chunks[c];
    const t0 = performance.now();
    const output = (await pipe(chunk, { aggregation_strategy: 'simple' })) as NerToken[];
    // Chunk-relative offsets → absolute offsets in the source text.
    for (const span of nerSpansFrom(output, chunk)) {
      spans.push({ ...span, start: span.start + offset, end: span.end + offset });
    }
    console.debug(
      `[redactyl] NER chunk ${c + 1}/${chunks.length} (${chunk.length} chars) → ` +
        `${spans.length} spans so far, ${Math.round(performance.now() - t0)}ms`,
    );
    onProgress?.(c + 1, chunks.length);
  }

  console.debug(
    `[redactyl] NER done: ${spans.length} spans in ${Math.round(performance.now() - started)}ms`,
  );
  return spans;
}
