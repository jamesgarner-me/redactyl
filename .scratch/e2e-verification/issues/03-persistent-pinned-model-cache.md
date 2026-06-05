# Persistent pinned model cache for the E2E harness

Status: ready-for-human

## Parent

E2E PII-recall verification. Charter + design in `test/e2e/README.md`; rationale in
[ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md). Came
from the grilling session that fixed the ephemerality split.

## What to build

The slice runs **cold** — re-downloading the 772 MB `openai/privacy-filter` model
from the HF CDN on every run. That's deliberate for the slice (it proves the
download + consent path), but it's slow, bandwidth-heavy, and network-flaky for a
gate run repeatedly before releases.

Split ephemerality so it's warm by default: keep the app build, browser profile,
and all detection/redaction *result* state clean-room every run, but **persist the
model weights in a revision-pinned Docker volume** (the browser's
`transformers-cache`). First run downloads; subsequent runs mount the cache and
start in seconds. Pin the model **revision** so "cached" can't drift.

Add a `--cold` flag that wipes the cache volume to deliberately exercise the real
HF download + consent path on demand (e.g. once per release).

## Acceptance criteria

- [ ] Default `pnpm test:e2e` reuses a persisted, revision-pinned model cache; a warm run does not re-download the model
- [ ] `pnpm test:e2e --cold` wipes the cache and forces a real HF download, exercising the consent/download path
- [ ] Everything except the model bytes remains ephemeral per run (clean-room results)
- [ ] The pinned revision is a single named constant, documented in `test/e2e/README.md`

## Blocked by

The text slice (issue 02) — needs the working cold harness first.

## 2026-06-06 — deferred to roadmap; folds into the RunPod GPU-CI item

Re-scoped from `ready-for-agent` to `ready-for-human` and deferred. The original
"Docker volume cache" framing was for an ephemeral container path that no longer
exists — the gate now runs natively (`pnpm test:e2e`), where the host's HF
`transformers-cache` is already warm across runs, so cold re-download isn't a pain
point locally. The warm-cache problem only resurfaces for the deferred RunPod runner
(ephemeral workers ⇒ a network-volume cache), so this folds into issue 04's roadmap
rather than standing alone.
