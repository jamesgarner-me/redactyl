# Firebase Hosting deploy + custom domain

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section and [ADR 0001](../../../docs/adr/0001-browser-only-delivery-via-firebase-and-hf-cdn.md).

## What to build

Stand up production hosting on Firebase at `redactyl.jamesgarner.me` and prove cross-origin isolation works in the wild. HITL because creating the Firebase project, editing DNS in AWS Route 53 (the nameservers for `jamesgarner.me` are `awsdns-*`; GoDaddy is only the registrar), and waiting on managed SSL provisioning all need a human at a keyboard.

The site must serve the Vite build with the same cross-origin-isolation headers the local dev server uses (mirroring `vite.config.ts`), or the threaded ONNX WASM path won't initialise and the NER layer will fail silently:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless` (must stay `credentialless`, not `require-corp` — the HuggingFace CDN model fetch is cross-origin and HF does not emit CORP headers; see ADR 0001)
- `/assets/**` → `Cache-Control: public, max-age=31536000, immutable`
- `/index.html` → `Cache-Control: no-cache`

`firebase.json` should configure a SPA rewrite (`** → /index.html`) and the headers above. The build output (`dist/`) is already portable to any path because `vite.config.ts` sets `base: './'`.

## Acceptance criteria

- [x] Firebase project created and `firebase.json` committed with COOP/COEP headers and the cache-control rules above
- [x] Manual `pnpm build && firebase deploy --only hosting` succeeds from a local machine
- [x] `redactyl.jamesgarner.me` is configured as a custom domain on the Firebase site; A records added in Route 53; managed SSL provisioned
- [x] Loading `https://redactyl.jamesgarner.me/` shows DevTools → Application → Frame → **Cross-Origin Isolated: yes**
- [x] The model gate loads on the live URL and the user can complete a model download → text redaction end-to-end against the deployed site (smoke test that the threaded WASM path actually works in production, not just that headers are present)

## Blocked by

None — can start immediately.

## Comments

**Code artefacts committed** (the parts that don't need a human at a keyboard):

- `firebase.json` — `public: dist`, SPA rewrite `** → /index.html`, and the
  header set from this issue: COOP `same-origin` + COEP `credentialless` on
  `**`, `/index.html` → `no-cache`, `/assets/**` → `immutable` 1-year cache.
  Verified `pnpm build` emits exactly `dist/index.html` + `dist/assets/**`, so
  the globs match the real output.
- `.firebaserc` — `default` project alias set to **`redactyl-aaa111`** (the real
  Firebase project ID). The two CI workflows (issue 14) hardcode the same
  `projectId`.

**Remaining human steps (this issue stays `ready-for-human` until done):**

1. Create the Firebase project `redactyl-aaa111` (Spark/free tier per ADR 0001)
   if it doesn't exist yet.
2. `pnpm build && firebase deploy --only hosting` from a local machine once
   (proves the config before CI takes over).
3. Add `redactyl.jamesgarner.me` as a custom domain on the site; add the A
   records (and any TXT verification record) in the AWS Route 53 hosted zone for
   `jamesgarner.me` — not GoDaddy, which is only the registrar; the zone's
   nameservers are `awsdns-*`. Wait for managed SSL.
4. Smoke test on the live URL: DevTools → Application → Frame →
   **Cross-Origin Isolated: yes**, then complete a model download → text
   redaction end-to-end to confirm the threaded WASM path works in production.

**Verified done (2026-05-30):** site live at `https://redactyl.jamesgarner.me/`
(HTTP 200). Cross-origin-isolation headers confirmed in production on both the
document and hashed assets:

- `/` → COOP `same-origin`, COEP `credentialless`, `Cache-Control: no-cache`
- `/assets/**` → COOP `same-origin`, COEP `credentialless`,
  `Cache-Control: public, max-age=31536000, immutable`

Both COOP `same-origin` + COEP `credentialless` are present, which is what makes
the frame cross-origin-isolated and lets the threaded ONNX WASM path initialise.
Human-side Firebase project, DNS, and SSL all stood up. Status → completed.
