# DocumentOpener — collapse handleFile and delete the source branching

Status: ready-for-agent

## Parent

Architecture review candidate B — "the `Document` seam".

## What to build

Introduce the `DocumentOpener` and use it to collapse all remaining `source`-keyed branching in `App`. The opener is built once with the verify deps (`detect`, `renderPage`) and exposes `open(file)` returning either an opened `Document` (text or PDF, chosen by extension) or a failure message (encrypted/unreadable PDF). This concentrates extraction + dispatch + open-time error handling in one place.

After this slice `App` no longer branches on source: `handleFile` becomes "open → on failure show the dropzone error, on success run **Detect** on `document.text` and enter review carrying the `Document`". The review `Screen` state carries a `Document` (plus items + id) instead of the spread `ReviewBase` fields. Locate/redact/capabilities are read straight off `document`. The regex re-scan re-runs Detect on the same `Document`.

Delete the now-dead branching machinery: the `ReviewBase` union, `makeLocator`, `safetyMessage`, and the separate `redactPdfFile`/text-redact handlers in `App`. The verify `detect` dep must read the **current** regex setting (via a ref), so verification always matches the live setting even though the opener is constructed once.

## Acceptance criteria

- [ ] A `DocumentOpener` built with `{ detect, renderPage }` exposes `open(file)` → opened `Document` | failure message
- [ ] Encrypted/unreadable files return the failure and show the existing dropzone error copy; no review is entered
- [ ] `App` has zero `source === 'pdf' | 'text'` branches; the review state carries a `Document`; locate/redact/`allowMapping`/`safetyWarning` are read off it
- [ ] `ReviewBase`, `makeLocator`, `safetyMessage`, and the dual redact handlers are removed from `App`
- [ ] The PDF verify `detect` dep reflects the current regex toggle (ref-backed), not a stale capture
- [ ] Both text and PDF flows (incl. fail-closed and rasterised pages) behave identically to before; unit tests cover the opener's dispatch + failure cases
- [ ] `tsc` clean; full suite green

## Blocked by

- `.scratch/document-seam/issues/01-document-interface-text-adapter.md`
- `.scratch/document-seam/issues/02-pdf-adapter.md`
