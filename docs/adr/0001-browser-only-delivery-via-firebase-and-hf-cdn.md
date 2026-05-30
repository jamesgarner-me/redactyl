# Browser-only delivery via Firebase Hosting + HuggingFace-hosted model

Redactyl is a browser-only tool whose promise is that no document content leaves the device. The app shell is served from **Firebase Hosting** at `redactyl.jamesgarner.me`, and the 770 MB `openai/privacy-filter` NER model is fetched from the **HuggingFace CDN** at runtime behind a consent gate, cached in the browser. Firebase was chosen over a GCS bucket because the cross-origin-isolated headers the app requires (`Cross-Origin-Opener-Policy: same-origin` + a `Cross-Origin-Embedder-Policy`) need a host that lets us set arbitrary response headers without standing up an HTTPS Load Balancer; the HF CDN was chosen over self-hosting because it keeps the deploy inside the free tier and aligns with the consent-first download story. (COEP started as `credentialless` but is now `require-corp` — see the 2026-05-30 correction below.)

## Considered options

- **Self-host the model on Firebase / GCS.** Rejected: a single 770 MB download blows the daily free transfer; at Blaze egress this is ~$0.12/download (~$120 per 1,000 first-time visits) — disproportionate to a side project. (Note: self-hosting is *not* required for `require-corp` — see the 2026-05-30 correction below.)
- **GCS bucket fronted by an HTTPS Load Balancer.** Functionally fine and gives full header control. Rejected: ~$18/month LB base cost regardless of traffic, against a $0 Firebase alternative.
- **CSP.** Deferred. The privacy posture currently rests on COOP/COEP + "no analytics, no error reporting." A strict CSP allowlisting `huggingface.co` would harden this further; revisit if a future dependency adds an outbound call.

## Status note (2026-05-30)

The app shell has been migrated to **Vercel** (`redactyl-app.vercel.app`) as a temporary preference — consolidating with other projects already on Vercel, not because of any Firebase limitation. The Firebase deployment at `redactyl.jamesgarner.me` remains live and the config (`firebase.json`, `.firebaserc`) is preserved; CI workflows are disabled (manual trigger only) so the setup is reversible. The cross-origin-isolation requirement and HuggingFace CDN model strategy are unchanged — `vercel.json` replaces `firebase.json` for header configuration only (both carry the `require-corp` headers per the correction below).

## Correction (2026-05-30): COEP is `require-corp`, not `credentialless`

The original consequence below claimed COEP "must remain `credentialless`" because the HF CDN emits no CORP headers. This was wrong on two counts, found when Safari v26 hit the "browser not supported" gate:

1. **Safari supports neither version of the original assumption.** Safari does not implement `COEP: credentialless` *at all* (only Chromium and Firefox do). So `credentialless` excluded *every* Safari version from cross-origin isolation, not just < 17.4 — `SharedArrayBuffer` was never granted, and the threaded WASM path could never start.
2. **`require-corp` is satisfied by CORS, not only by CORP.** The HF CDN returns `Access-Control-Allow-Origin` on model files (verified against `huggingface.co/openai/privacy-filter`), and transformers.js fetches them in CORS mode. A CORS-validated cross-origin fetch satisfies `require-corp` without any CORP header — so self-hosting is unnecessary.

The headers are now `COOP: same-origin` + `COEP: require-corp` (`vercel.json`, `vite.config.ts`). This is universally supported (Safari included) and strictly stricter than `credentialless`. The only remaining "unsupported" case is a browser too old for cross-origin isolation entirely, which the model gate still handles via its `unsupported` state.

## Consequences

- COEP is `require-corp`. The cross-origin model fetch passes it via the HF CDN's CORS headers (`Access-Control-Allow-Origin`); no CORP header on the CDN is required. All current browsers — Chrome, Firefox, and Safari — get cross-origin isolation and the threaded WASM / WebGPU NER path. The model gate still degrades gracefully (its `unsupported` state) for any browser lacking `SharedArrayBuffer`.
- The only third-party network dependency at runtime is the HF CDN, and only after the user crosses the model gate. This should be disclosed in the UI to keep the "nothing leaves the device" claim honest.
- The Firebase deploy artefact is the Vite app shell only; bandwidth and storage stay trivially inside the Spark (free) tier.
