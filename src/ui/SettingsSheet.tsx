import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  // Wired in slice 6 (model gate). Undefined here renders the actions as
  // disabled slots, per the PRD's "slot for future prefs".
  onRedownload?: () => void;
  onClearCache?: () => void;
  regexEnabled: boolean;
  onToggleRegex: () => void;
  autoRedact: boolean;
  onToggleAutoRedact: () => void;
}

// The ⚙ sheet. Holds detection prefs and model-cache actions — theme lives in
// the top bar toggle and is deliberately not duplicated here.
export function SettingsSheet({
  open,
  onClose,
  onRedownload,
  onClearCache,
  regexEnabled,
  onToggleRegex,
  autoRedact,
  onToggleAutoRedact,
}: Props) {
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
          <h3>Detection</h3>
          <label className="advanced-option">
            <input type="checkbox" checked={regexEnabled} onChange={onToggleRegex} />
            <span>
              Regex pattern matching
              <span className="advanced-hint">
                On by default. Catches patterned values (emails, phones, TFNs) the model misses in
                prose. Toggling re-scans the current file.
              </span>
            </span>
          </label>
        </section>
        <section className="sheet-section">
          <h3>Redaction</h3>
          <label className="advanced-option">
            <input type="checkbox" checked={autoRedact} onChange={onToggleAutoRedact} />
            <span>
              Auto-redact without review
              <span className="advanced-hint">
                Off by default. Redacts every file unattended, accepting all detected items with no
                review — so you don't click through each file. Files that can't be safely sanitised
                are skipped and listed on the receipt. Read once when you open files, so it applies
                to the next batch.
              </span>
            </span>
          </label>
        </section>
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
