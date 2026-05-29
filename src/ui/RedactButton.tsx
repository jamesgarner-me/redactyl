interface Props {
  itemCount: number;
  occurrenceCount: number;
  onClick: () => void;
  disabled?: boolean;
}

export function RedactButton({ itemCount, occurrenceCount, onClick, disabled }: Props) {
  return (
    <div className="redact-bar">
      <span className="counts" aria-live="polite">
        {itemCount} items · {occurrenceCount} occurrences
      </span>
      <button type="button" className="redact" onClick={onClick} disabled={disabled}>
        Redact →
      </button>
    </div>
  );
}
