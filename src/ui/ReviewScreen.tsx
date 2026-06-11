import { useMemo, useState } from 'react';
import { bucketFor, isMasked, maskHint } from '../domain/buckets';
import { itemKey } from '../domain/items';
import type { Item, Span } from '../domain/types';
import { EntityReviewList, type ReviewRow } from './EntityReviewList';
import { RedactButton } from './RedactButton';
import { SummaryStrip, type BucketChip } from './SummaryStrip';

interface Props {
  filename: string;
  items: Item[];
  // Source-specific locator: line numbers for text, page numbers for PDFs.
  locate: (item: Item) => string;
  // The mapping sidecar only makes sense for token-substituted text output; the
  // PDF path blanks glyphs (no tokens), so it hides the option.
  allowMapping: boolean;
  // When set (a scanned/garbled PDF), a red banner is pinned above the results
  // and redaction is hard-disabled — the file can't be safely sanitised.
  safetyWarning?: string;
  // A non-blocking advisory (e.g. a CSV name column the model recognised no
  // names in). Shown as an amber notice; redaction stays enabled.
  advisory?: string;
  onRedact: (acceptedSpans: Span[], saveMapping: boolean) => void;
  onRedactAnother: () => void;
}

function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// The core screen. Owns the per-Item opt-out state (Exclude / Dismiss / reveal);
// remounts per analysis (App keys it) so the state resets for each new file.
export function ReviewScreen({
  filename,
  items,
  locate,
  allowMapping,
  safetyWarning,
  advisory,
  onRedact,
  onRedactAnother,
}: Props) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saveMapping, setSaveMapping] = useState(false);

  // Precompute each Item's key, Bucket, mask flag and locator once.
  const views = useMemo(
    () =>
      items.map((item) => ({
        key: itemKey(item.category, item.value),
        item,
        bucket: bucketFor(item.category),
        maskable: isMasked(item.category),
        locator: locate(item),
      })),
    [items, locate],
  );

  // The reassuring "all clear" empty state is only honest when nothing blocked
  // detection. A scanned/garbled PDF with no Items is unsafe, not clean — it
  // falls through to the banner treatment below.
  if (items.length === 0 && !safetyWarning && !advisory) {
    return (
      <div className="empty-state">
        <p className="empty-headline">✓ No personal data detected in {filename}</p>
        <p className="empty-caveat">
          Detection isn't perfect, so eyeball your file before pasting. No output file is produced.
        </p>
        <button type="button" className="link-button" onClick={onRedactAnother}>
          Redact another file
        </button>
      </div>
    );
  }

  // Strip Bucket counts and Exclude state ignore Dismissed Items entirely.
  const live = views.filter((v) => !dismissed.has(v.key));

  const byBucket = new Map<string, { occurrences: number; keys: string[] }>();
  for (const v of live) {
    const entry = byBucket.get(v.bucket) ?? { occurrences: 0, keys: [] };
    entry.occurrences += v.item.spans.length;
    entry.keys.push(v.key);
    byBucket.set(v.bucket, entry);
  }
  const chips: BucketChip[] = [...byBucket.entries()].map(([bucket, entry]) => ({
    bucket,
    occurrences: entry.occurrences,
    excluded: entry.keys.every((k) => excluded.has(k)),
  }));

  const rows: ReviewRow[] = live.map((v) => ({
    key: v.key,
    category: v.item.category,
    display: v.maskable && !revealed.has(v.key) ? maskHint(v.item.value) : v.item.value,
    maskable: v.maskable,
    revealed: revealed.has(v.key),
    occurrences: v.item.spans.length,
    locator: v.locator,
    excluded: excluded.has(v.key),
  }));

  // Accepted = neither Excluded nor Dismissed. The headline counts these Items.
  const accepted = live.filter((v) => !excluded.has(v.key));
  const occurrenceCount = accepted.reduce((sum, v) => sum + v.item.spans.length, 0);
  const dismissedViews = views.filter((v) => dismissed.has(v.key));

  function toggleBucket(bucket: string) {
    const keys = live.filter((v) => v.bucket === bucket).map((v) => v.key);
    const allExcluded = keys.every((k) => excluded.has(k));
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allExcluded) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  return (
    <div className="review">
      {safetyWarning && (
        <p className="safety-banner" role="alert">
          ⚠ {safetyWarning}
        </p>
      )}
      {advisory && (
        <p className="advisory-banner" role="status">
          ⚠ {advisory}
        </p>
      )}
      {items.length === 0 ? (
        <p className="empty-caveat">
          No personal data was detected — but this file is not sanitised (see above).
        </p>
      ) : (
        <>
          <SummaryStrip chips={chips} onToggle={toggleBucket} />
          <EntityReviewList
            rows={rows}
            onToggle={(key) => setExcluded((prev) => toggled(prev, key))}
            onReveal={(key) => setRevealed((prev) => toggled(prev, key))}
            onDismiss={(key) => setDismissed((prev) => new Set(prev).add(key))}
          />
      {dismissed.size > 0 && (
        <div className="dismissed-footer">
          <button
            type="button"
            className="link-button"
            onClick={() => setShowDismissed((s) => !s)}
          >
            {dismissed.size} dismissed · {showDismissed ? 'hide' : 'show'}
          </button>
          {showDismissed && (
            <ul className="dismissed-list">
              {dismissedViews.map((v) => (
                <li key={v.key} className="row dismissed-row">
                  <span className="row-category">{v.item.category}</span>
                  <span className="row-value">
                    {v.maskable ? maskHint(v.item.value) : v.item.value}
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setDismissed((prev) => toggled(prev, v.key))}
                  >
                    restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {allowMapping && (
        <div className="advanced-footer">
          <button
            type="button"
            className="link-button"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? '▾' : '▸'} Advanced
          </button>
          {showAdvanced && (
            <label className="advanced-option">
              <input
                type="checkbox"
                checked={saveMapping}
                onChange={() => setSaveMapping((s) => !s)}
              />
              <span>
                Also save a re-identification mapping
                <span className="advanced-warning">
                  Anyone with this file can reverse the redaction.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
        </>
      )}
      <RedactButton
        itemCount={accepted.length}
        occurrenceCount={occurrenceCount}
        disabled={accepted.length === 0 || !!safetyWarning}
        reason={safetyWarning ? "This file can't be safely sanitised — no output is produced." : undefined}
        onClick={() => onRedact(accepted.flatMap((v) => v.item.spans), saveMapping)}
      />
    </div>
  );
}
