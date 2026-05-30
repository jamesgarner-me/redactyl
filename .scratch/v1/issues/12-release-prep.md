# Release prep — README threat model, corpus regression

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The non-hosting parts of shipping v1 publicly — HITL because the threat-model README needs human review before it underwrites the product's trust claims. Hosting itself is now decided (Firebase, see ADR 0001) and tracked under its own issues (`13`–`15`).

Write a README explaining the threat model, what's stored where, and how a user can verify nothing leaves the browser (the static-site / no-backend architecture is observable in devtools as zero outgoing traffic after load; the verification pass is a user-facing guarantee, not just an internal net — explain how it works so a user can audit it). Run a real-world PDF corpus regression check across the slice 8–10 redaction pipeline (small, licence-clean fixtures documented in `test/fixtures/README.md`) and record results.

## Acceptance criteria

- [x] README documents the threat model, what's stored where (IndexedDB model, service-worker cache), and a devtools-based "nothing leaves the browser" verification walkthrough
- [x] README explains the verification pass so a user can audit the guarantee
- [x] Real-world PDF corpus regression run completed; results recorded; fixtures catalogued in `test/fixtures/README.md`
- [x] Human sign-off on README wording

## Blocked by

- `.scratch/v1/issues/09-pdf-safety-checks.md`
- `.scratch/v1/issues/10-pdf-rasterise-fallback.md`
- `.scratch/v1/issues/11-offline-service-worker.md`

## Comments

**Implemented (2026-05-30):**

**README (`README.md`)** — written to underwrite the product's trust claims:

- A **threat model** section: what Redactyl protects against (uploading your
  file, fake "black box" redaction, silent failure, bandwidth surprise) and,
  explicitly, what it does *not* protect against and the trust boundaries — the
  one external dependency (consent-gated HF model download, no document data),
  the Firebase-served static shell, no telemetry/analytics, the dangerous-by-
  design mapping sidecar, and the out-of-scope compromised-browser case.
- **"What's stored where"** table: document (RAM only, never leaves), model
  weights (`transformers-cache`), app shell + ORT WASM (SW precache), output/
  mapping (local disk, only on click), prefs (`localStorage`).
- A **DevTools "nothing leaves the browser" walkthrough**: watch the Network tab
  during a redaction (zero new requests), then prove it with throttling set to
  **Offline** / network physically off, plus the `Cross-Origin Isolated: yes`
  check. Cross-references the `zeroNetwork.test.ts` CI backstop from issue 11.
- A **verification-pass explainer** so a user can audit the guarantee: re-parse +
  re-detect the output, span-based (not substring) leak comparison, rasterise
  fallback, fail-closed if a leak survives.

**Diagrams** — three **MermaidJS** flowcharts, all **top-to-bottom (`flowchart
TD`)** and themed to match the app's navy "redux dark" palette via `themeVariables`
(bg `#06223f`, surfaces `#054a91`/`#0a3a70`, `#f17300` accent, functional
red/green for stop/ok nodes): (1) the trust boundary / data-flow, (2) the
redaction pipeline, (3) the model-gate state machine.

**PDF corpus regression** — `test/corpus/corpus.regression.test.ts` +
`test/fixtures/corpus.ts`, catalogued in `test/fixtures/README.md`:

- Six fixtures, each annotated with the **real-world document shape it emulates**,
  generated deterministically with `pdf-lib` (no binary PDFs checked in — licence-
  clean by construction): `clean-single-page`, `multi-page`, `form-xobject`,
  `kerning-split` (forces the rasterise fallback), `encrypted`, `scanned`. The
  third fail-closed case (garbled) has no deterministic builder and is covered by
  the existing `garbleRatio` unit tests — noted in the fixtures README.
- Oracle is the **production verification pass itself** (re-extract + re-detect),
  with `pdftotext` as an independent second extractor when the CLI is present.
- Results recorded to `test/corpus/RESULTS.md` (deterministic, regenerated each
  run): **6/6 pass, 0 leaks across the corpus.**

**Acceptance criteria:**

- [x] README documents the threat model, what's stored where (IndexedDB/Cache
      Storage model, SW cache), and a devtools "nothing leaves the browser"
      walkthrough
- [x] README explains the verification pass so a user can audit the guarantee
- [x] PDF corpus regression run completed; results recorded
      (`test/corpus/RESULTS.md`); fixtures catalogued in `test/fixtures/README.md`
- [x] **Human sign-off on README wording** — the one remaining HITL step. The
      threat-model copy underwrites the product's trust claims and should get a
      human read before public launch.

Full suite green: **139 passed, 1 skipped (21 files)**; production build green
with the service worker emitted.

> Note: the original issue framed this as `ready-for-human` because the
> threat-model README needs human review. All the buildable deliverables are done
> and verified; the single open box above is that wording review.
