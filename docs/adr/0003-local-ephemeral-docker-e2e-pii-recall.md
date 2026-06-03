# E2E PII-recall verification runs locally in ephemeral Docker, not in CI

The headless corpus regression (`test/corpus/`) proves the redaction *mechanics* are leak-free, but is **regex-only by construction** — the NER layer needs a real browser runtime, so the model's *recall* (does it actually find `PERSON`/`ADDRESS`-style PII that regex can't?) is never exercised by `pnpm test`. To close that gap we run a full-stack, browser-driven verification: a single self-contained Docker image (Playwright base, multi-arch) that builds the app, serves it under the COOP/COEP headers `pnpm preview` already sets, drives the real UI with Playwright, downloads the real `openai/privacy-filter` model, and asserts a three-legged, manifest-based oracle (detected → absent → token-present) over committed **Samples**.

We deliberately keep this **local-only and out of CI**: the 772 MB model download per run blows the GitHub Actions free-tier transfer budget, and a network-dependent fetch would make the pass/fail signal about the HuggingFace CDN rather than our code. It is a human-run pre-release gate, invoked via `pnpm test:e2e`, not a per-push check.

## Considered options

- **Run the E2E in GitHub Actions like every other check.** Rejected for now: the per-run model download exceeds the free-tier egress and makes the gate flaky on HF availability. Revisitable via a custom Playwright image with the model **pre-baked** (see the backlog), at which point a self-hosted or model-bearing runner makes CI viable.
- **Persist the model across runs (warm cache) for speed.** The intended steady state, but deferred: the first slice runs **cold** (real HF download every run) precisely to prove the download + consent path works end-to-end before optimising it away. Tracked as a backlog issue.
- **Skip E2E; trust the headless regression + unit tests.** Rejected: that is exactly the NER-recall blind spot this exists to cover.

## Consequences

- Ephemerality is split: app build, browser profile, and all detection/redaction *result* state are clean-room every run; only the model bytes are a candidate for future persistence. This keeps regression integrity while leaving room for the warm-cache optimisation.
- The "nothing leaves the device" product promise is unaffected — the only network call is the same consent-gated HF model fetch the app already makes.

## Correction (2026-06-03): run on a self-hosted GPU runner, not a GPU-less host

Building the text slice surfaced a hard constraint that overturns this ADR's
original "local-only, not CI" stance. The production model variant **`q4f16` runs
only on the WebGPU execution provider.** Headless Chromium without a GPU falls back
to the WASM/CPU provider, which has no kernel for the model's block-quantized
embedding op (`com.microsoft.GatherBlockQuantized`), so the model fails to load.
Software WebGPU (SwiftShader, `--enable-unsafe-swiftshader`) doesn't rescue it — it
lacks the `shader-f16` feature q4f16 needs. (This also means the app's own WASM
fallback is broken for any isolated-but-no-WebGPU browser — tracked separately.)

Verifying NER recall is the whole point, and testing it on a different dtype or a
CPU path would not test what users run. So the E2E **must run on a GPU with the
real q4f16/WebGPU path.** The chosen home is a **self-hosted, ephemeral GitHub
Actions runner on a GPU pod (RunPod)**: it now runs in CI, just not on GitHub's
free GPU-less runners. The ephemeral-per-run principle is unchanged; the model is
cached on the persistent pod's disk rather than cold-downloaded each run.

De-risk first (a spike, as with cross-origin isolation): confirm headless Chromium
on the pod obtains a **hardware WebGPU adapter advertising `shader-f16`** — this
needs the NVIDIA driver + a Vulkan ICD + nvidia-container-toolkit + the right
Chromium Vulkan flags, *not merely a CUDA base image* (transformers.js uses the
browser's WebGPU, not CUDA). See `.scratch/e2e-verification/issues/`.
