interface SaveTarget {
  name: string;
  blob: Blob;
}

interface Props {
  outputName: string;
  blob: Blob;
  mapping?: SaveTarget;
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

export function Receipt({ outputName, blob, mapping, onRedactAnother }: Props) {
  return (
    <div className="receipt">
      <h2 className="receipt-title">Done, ready to save</h2>
      <div className="output-card">
        <span className="output-name">{outputName}</span>
        <button type="button" className="save" onClick={() => saveBlob({ name: outputName, blob })}>
          ↓ save
        </button>
      </div>
      {mapping && (
        <div className="output-card mapping-card">
          <div className="mapping-card-text">
            <span className="output-name">{mapping.name}</span>
            <span className="mapping-warning">
              ⚠ Re-identification mapping. Anyone with this file can reverse the redaction.
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
