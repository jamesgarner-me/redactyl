# Vercel deployment (redactyl-app.vercel.app)

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section and [ADR 0001](../../../docs/adr/0001-browser-only-delivery-via-firebase-and-hf-cdn.md) (status note 2026-05-30).

## Context

The app shell is being migrated from Firebase Hosting (`redactyl.jamesgarner.me`, issues 13–14) to Vercel (`redactyl-app.vercel.app`) as a temporary preference — consolidating with other projects already on Vercel, not a Firebase limitation. The Firebase site and config are preserved and CI workflows are disabled (not deleted) so the switch is reversible.

The COOP/COEP constraints from ADR 0001 are unchanged. Vercel supports `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` on `*.vercel.app` domains via `vercel.json`. The native Vercel GitHub integration replaces the explicit Firebase GitHub Actions workflows — no new workflow files are needed; Vercel deploys on push to `main` and creates preview deployments for PRs automatically.

## What to build

### Agent deliverables

**`vercel.json`** — mirrors the header and rewrite config in `firebase.json`:

- SPA rewrite: all routes → `/index.html`
- `Cross-Origin-Opener-Policy: same-origin` on all routes
- `Cross-Origin-Embedder-Policy: credentialless` on all routes (must stay `credentialless`, not `require-corp` — see ADR 0001)
- `/index.html` → `Cache-Control: no-cache`
- `/assets/**` → `Cache-Control: public, max-age=31536000, immutable`

**Disable Firebase CI workflows** — change the `on:` trigger in both workflow files from their current auto-fire triggers to `on: workflow_dispatch` only, so they never fire on push/PR but remain as reference:

- `.github/workflows/firebase-hosting-merge.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`

### HITL steps

1. Connect the repo to Vercel via the dashboard. Set the project name to **`redactyl-app`** to claim `redactyl-app.vercel.app` — verify the name is available first (confirmed: `redactyl` was taken).
2. Confirm build settings in the Vercel dashboard (or accept auto-detected Vite defaults):
   - Install: `pnpm install --frozen-lockfile`
   - Build: `pnpm build`
   - Output directory: `dist`
3. Trigger a deploy and verify `crossOriginIsolated === true` in DevTools → Application → Frame on `https://redactyl-app.vercel.app/`.
4. Smoke test: complete a model download → text redaction end-to-end on `https://redactyl-app.vercel.app/` to confirm the threaded ONNX WASM path works in production.

## Acceptance criteria

- [x] `vercel.json` committed with SPA rewrite, COOP/COEP headers, and cache-control rules matching `firebase.json`
- [x] Both Firebase CI workflow files changed to `on: workflow_dispatch` only (no longer auto-fire)
- [x] Vercel project connected to the repo; `redactyl-app.vercel.app` resolves to the app
- [x] `https://redactyl-app.vercel.app/` shows `crossOriginIsolated === true` in DevTools
- [x] Model download → text redaction end-to-end passes on the live Vercel URL

## Blocked by

None — Firebase deployment (issues 13–14) is complete and independent of this.

## Related

- Issue 13: Firebase Hosting deploy (completed — `redactyl.jamesgarner.me`)
- Issue 14: GitHub Actions deploy for Firebase (completed — workflows being disabled, not deleted)
- ADR 0001: status note records this migration and the rationale
