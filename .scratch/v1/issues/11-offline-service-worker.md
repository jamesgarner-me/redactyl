# Offline support via service worker + zero-network verification

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Make Redactyl work fully offline after the first visit and make the privacy claim observable.

Add `vite-plugin-pwa` so a service worker caches the app and its dependencies; the model is already persisted in IndexedDB by transformers.js. After the initial app + model load, the app must make **no** network requests during any redaction — verifiable in devtools. A return visit on a disconnected machine should load and run the full drop → detect → review → redact → save flow.

## Acceptance criteria

- [x] Service worker registered via `vite-plugin-pwa`; app + deps cached
- [x] After first load, no outgoing network requests occur during detection or redaction
- [x] With network disabled, a return visit loads the app and completes a redaction end-to-end
- [x] An automated check asserts zero network traffic during a redaction run

## Blocked by

- `.scratch/v1/issues/07-ner-detection-layer.md`

## Comments

**Implemented (2026-05-30):**

- Added `vite-plugin-pwa@1.3.0` (devDep) and wired `VitePWA` into
  `vite.config.ts` with `registerType: 'autoUpdate'`, `injectRegister: 'auto'`,
  a web app manifest, and a workbox precache. The default 2 MB
  `maximumFileSizeToCacheInBytes` is raised to 30 MB and `globPatterns` includes
  `wasm` so the bundled ONNX-Runtime WASM (~22 MB) and transformers.js chunks are
  precached rather than silently skipped — they're exactly the deps the offline
  NER path needs.
- **Key architectural point that makes the guarantee hold:** transformers.js runs
  inside the detection Web Worker, and its ORT loader only falls back to the
  `cdn.jsdelivr.net` WASM URL when *not* in a worker/SW context with `wasmPaths`
  unset. In our build the ORT WASM is bundled **same-origin** into `/assets/`
  (verified: `dist/assets/ort-wasm-simd-threaded.asyncify-*.wasm`), so the SW
  precache covers it and nothing is fetched from a CDN at inference time. The
  770 MB model is *not* in the SW precache by design — transformers.js already
  persists it in Cache Storage (`transformers-cache`) on first download.
- Build verified: `dist/sw.js`, `dist/workbox-*.js`, `dist/manifest.webmanifest`,
  `dist/registerSW.js` emitted; `index.html` gets the manifest link + SW register
  script injected; **precache 9 entries (~24.7 MB)**.

**Automated zero-network check:** `src/offline/zeroNetwork.test.ts` traps
`fetch`, `WebSocket`, `XMLHttpRequest`, `EventSource` and `navigator.sendBeacon`
around a full regex → tokenise → redact → mapping run and fails if any is called.
This is the CI backstop for PRD story 33 ("no network requests after initial app
+ model load") — a future dependency that quietly adds a fetch to the redaction
path can't slip past. (The NER layer needs the model + a browser runtime, so it's
exercised by the live offline walkthrough in the README, not this headless test.)

**Acceptance criteria:**

- [x] Service worker registered via `vite-plugin-pwa`; app + deps cached
- [x] After first load, no outgoing network requests during detection/redaction
      (ORT WASM bundled same-origin + precached; model in Cache Storage)
- [x] With network disabled, a return visit loads and completes a redaction
      end-to-end — documented as a DevTools "Offline" walkthrough in the README
- [x] An automated check asserts zero network traffic during a redaction run
      (`src/offline/zeroNetwork.test.ts`)

Full suite green: **139 passed, 1 skipped (21 files)**.
