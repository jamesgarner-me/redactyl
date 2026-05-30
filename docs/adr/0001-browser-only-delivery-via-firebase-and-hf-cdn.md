# Browser-only delivery via Firebase Hosting + HuggingFace-hosted model

Redactyl is a browser-only tool whose promise is that no document content leaves the device. The app shell is served from **Firebase Hosting** at `redactyl.jamesgarner.me`, and the 770 MB `openai/privacy-filter` NER model is fetched from the **HuggingFace CDN** at runtime behind a consent gate, cached in the browser. Firebase was chosen over a GCS bucket because the cross-origin-isolated headers the app requires (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: credentialless`) need a host that lets us set arbitrary response headers without standing up an HTTPS Load Balancer; the HF CDN was chosen over self-hosting because it keeps the deploy inside the free tier and aligns with the consent-first download story.

## Considered options

- **Self-host the model on Firebase / GCS.** Would let us tighten COEP to `require-corp` and pick up Safari < 17.4. Rejected: a single 770 MB download blows the daily free transfer; at Blaze egress this is ~$0.12/download (~$120 per 1,000 first-time visits) — disproportionate to a side project.
- **GCS bucket fronted by an HTTPS Load Balancer.** Functionally fine and gives full header control. Rejected: ~$18/month LB base cost regardless of traffic, against a $0 Firebase alternative.
- **CSP.** Deferred. The privacy posture currently rests on COOP/COEP + "no analytics, no error reporting." A strict CSP allowlisting `huggingface.co` would harden this further; revisit if a future dependency adds an outbound call.

## Status note (2026-05-30)

The app shell has been migrated to **Vercel** (`redactyl.vercel.app`) as a temporary preference — consolidating with other projects already on Vercel, not because of any Firebase limitation. The Firebase deployment at `redactyl.jamesgarner.me` remains live and the config (`firebase.json`, `.firebaserc`) is preserved; CI workflows are disabled (manual trigger only) so the setup is reversible. The COOP/COEP constraints and HuggingFace CDN model strategy in this ADR are unchanged — `vercel.json` replaces `firebase.json` for header configuration only.

## Consequences

- COEP must remain `credentialless` (not `require-corp`) because the model fetch is cross-origin and HF does not emit CORP headers. This excludes Safari < 17.4 from the threaded WASM / WebGPU NER path — the app must degrade gracefully on those browsers.
- The only third-party network dependency at runtime is the HF CDN, and only after the user crosses the model gate. This should be disclosed in the UI to keep the "nothing leaves the device" claim honest.
- The Firebase deploy artefact is the Vite app shell only; bandwidth and storage stay trivially inside the Spark (free) tier.
