# Offline support via service worker + zero-network verification

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Make Redactyl work fully offline after the first visit and make the privacy claim observable.

Add `vite-plugin-pwa` so a service worker caches the app and its dependencies; the model is already persisted in IndexedDB by transformers.js. After the initial app + model load, the app must make **no** network requests during any redaction — verifiable in devtools. A return visit on a disconnected machine should load and run the full drop → detect → review → redact → save flow.

## Acceptance criteria

- [ ] Service worker registered via `vite-plugin-pwa`; app + deps cached
- [ ] After first load, no outgoing network requests occur during detection or redaction
- [ ] With network disabled, a return visit loads the app and completes a redaction end-to-end
- [ ] An automated check asserts zero network traffic during a redaction run

## Blocked by

- `.scratch/v1/issues/07-ner-detection-layer.md`
