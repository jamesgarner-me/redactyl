export interface BucketChip {
  bucket: string;
  occurrences: number;
  // True when every Item in the Bucket is currently Excluded.
  excluded: boolean;
}

interface Props {
  chips: BucketChip[];
  onToggle: (bucket: string) => void;
}

// One chip per Bucket with its Occurrence count. Clicking bulk-toggles Exclude
// for the whole Bucket; the count is unaffected by Exclude (only Dismiss).
export function SummaryStrip({ chips, onToggle }: Props) {
  return (
    <div className="summary-strip">
      {chips.map((chip) => (
        <button
          key={chip.bucket}
          type="button"
          className={chip.excluded ? 'bucket-chip excluded' : 'bucket-chip'}
          aria-pressed={!chip.excluded}
          onClick={() => onToggle(chip.bucket)}
        >
          <span className="bucket-name">{chip.bucket}</span>
          <span className="bucket-count">{chip.occurrences}</span>
        </button>
      ))}
    </div>
  );
}
