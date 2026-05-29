import type { Category } from '../domain/types';

export interface ReviewRow {
  key: string;
  category: Category;
  // Already masked-or-clear for display; `maskable` says whether the eye shows.
  display: string;
  maskable: boolean;
  revealed: boolean;
  occurrences: number;
  locator: string;
  excluded: boolean;
}

interface Props {
  rows: ReviewRow[];
  onToggle: (key: string) => void;
  onReveal: (key: string) => void;
  onDismiss: (key: string) => void;
}

// Granular rows: `☑ · CATEGORY · value · N× · locator · ×`. Unchecking is
// Exclude (row greyed, stays); the trailing `×` is Dismiss (row leaves).
export function EntityReviewList({ rows, onToggle, onReveal, onDismiss }: Props) {
  return (
    <ul className="review-list">
      {rows.map((row) => (
        <li key={row.key} className={row.excluded ? 'row excluded' : 'row'}>
          <input
            type="checkbox"
            className="row-check"
            checked={!row.excluded}
            aria-label={`Redact ${row.category} ${row.display}`}
            onChange={() => onToggle(row.key)}
          />
          <span className="row-category">{row.category}</span>
          <span className="row-value">{row.display}</span>
          {row.maskable && (
            <button
              type="button"
              className="row-eye"
              aria-label={row.revealed ? 'Hide value' : 'Reveal value'}
              aria-pressed={row.revealed}
              onClick={() => onReveal(row.key)}
            >
              {row.revealed ? '🙈' : '👁'}
            </button>
          )}
          <span className="row-count">{row.occurrences}×</span>
          <span className="row-locator">{row.locator}</span>
          <button
            type="button"
            className="row-dismiss"
            aria-label={`Dismiss — not personal data: ${row.category} ${row.display}`}
            onClick={() => onDismiss(row.key)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
