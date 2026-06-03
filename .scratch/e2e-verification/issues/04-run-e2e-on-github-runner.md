# Run the E2E container on a GitHub runner (custom model-bearing image)

Status: wontfix

## Parent

E2E PII-recall verification. Charter + design in `test/e2e/README.md`; the
local-only-for-now stance is [ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md).

## What to build

ADR 0003 keeps the E2E local-only because a 772 MB model download per run blows
the GitHub Actions free-tier egress. Make it CI-viable by removing the per-run
download from the critical path: build a **custom Docker image extending the
Playwright base with `openai/privacy-filter` pre-baked in** (the warm cache,
packaged into the image), published to a registry. The runner then pulls an image
that already has the model — no HF fetch on the critical path, no free-tier
egress per run.

This is the convergence of the persistent-cache idea (issue 03) and CI: pre-baking
the model into the image *is* the warm cache. Open question to resolve when picked
up: where transformers.js reads pre-baked weights from (seed the
`transformers-cache` at image-build time, or serve a local mirror via an
`env.remoteHost` override) and whether a model-bearing image fits the free-tier
storage/runner constraints — may need a self-hosted runner.

## Acceptance criteria

- [ ] A custom multi-arch image extends the Playwright base with the pinned-revision model pre-baked in
- [ ] A run against that image performs **no** HF model download on the critical path
- [ ] A GitHub Actions workflow runs the E2E against that image and gates on its exit code
- [ ] Free-tier / runner constraints assessed and documented (self-hosted runner if required)

## Blocked by

Issue 03 (persistent pinned cache) — pre-baking is the packaged form of the warm cache.

## Comments

### 2026-06-03 — wontfix: superseded by the RunPod GPU runner

The premise here — run on a **GitHub-hosted (free) runner**, just remove the model
download from the critical path — was overturned by the GPU finding in the
2026-06-03 ADR 0003 correction. A free GitHub runner has **no GPU**, so `q4f16`
can't run on it at all, model-bearing image or not; pre-baking only solves egress,
not the missing WebGPU/`shader-f16` path. The e2e now runs on a self-hosted RunPod
GPU runner — see `04-self-hosted-gpu-runner-runpod.md` (wired 2026-06-03).

The salvageable half — pre-baking / warm-caching the pinned model so runs don't
cold-download — lives on in **issue 03**, now scoped to the RunPod runner's cache
(network volume) rather than a GitHub-runner image.
