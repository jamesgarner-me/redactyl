// Lenient, gated intake — see ADR 0005 and slice 05. A drop/selection is
// assessed up front: supported, in-cap files become the Batch; unsupported and
// over-cap files are gathered into one skip list the user is warned about before
// any processing begins. Pure logic, unit-tested without React.

// The kinds Redactyl can open. Kept here as the single source of truth so the
// dropzone and intake agree on what "supported" means.
export const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md', '.csv'] as const;

// Soft cap on Documents per Batch. A tunable default — supported files beyond
// this are treated as skipped (listed in the same warning as unsupported ones).
export const DEFAULT_FILE_CAP = 10;

// Why a file was left out, so the warning can group them under one message while
// still distinguishing the cause if we ever want to.
export type SkipReason = 'unsupported' | 'over-cap';

export interface SkippedFile {
  filename: string;
  reason: SkipReason;
}

export interface IntakeAssessment {
  // Supported files within the cap — the files the Batch will actually process.
  accepted: File[];
  // Unsupported files plus supported files beyond the cap, in original order.
  skipped: SkippedFile[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function isSupported(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

// Partition a drop/selection into the files to process and the files to warn
// about. Unsupported files are skipped regardless of position; supported files
// past the cap are skipped as 'over-cap'. Order is preserved within each bucket.
export function assessIntake(files: readonly File[], cap = DEFAULT_FILE_CAP): IntakeAssessment {
  const accepted: File[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    if (!isSupported(file.name)) {
      skipped.push({ filename: file.name, reason: 'unsupported' });
    } else if (accepted.length < cap) {
      accepted.push(file);
    } else {
      skipped.push({ filename: file.name, reason: 'over-cap' });
    }
  }
  return { accepted, skipped };
}
