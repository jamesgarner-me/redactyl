// Aggregated model-download progress. transformers.js fetches several files
// (config, tokenizer, the ONNX graph, then the large external weights) and fires
// per-file progress events that interleave. Showing the most-recent file alone
// makes the bar and filename thrash, so we sum across all files seen into one
// monotonic figure. Pure + testable; no transformers.js import.
export interface LoadProgress {
  // The file whose event last advanced progress — shown for context.
  file: string;
  // Bytes summed across every file seen so far.
  loaded: number;
  total: number;
}

export class ProgressTracker {
  private readonly files = new Map<string, { loaded: number; total: number }>();

  // Record the latest bytes for one file (replacing its prior figure, not adding)
  // and return the aggregate across all files.
  update(file: string, loaded: number, total: number): LoadProgress {
    this.files.set(file, { loaded, total });
    let loadedSum = 0;
    let totalSum = 0;
    for (const entry of this.files.values()) {
      loadedSum += entry.loaded;
      totalSum += entry.total;
    }
    return { file, loaded: loadedSum, total: totalSum };
  }
}
