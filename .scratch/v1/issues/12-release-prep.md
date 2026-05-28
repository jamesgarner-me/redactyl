# Release prep — README threat model, corpus regression, hosting

Status: ready-for-human

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Everything needed to ship v1 publicly — HITL because the hosting choice is a human decision and the threat-model README needs human review before it underwrites the product's trust claims.

Write a README explaining the threat model, what's stored where, and how a user can verify nothing leaves the browser (the static-site / no-backend architecture is observable in devtools as zero outgoing traffic after load; the verification pass is a user-facing guarantee, not just an internal net — explain how it works so a user can audit it). Run a real-world PDF corpus regression check across the slice 8–10 redaction pipeline (small, licence-clean fixtures documented in `test/fixtures/README.md`) and record results. Choose and configure static hosting (GitHub Pages or Cloudflare Pages) and deploy.

## Acceptance criteria

- [ ] README documents the threat model, what's stored where (IndexedDB model, service-worker cache), and a devtools-based "nothing leaves the browser" verification walkthrough
- [ ] README explains the verification pass so a user can audit the guarantee
- [ ] Real-world PDF corpus regression run completed; results recorded; fixtures catalogued in `test/fixtures/README.md`
- [ ] Static hosting chosen, configured, and the app deployed and reachable
- [ ] Human sign-off on hosting choice and README wording

## Blocked by

- `.scratch/v1/issues/09-pdf-safety-checks.md`
- `.scratch/v1/issues/10-pdf-rasterise-fallback.md`
- `.scratch/v1/issues/11-offline-service-worker.md`
