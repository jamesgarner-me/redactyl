interface Props {
  outputName: string;
  blob: Blob;
  onRedactAnother: () => void;
}

export function Receipt({ outputName, blob, onRedactAnother }: Props) {
  function save() {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = outputName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="receipt">
      <h2 className="receipt-title">Done — ready to save</h2>
      <div className="output-card">
        <span className="output-name">{outputName}</span>
        <button type="button" className="save" onClick={save}>
          ↓ save
        </button>
      </div>
      <button type="button" className="link-button" onClick={onRedactAnother}>
        Redact another file
      </button>
    </div>
  );
}
