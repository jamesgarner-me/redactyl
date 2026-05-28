interface Props {
  filename: string;
  label: string;
}

export function Analyzing({ filename, label }: Props) {
  return (
    <div className="interim" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="interim-file">{filename}</p>
      <p className="interim-label">{label}</p>
    </div>
  );
}
