interface SaveTarget {
  name: string;
  blob: Blob;
}

interface Props {
  outputName: string;
  blob: Blob;
  mapping?: SaveTarget;
  // Pages the rasterise fallback flattened to an image to strip PII the text
  // layer couldn't. We surface this because it changes the output (text on
  // those pages is no longer selectable); the verification pass itself is an
  // internal guarantee, not something the user needs to read about.
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

export function Receipt({ outputName, blob, mapping, rasterisedPages, onRedactAnother }: Props) {
  const flattened = rasterisedPages && rasterisedPages.length > 0;
  const many = flattened && rasterisedPages.length > 1;
  return (
    <div className="receipt">
      <h2 className="receipt-title">Complete</h2>
      {flattened && (
        <p className="raster-note" role="status">
          Page{many ? 's' : ''} {rasterisedPages.join(', ')} had PII that couldn’t be removed from
          the text layer, so {many ? 'they were' : 'it was'} flattened to an image. Text on{' '}
          {many ? 'those pages' : 'that page'} is no longer selectable or searchable.
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
