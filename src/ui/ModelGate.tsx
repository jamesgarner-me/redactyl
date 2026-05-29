import type { ModelState } from '../model/modelGate';

interface Props {
  state: ModelState;
  onDownload: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

// Screen 1. `ready` is never rendered here — App shows the dropzone instead, so
// the drop target only exists once the model is available (file drop is
// inherently disabled in missing / downloading / error).
export function ModelGate({ state, onDownload, onRetry, onCancel }: Props) {
  if (state.name === 'probing') {
    return (
      <div className="interim" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p className="interim-label">Checking for a cached model…</p>
      </div>
    );
  }

  if (state.name === 'downloading') {
    const p = state.progress;
    const pct = p && p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
    return (
      <div className="model-card" aria-live="polite">
        <h2 className="model-title">Downloading PII model…</h2>
        <progress className="model-progress" max={100} value={pct} aria-label="Download progress" />
        <p className="model-meta">
          <span className="model-file">{p ? p.file : 'starting…'}</span>
          {p && (
            <span className="model-bytes">
              {formatBytes(p.loaded)} / {formatBytes(p.total)} · {pct}%
            </span>
          )}
        </p>
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
        <p className="model-note">Keep this tab open — leaving now restarts the download.</p>
      </div>
    );
  }

  if (state.name === 'error') {
    return (
      <div className="model-card" role="alert">
        <h2 className="model-title">Download failed</h2>
        <p className="model-error">{state.message}</p>
        <button type="button" className="redact" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  // missing — the quiet card: privacy promise leads, single primary action.
  return (
    <div className="model-card">
      <p className="model-promise">
        <strong>Nothing leaves your device.</strong> Redactyl detects personal data entirely in
        your browser. The detector is a one-time 770 MB download, cached locally — your files are
        never uploaded.
      </p>
      <button type="button" className="redact model-download" onClick={onDownload}>
        ↓ Download PII model (770 MB)
      </button>
    </div>
  );
}
