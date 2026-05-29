# Firebase Hosting deploy + custom domain

Status: ready-for-human

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section and [ADR 0001](../../../docs/adr/0001-browser-only-delivery-via-firebase-and-hf-cdn.md).

## What to build

Stand up production hosting on Firebase at `redactyl.jamesgarner.me` and prove cross-origin isolation works in the wild. HITL because creating the Firebase project, editing DNS at the GoDaddy registrar, and waiting on managed SSL provisioning all need a human at a keyboard.

The site must serve the Vite build with the same cross-origin-isolation headers the local dev server uses (mirroring `vite.config.ts`), or the threaded ONNX WASM path won't initialise and the NER layer will fail silently:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: credentialless` (must stay `credentialless`, not `require-corp` — the HuggingFace CDN model fetch is cross-origin and HF does not emit CORP headers; see ADR 0001)
- `/assets/**` → `Cache-Control: public, max-age=31536000, immutable`
- `/index.html` → `Cache-Control: no-cache`

`firebase.json` should configure a SPA rewrite (`** → /index.html`) and the headers above. The build output (`dist/`) is already portable to any path because `vite.config.ts` sets `base: './'`.

## Acceptance criteria

- [ ] Firebase project created and `firebase.json` committed with COOP/COEP headers and the cache-control rules above
- [ ] Manual `pnpm build && firebase deploy --only hosting` succeeds from a local machine
- [ ] `redactyl.jamesgarner.me` is configured as a custom domain on the Firebase site; A records added at GoDaddy; managed SSL provisioned
- [ ] Loading `https://redactyl.jamesgarner.me/` shows DevTools → Application → Frame → **Cross-Origin Isolated: yes**
- [ ] The model gate loads on the live URL and the user can complete a model download → text redaction end-to-end against the deployed site (smoke test that the threaded WASM path actually works in production, not just that headers are present)

## Blocked by

None — can start immediately.

## Comments

**Code artefacts committed** (the parts that don't need a human at a keyboard):

- `firebase.json` — `public: dist`, SPA rewrite `** → /index.html`, and the
  header set from this issue: COOP `same-origin` + COEP `credentialless` on
  `**`, `/index.html` → `no-cache`, `/assets/**` → `immutable` 1-year cache.
  Verified `pnpm build` emits exactly `dist/index.html` + `dist/assets/**`, so
  the globs match the real output.
- `.firebaserc` — `default` project alias set to **`redactyl`** (placeholder).
  ⚠️ Change this to the real Firebase project ID if it differs; the two CI
  workflows (issue 14) hardcode the same `projectId` and must match.

**Remaining human steps (this issue stays `ready-for-human` until done):**

1. Create the Firebase project (Spark/free tier per ADR 0001) and confirm the
   project ID matches `.firebaserc` + the workflows.
2. `pnpm build && firebase deploy --only hosting` from a local machine once
   (proves the config before CI takes over).
3. Add `redactyl.jamesgarner.me` as a custom domain on the site; add the A
   records at GoDaddy; wait for managed SSL.
4. Smoke test on the live URL: DevTools → Application → Frame →
   **Cross-Origin Isolated: yes**, then complete a model download → text
   redaction end-to-end to confirm the threaded WASM path works in production.
