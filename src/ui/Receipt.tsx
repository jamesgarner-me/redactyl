import { useState } from 'react';
import type { BatchFailure, BatchOutput } from '../batch/batch';
import { bundleMappingsZip, bundleOutputsZip, hasMappings } from '../batch/zipBundle';

interface Props {
  // Every succeeded redacted output in the Batch, in completion order.
  outputs: BatchOutput[];
  // Files quarantined out of the bundle (open- or redact-time), with reasons.
  failures: BatchFailure[];
  onRedactAnother: () => void;
}

interface SaveTarget {
  name: string;
  blob: Blob;
}

function saveBlob(target: SaveTarget) {
  const url = URL.createObjectURL(target.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = target.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function RasterNote({ pages }: { pages: number[] }) {
  const many = pages.length > 1;
  return (
    <p className="raster-note" role="status">
      Page{many ? 's' : ''} {pages.join(', ')} had PII that couldn’t be removed from the text layer,
      so {many ? 'they were' : 'it was'} flattened to an image. Text on {many ? 'those pages' : 'that page'}{' '}
      is no longer selectable or searchable.
    </p>
  );
}

export function Receipt({ outputs, failures, onRedactAnother }: Props) {
  // The zip is assembled lazily on click (reading every output's bytes), so the
  // button reflects an in-flight save without blocking the receipt render.
  const [busy, setBusy] = useState<null | 'outputs' | 'mappings'>(null);
  // The mappings are the reversal keys, so they sit behind a collapsed accordion
  // (rather than next to the redacted-file saves) to keep them from being grabbed
  // by reflex. The user opts in to revealing them.
  const [showMappingsBundle, setShowMappingsBundle] = useState(false);
  const showMappings = hasMappings(outputs);

  async function saveAll() {
    setBusy('outputs');
    try {
      saveBlob(await bundleOutputsZip(outputs));
    } finally {
      setBusy(null);
    }
  }

  async function saveAllMappings() {
    setBusy('mappings');
    try {
      const zip = await bundleMappingsZip(outputs);
      if (zip) saveBlob(zip);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="receipt">
      <h2 className="receipt-title">Complete</h2>

      {outputs.length > 0 ? (
        <>
          {outputs.length > 1 && (
            <button
              type="button"
              className="save save-all"
              disabled={busy !== null}
              onClick={saveAll}
            >
              ↓ Save all ({outputs.length}) as .zip
            </button>
          )}
          {outputs.map((output, i) => (
            <div key={`${output.outputName}:${i}`} className="output-card">
              <div className="output-meta">
                <span className="output-label">Redacted file</span>
                <span className="output-name">{output.outputName}</span>
              </div>
              {output.rasterisedPages && output.rasterisedPages.length > 0 && (
                <RasterNote pages={output.rasterisedPages} />
              )}
              <button
                type="button"
                className="save"
                onClick={() => saveBlob({ name: output.outputName, blob: output.blob })}
              >
                ↓ save
              </button>
            </div>
          ))}
        </>
      ) : (
        <p className="empty-caveat">No files could be redacted — see below.</p>
      )}

      {showMappings && (
        <div className="output-card mapping-card">
          <button
            type="button"
            className="mapping-accordion-toggle"
            aria-expanded={showMappingsBundle}
            onClick={() => setShowMappingsBundle((s) => !s)}
          >
            <span className="accordion-chevron" aria-hidden="true">
              {showMappingsBundle ? '▾' : '▸'}
            </span>
            <span className="output-label">Re-identification mappings</span>
          </button>
          {showMappingsBundle && (
            <div className="mapping-accordion-body">
              <span className="mapping-warning">
                ⚠ Anyone with these files can reverse the redaction. Keep them separate from the
                redacted documents.
              </span>
              {outputs.flatMap((output, i) =>
                output.mapping
                  ? [
                      <div key={`map:${i}`} className="mapping-row">
                        <span className="output-name">{output.mapping.name}</span>
                        <button
                          type="button"
                          className="save"
                          onClick={() => saveBlob(output.mapping as SaveTarget)}
                        >
                          ↓ save
                        </button>
                      </div>,
                    ]
                  : [],
              )}
              <button
                type="button"
                className="save save-all-mappings"
                disabled={busy !== null}
                onClick={saveAllMappings}
              >
                ↓ Save all mappings as .zip
              </button>
            </div>
          )}
        </div>
      )}

      {failures.length > 0 && (
        <div className="failed-section" role="group" aria-label="Files that could not be redacted">
          <h3 className="failed-title">Couldn’t redact ({failures.length})</h3>
          <ul className="failed-list">
            {failures.map((failure, i) => (
              <li key={`${failure.filename}:${i}`} className="failed-row">
                <span className="failed-name">{failure.filename}</span>
                <span className="failed-reason">{failure.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="link-button" onClick={onRedactAnother}>
        Redact more files
      </button>
    </div>
  );
}
