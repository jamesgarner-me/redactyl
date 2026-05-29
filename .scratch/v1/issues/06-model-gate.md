# Model gate state machine + download UX

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The explicit, consent-first gate for the 770MB PII detection model — built before NER inference so the download experience can be exercised on its own.

Implement `ModelGate` with the state machine `MODEL_MISSING → MODEL_DOWNLOADING → MODEL_READY`, plus `MODEL_ERROR` (with retry back to downloading), and a cache probe that jumps straight to `MODEL_READY` when transformers.js already has the model in IndexedDB. The first-visit "quiet card" leads with the privacy promise and a single primary `↓ Download PII model (770 MB)` button; file drop is disabled in `MODEL_MISSING`, `MODEL_DOWNLOADING`, and `MODEL_ERROR`. Downloading swaps the card to a determinate progress bar showing **bytes loaded / total / percentage / current file**, a Cancel button, and a registered `beforeunload` warning. Errors show a clear network/disk message + Retry. Once ready, show the `Model: ready ✓` chip in the top bar and put Re-download / Clear cache (→ returns to the gate) in the settings sheet.

## Acceptance criteria

- [x] State machine transitions match the PRD diagram, including cache-probe → `MODEL_READY`
- [x] First visit shows the quiet card with the privacy promise and a single download button
- [x] File drop is disabled in `MODEL_MISSING`, `MODEL_DOWNLOADING`, `MODEL_ERROR`
- [x] Progress bar shows bytes loaded, total, percentage, and current file
- [x] Cancel works and a `beforeunload` warning is registered only while downloading
- [x] Errors surface a clear message with a working Retry
- [x] Returning visit with cached model skips the gate entirely
- [x] `Model: ready ✓` chip shows when ready; Re-download / Clear cache live in settings, with Clear returning to the gate
- [x] State-transition unit tests with the worker mocked (does not exercise transformers.js)

Verified live in the browser (Chrome): quiet card → progress (file/bytes/%/cancel) → ready chip → dropzone; cache-skip on reload; Clear cache returns to the gate; `?modelfail` exercises the error → Retry → success path; `beforeunload` present only while downloading.

**Note:** the real transformers.js client (replacing `mockModelClient`) lands in slice 7 behind the `ModelClient` interface; the mock simulates the 770 MB multi-file download, cancel, and a `localStorage` cache flag.

## Blocked by

- `.scratch/v1/issues/05-theming-and-theme-toggle.md`
