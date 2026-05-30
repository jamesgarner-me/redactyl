interface Props {
  itemCount: number;
  occurrenceCount: number;
  onClick: () => void;
  disabled?: boolean;
  // Shown next to a disabled button so the block is never unexplained.
  reason?: string;
}

export function RedactButton({ itemCount, occurrenceCount, onClick, disabled, reason }: Props) {
  return (
    <div className="redact-bar">
      <span className="counts" aria-live="polite">
        {reason && disabled ? reason : `${itemCount} items · ${occurrenceCount} occurrences`}
      </span>
      <button type="button" className="redact" onClick={onClick} disabled={disabled}>
        Redact →
      </button>
    </div>
  );
}
