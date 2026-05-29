# Detection-quality pass — chunking, occurrence propagation, labelled-field detector, regex toggle

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1). Extends the two detection layers shipped in
`.scratch/v1/issues/02-regex-category-set.md` (regex) and `.scratch/v1/issues/07-ner-detection-layer.md` (NER).

## Why this issue exists (backfill)

Work that landed across two commits without a tracking issue. Filed retroactively so the
detection-quality scope is recorded against the tracker rather than living only in commit
messages. Implemented in `6cd80a6` (Detection-quality pass + supporting UI/docs) and
`d71d78d` (Deterministic address coverage: occurrence propagation + labelled-field detector).

## What was built

Four improvements to the text detection path, all behind the existing canonical Span list and
overlap-merge — no new user-facing screens.

1. **NER input chunking on line boundaries with overlap.** The single opaque forward pass was
   replaced with line-boundary chunks (10,000 chars, 512-char overlap) that bound per-pass WASM
   memory and emit per-chunk progress, fixing the apparent hang on large files. Chunks never split
   mid-line, so a name in a heading is no longer sliced across a boundary and missed. Rationale and
   the rejected alternatives are recorded in [ADR 0002](../../../docs/adr/0002-ner-chunking-strategy.md).
   - `src/detection/chunk.ts` (+ `chunk.test.ts`)
   - per-chunk progress plumbing in `src/detection/loadProgress.ts` (+ `loadProgress.test.ts`),
     surfaced in `src/ui/Analyzing.tsx`

2. **Occurrence propagation.** A value detected once in its strongly-contexted field (e.g. a
   labelled address) is propagated to every verbatim occurrence elsewhere, so entities the model
   catches non-deterministically in prose/headings are still masked at all appearances.
   - `src/detection/propagate.ts` (+ `propagate.test.ts`)

3. **Labelled-field detector.** A deterministic detector for `Field: value` lines that gives
   reliable address/account coverage independent of model behaviour, merged through the existing
   overlap-merge.
   - `labelledFieldSpans` in `src/detection/patterns.ts` (+ `labelledField.test.ts`)

4. **Regex detection toggle (Advanced).** Regex pattern matching is exposed as a user toggle in the
   review-screen Advanced footer and the empty state, defaulting on. Toggling re-scans the current
   file. Also broadened the phone pattern (+CC 3-3-3 mobiles) and added the AU TFN
   (mod-11 checksum-gated) pattern.
   - `src/ui/useRegexDetection.ts`, `src/ui/ReviewScreen.tsx`, patterns in `src/detection/patterns.ts`

The worker (`src/detection/detector.worker.ts`) now composes all of this: regex sweep
(`regexScoredSpans` + `labelledFieldSpans`, gated by the toggle) plus chunked NER, with detected
spans run through `propagateOccurrences` before the final `mergeSpans`.

## Acceptance criteria

- [x] NER input is chunked on line boundaries with overlap; chunks never split mid-line; per-chunk progress is surfaced during analysis — `chunk.ts` + `chunk.test.ts`, ADR 0002
- [x] A value detected once is masked at every verbatim occurrence — `propagate.ts` + `propagate.test.ts`
- [x] Labelled `Field: value` lines are detected deterministically — `labelledFieldSpans` + `labelledField.test.ts`
- [x] Regex matching is a user toggle (Advanced footer + empty state), default on, re-scanning on change — `useRegexDetection.ts`, `ReviewScreen.tsx`
- [x] All layers feed one canonical Span list through the existing overlap-merge (no duplicate/overlapping redactions) — `detector.worker.ts`
- [x] `tsc` clean; unit tests cover chunking, propagation, labelled-field, and the new patterns

## Blocked by

None — extended already-shipped issues 02 and 07.
