// The Batch — see CONTEXT.md and ADR 0005. A Batch is an orchestration layer
// over the single-Document pipeline: an ordered set of input files worked
// through one at a time (open → detect → review → redact), accumulating the
// redacted outputs (and, per slice 04, the files that failed). The Batch holds
// no Document state itself — App opens the active file on demand — so this
// module stays pure and is unit-tested without React.

// A succeeded redacted output, ready to save individually or bundle. Mirrors the
// successful RedactionOutcome the Document seam returns, minus the ok flag.
export interface BatchOutput {
  outputName: string;
  blob: Blob;
  // Optional re-identification sidecar (text/CSV only, on request). Bundled
  // separately from the redacted outputs — see slice 03.
  mapping?: { name: string; blob: Blob };
  // Pages flattened to images during PDF redaction; absent for text/CSV.
  rasterisedPages?: number[];
}

// A file that could not be opened or redacted. Quarantined out of the bundle;
// the receipt lists it with its reason — see slice 04.
export interface BatchFailure {
  filename: string;
  reason: string;
}

// The immutable Batch state. `activeIndex` points at the file currently being
// worked; it equals `files.length` once every file has resolved (the Batch is
// then complete). `outputs`/`failures` accumulate in completion order.
// `unattended` is the Auto-redact decision snapshotted at creation (ADR 0006);
// read once here so a mid-run settings change can't alter the in-flight Batch.
export interface Batch {
  readonly files: readonly File[];
  readonly activeIndex: number;
  readonly outputs: readonly BatchOutput[];
  readonly failures: readonly BatchFailure[];
  readonly unattended: boolean;
}

// Open a fresh Batch over the supported, in-cap files chosen at intake. The
// Auto-redact setting is snapshotted here (default attended) so it is read once
// at the start of the Batch and cannot drift as the loop runs.
export function createBatch(files: readonly File[], unattended = false): Batch {
  return { files: [...files], activeIndex: 0, outputs: [], failures: [], unattended };
}

// The file App should open and analyse next, or undefined when the Batch is done.
export function activeFile(batch: Batch): File | undefined {
  return batch.files[batch.activeIndex];
}

// True once every file has produced an output or a failure.
export function isComplete(batch: Batch): boolean {
  return batch.activeIndex >= batch.files.length;
}

// Record a redacted output for the active file and advance to the next one.
export function recordSuccess(batch: Batch, output: BatchOutput): Batch {
  return {
    ...batch,
    activeIndex: batch.activeIndex + 1,
    outputs: [...batch.outputs, output],
  };
}

// Mark the active file failed (open- or redact-time) and advance to the next
// one. The failed file never enters the output bundle, so skipping it — even a
// fail-closed PDF leak — leaks nothing. See ADR 0005.
export function recordFailure(batch: Batch, failure: BatchFailure): Batch {
  return {
    ...batch,
    activeIndex: batch.activeIndex + 1,
    failures: [...batch.failures, failure],
  };
}

// Advance past the active file without recording anything — the file was clean
// (no personal data detected), so it produces no output and is not a failure.
export function skipActive(batch: Batch): Batch {
  return { ...batch, activeIndex: batch.activeIndex + 1 };
}
