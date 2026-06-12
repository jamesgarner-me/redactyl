import { useEffect } from 'react';
import type { SkippedFile } from '../batch/intake';

interface Props {
  // Files that will be processed if the user continues.
  acceptedCount: number;
  // Unsupported + over-cap files, listed under one "won't be included" message.
  skipped: SkippedFile[];
  onContinue: () => void;
  onCancel: () => void;
}

function reasonLabel(reason: SkippedFile['reason']): string {
  return reason === 'over-cap' ? 'over the 10-file limit' : 'unsupported type';
}

// The gated-intake warning — see ADR 0005 / slice 05. Shown only when a drop
// mixes processable files with files that must be skipped. Enumerates every
// skipped file under one message, with Continue (start the Batch with the
// in-cap, supported files) and Cancel (add nothing, back to the dropzone).
export function IntakeWarningModal({ acceptedCount, skipped, onContinue, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const plural = acceptedCount === 1 ? 'file' : 'files';

  return (
    <div className="sheet-backdrop intake-backdrop" onClick={onCancel}>
      <div
        className="intake-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Some files won't be included"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="intake-title">Some files won’t be included</h2>
        <p className="intake-lead">
          These {skipped.length === 1 ? 'file' : 'files'} won’t be redacted in this batch:
        </p>
        <ul className="intake-skip-list">
          {skipped.map((s) => (
            <li key={`${s.reason}:${s.filename}`} className="intake-skip-row">
              <span className="intake-skip-name">{s.filename}</span>
              <span className="intake-skip-reason">{reasonLabel(s.reason)}</span>
            </li>
          ))}
        </ul>
        <div className="intake-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="save intake-continue" onClick={onContinue}>
            Continue with {acceptedCount} {plural}
          </button>
        </div>
      </div>
    </div>
  );
}
