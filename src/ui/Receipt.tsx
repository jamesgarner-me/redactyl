interface SaveTarget {
  name: string;
  blob: Blob;
}

interface Props {
  outputName: string;
  blob: Blob;
  mapping?: SaveTarget;
  // PDFs go through PdfVerifier (re-parse + re-detect) before reaching here, so
  // we can assert the output is provably clean. Text output has no such pass.
  verified?: boolean;
  // Pages flattened to an image by the rasterise fallback (text not selectable).
  rasterisedPages?: number[];
  onRedactAnother: () => void;
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

export function Receipt({
  outputName,
  blob,
  mapping,
  verified,
  rasterisedPages,
  onRedactAnother,
}: Props) {
  const flattened = rasterisedPages && rasterisedPages.length > 0;
  return (
    <div className="receipt">
      <h2 className="receipt-title">Complete</h2>
      {verified && (
        <p className="verified-badge" role="status">
          ✓ Verified — no detectable PII in the output
        </p>
      )}
      {flattened && (
        <p className="raster-note">
          ✓ Re-verified after flattening page{rasterisedPages.length > 1 ? 's' : ''}{' '}
          {rasterisedPages.join(', ')} — those pages are now images, so their text isn't selectable.
        </p>
      )}
      <div className="output-card">
        <div className="output-meta">
          <span className="output-label">Redacted file</span>
          <span className="output-name">{outputName}</span>
        </div>
        <button type="button" className="save" onClick={() => saveBlob({ name: outputName, blob })}>
          ↓ save
        </button>
      </div>
      {mapping && (
        <div className="output-card mapping-card">
          <div className="output-meta">
            <span className="output-label">Re-identification mapping</span>
            <span className="output-name">{mapping.name}</span>
            <span className="mapping-warning">
              ⚠ Anyone with this file can reverse the redaction.
            </span>
          </div>
          <button type="button" className="save" onClick={() => saveBlob(mapping)}>
            ↓ save
          </button>
        </div>
      )}
      <button type="button" className="link-button" onClick={onRedactAnother}>
        Redact another file
      </button>
    </div>
  );
}
