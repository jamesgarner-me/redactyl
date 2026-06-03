# Cross-origin-isolation spike in containerised headless Chromium

Status: completed

## Parent

E2E PII-recall verification. Charter + design in `test/e2e/README.md`; rationale in
[ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md). Came
from the grilling session that fixed the harness design.

## What to build

A throwaway spike that answers the single scariest assumption behind the whole
E2E-in-Docker idea **before** any harness is written: does containerised headless
Chromium get cross-origin isolation (COOP/COEP) so `SharedArrayBuffer` — and thus
the threaded-WASM NER path — is available? Serve the real app shell via the actual
`vite preview` config and read `self.crossOriginIsolated` + `typeof SharedArrayBuffer`
from the page.

## Acceptance criteria

- [x] A Docker image on the multi-arch Playwright base serves the real app via `vite preview`
- [x] Headless Chromium reports `self.crossOriginIsolated === true`
- [x] `SharedArrayBuffer` is defined in the page context
- [x] Result captured; harness is disposable (lives under `.scratch/tmp/spike/`)

## Outcome (verdict)

**PASS.** `SPIKE_RESULT {"crossOriginIsolated":true,"sharedArrayBuffer":true}`.
The threaded-WASM NER path can run in Docker. Two findings carried into the real
harness (issue 02):

- **Multi-arch base confirmed** — `mcr.microsoft.com/playwright:v1.49.1-noble`
  pulls and runs natively on Apple Silicon (arm64).
- **Corepack gotcha** — the image's bundled corepack (Node 22.12.0) has stale
  signing keys and fails the pnpm signature check (`Cannot find matching keyid`).
  Use `RUN npm install -g pnpm@<pinned>` instead of `corepack enable`.

## Blocked by

None - was the first thing done.
