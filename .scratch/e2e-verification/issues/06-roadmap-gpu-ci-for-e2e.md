# Roadmap: run the e2e PII-recall gate in CI on a GPU

Status: ready-for-human

## Summary

The e2e PII-recall gate currently runs **locally and by hand** (`pnpm test:e2e`,
native + Metal WebGPU on Apple Silicon — verified green). This issue is the
umbrella roadmap item for the next step: running that same gate **automatically in
CI**, so releases are gated without a human remembering to run it.

This is deferred, not abandoned. It's a real future improvement, just not on the
critical path for shipping the local gate.

## Why it isn't done now

The production `q4f16` model runs **only on the WebGPU execution provider** (the
WASM/CPU EP lacks the `GatherBlockQuantized` kernel; software WebGPU lacks
`shader-f16`). So CI must run on a **GPU host** — GitHub's free runners are
GPU-less and can't run the model at all. A self-hosted RunPod GPU runner was wired
on this branch but never verified (no provisioned pod, depends on an external worker
repo), so it was removed from the branch and folded into this roadmap. The removed
`.github/workflows/e2e.yml` and the candidate Linux/Vulkan Chromium flags are
preserved in issue 04 as design-of-record. Rationale: the 2026-06-06 decision in
[ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md).

## Definition of done

- [ ] The e2e oracle runs in CI on a GPU host and gates on its exit code
- [ ] It exercises the real `q4f16`/WebGPU path (hardware adapter with `shader-f16`)
- [ ] No per-run cold model download on the critical path (served from a cache)
- [ ] Secrets handled via GitHub/RunPod, never committed; runners are ephemeral per job

## Implementation sub-issues (do in order)

1. **[05 — pod WebGPU spike](05-gpu-pod-webgpu-spike.md)** — de-risk first: confirm
   headless Chromium on the pod gets a hardware WebGPU adapter advertising
   `shader-f16` while staying cross-origin isolated. Record the working Vulkan flags.
2. **[04 — self-hosted RunPod GPU runner](04-self-hosted-gpu-runner-runpod.md)** —
   restore the runner automation + the verified flags, get the oracle green.
3. **[03 — persistent pinned model cache](03-persistent-pinned-model-cache.md)** —
   serve the model from a network-volume cache so runs don't cold-download.

## Out of scope / superseded

- [04 — run on a GitHub (free) runner](04-run-e2e-on-github-runner.md) — `wontfix`;
  a free runner has no GPU, so a model-bearing image doesn't help.
