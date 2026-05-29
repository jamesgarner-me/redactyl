interface Props {
  filename: string;
  label: string;
  progress?: { processed: number; total: number };
}

export function Analyzing({ filename, label, progress }: Props) {
  // Once the model reports chunk progress we swap the indeterminate spinner for a
  // real bar so a large file shows how far the scan has actually got.
  const pct =
    progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : null;

  return (
    <div className="interim" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="interim-file">{filename}</p>
      <p className="interim-label">{label}</p>
      {pct !== null && (
        <div className="interim-progress">
          <progress className="model-progress" value={progress!.processed} max={progress!.total} />
          <p className="interim-progress-meta">{pct}% complete</p>
        </div>
      )}
    </div>
  );
}
