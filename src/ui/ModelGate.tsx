import { useEffect, useRef, useState } from 'react';
import type { ModelState } from '../model/modelGate';
import { ModelDescription, ModelDisclaimer, ProcessPipeline } from './ProcessExplainer';

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

// The modal is dismissible in every state EXCEPT `downloading`: a scrim-click or
// Escape there would silently throw away a part-complete 770 MB fetch, so those
// are inert and Cancel is the only deliberate escape hatch. Pure predicate so
// the rule is unit-testable without a DOM.
export function canDismissModal(state: ModelState): boolean {
  return state.name !== 'downloading';
}

// Screen 1. `ready` is never rendered here — App shows the dropzone instead, so
// the drop target only exists once the model is available (file drop is
// inherently disabled in missing / downloading / error). `probing` and
// `unsupported` short-circuit before the landing card + modal.
export function ModelGate({ state, onDownload, onRetry, onCancel }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dismissible = canDismissModal(state);

  // Drive the native dialog imperatively: showModal() gives us the focus trap,
  // inert background, and ::backdrop scrim for free. The dialog's content is
  // always mounted (switched by `state`); only its open-ness is controlled here.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (modalOpen && !dlg.open) dlg.showModal();
    else if (!modalOpen && dlg.open) dlg.close();
  }, [modalOpen]);

  if (state.name === 'probing') {
    return (
      <div className="interim" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <p className="interim-label">Checking for a cached model…</p>
      </div>
    );
  }

  if (state.name === 'unsupported') {
    return (
      <div className="model-card">
        <p className="model-promise">
          <strong>Browser not supported.</strong> Redactyl needs cross-origin isolation and{' '}
          <code>SharedArrayBuffer</code> to run the detection model in your browser. Try a current
          version of Chrome, Firefox, Edge, or Safari.
        </p>
      </div>
    );
  }

  // Escape fires the dialog's `cancel` event; preventDefault always so native
  // close never races our state, then dismiss only when allowed.
  function handleCancelEvent(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault();
    if (dismissible) setModalOpen(false);
  }

  // A backdrop click lands on the <dialog> element itself (content sits in a
  // child wrapper). Dismiss only when allowed — inert while downloading.
  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current && dismissible) setModalOpen(false);
  }

  return (
    <>
      {/* Base layer — the purpose-first landing card. Sits behind the modal in
          downloading / error; it's the only thing visible in `missing` until
          Get Started opens the modal. */}
      <div className="model-card model-landing">
        <p className="model-lede">
          <strong>Redactyl removes personal data from your documents.</strong> It finds names,
          addresses, emails, account numbers and more in PDFs and text files, and gives you back a
          clean copy with each one replaced — so it's safe to share. The main use: sanitising a file
          before you paste or upload it to an AI tool.
        </p>
        <p className="model-promise model-promise-callout">
          <strong>Nothing leaves your device.</strong> Detection runs entirely in your browser.
        </p>
        <button type="button" className="redact model-download" onClick={() => setModalOpen(true)}>
          Get Started
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="model-dialog"
        aria-labelledby="model-dialog-title"
        onCancel={handleCancelEvent}
        onClick={handleBackdropClick}
      >
        <div className="model-dialog-body">
          {dismissible && (
            <button
              type="button"
              className="model-dialog-close"
              aria-label="Close"
              onClick={() => setModalOpen(false)}
            >
              ×
            </button>
          )}
          {renderModalContent()}
        </div>
      </dialog>
    </>
  );

  function renderModalContent() {
    if (state.name === 'downloading') {
      const p = state.progress;
      const hasBytes = p != null && p.total > 0;
      const pct = hasBytes ? Math.round((p.loaded / p.total) * 100) : 0;
      return (
        <div aria-live="polite">
          <p className="model-dialog-eyebrow">One-time setup</p>
          <h2 id="model-dialog-title" className="model-dialog-title">
            Downloading model…
          </h2>
          {/* No `value` until bytes arrive → an indeterminate bar while the
              runtime boots and the first file is being fetched. */}
          <progress
            className="model-progress"
            max={100}
            value={hasBytes ? pct : undefined}
            aria-label="Download progress"
          />
          <p className="model-meta">
            <span className="model-file">{p?.file ?? 'starting the model runtime…'}</span>
            <span className="model-bytes">
              {hasBytes
                ? `${formatBytes(p.loaded)} / ${formatBytes(p.total)} · ${pct}%`
                : 'fetching…'}
            </span>
          </p>
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancel
          </button>
          <ModelDisclaimer />
          <ProcessPipeline />
        </div>
      );
    }

    if (state.name === 'error') {
      return (
        <div role="alert">
          <p className="model-dialog-eyebrow">One-time setup</p>
          <h2 id="model-dialog-title" className="model-dialog-title">
            Download failed
          </h2>
          <p className="model-error">{state.message}</p>
          <button type="button" className="redact model-download" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
    }

    // missing: the describe view — decision-support, then the download action.
    return (
      <div>
        <p className="model-dialog-eyebrow">One-time setup</p>
        <h2 id="model-dialog-title" className="model-dialog-title">
          Download the detection model
        </h2>
        <ModelDescription />
        <ModelDisclaimer />
        <button type="button" className="redact model-download" onClick={onDownload}>
          ↓ Download model (770 MB)
        </button>
      </div>
    );
  }
}
