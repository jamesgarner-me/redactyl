import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  // Wired in slice 6 (model gate). Undefined here renders the actions as
  // disabled slots, per the PRD's "slot for future prefs".
  onRedownload?: () => void;
  onClearCache?: () => void;
}

// The ⚙ sheet. Holds model-cache actions only — theme lives in the top bar
// toggle and is deliberately not duplicated here.
export function SettingsSheet({ open, onClose, onRedownload, onClearCache }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2>Settings</h2>
          <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </header>
        <section className="sheet-section">
          <h3>Model cache</h3>
          <p className="sheet-hint">The PII detection model is cached locally in your browser.</p>
          <div className="sheet-actions">
            <button
              type="button"
              className="ghost-button"
              disabled={!onRedownload}
              onClick={onRedownload}
            >
              Re-download model
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!onClearCache}
              onClick={onClearCache}
            >
              Clear cache
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
