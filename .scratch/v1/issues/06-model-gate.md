# Model gate state machine + download UX

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The explicit, consent-first gate for the 770MB PII detection model — built before NER inference so the download experience can be exercised on its own.

Implement `ModelGate` with the state machine `MODEL_MISSING → MODEL_DOWNLOADING → MODEL_READY`, plus `MODEL_ERROR` (with retry back to downloading), and a cache probe that jumps straight to `MODEL_READY` when transformers.js already has the model in IndexedDB. The first-visit "quiet card" leads with the privacy promise and a single primary `↓ Download PII model (770 MB)` button; file drop is disabled in `MODEL_MISSING`, `MODEL_DOWNLOADING`, and `MODEL_ERROR`. Downloading swaps the card to a determinate progress bar showing **bytes loaded / total / percentage / current file**, a Cancel button, and a registered `beforeunload` warning. Errors show a clear network/disk message + Retry. Once ready, show the `Model: ready ✓` chip in the top bar and put Re-download / Clear cache (→ returns to the gate) in the settings sheet.

## Acceptance criteria

- [ ] State machine transitions match the PRD diagram, including cache-probe → `MODEL_READY`
- [ ] First visit shows the quiet card with the privacy promise and a single download button
- [ ] File drop is disabled in `MODEL_MISSING`, `MODEL_DOWNLOADING`, `MODEL_ERROR`
- [ ] Progress bar shows bytes loaded, total, percentage, and current file
- [ ] Cancel works and a `beforeunload` warning is registered only while downloading
- [ ] Errors surface a clear message with a working Retry
- [ ] Returning visit with cached model skips the gate entirely
- [ ] `Model: ready ✓` chip shows when ready; Re-download / Clear cache live in settings, with Clear returning to the gate
- [ ] State-transition unit tests with the worker mocked (does not exercise transformers.js)

## Blocked by

- `.scratch/v1/issues/05-theming-and-theme-toggle.md`
