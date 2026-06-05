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

## Addendum (2026-06-03): `E2E_GPU_MAC` — native macOS dev escape hatch

RunPod (above) remains the **canonical, CI** home for this gate — that is the
ultimate target and nothing here changes it. But the WebGPU constraint also blocks
the obvious local check on a Mac dev box: Docker Desktop on macOS doesn't pass the
host GPU into the Linux container, so the Docker path falls back to the CPU/WASM
provider and q4f16 fails to load — the same failure as a GPU-less Linux host, for a
different reason (no passthrough rather than no GPU).

The Mac itself *does* have a capable GPU (Metal) — it's only unreachable from
inside the container. So we added a **host-native** path that bypasses Docker:
`pnpm test:e2e:local` (`run.sh --local`) runs Playwright directly against the host
Chromium with **`E2E_GPU_MAC=1`**. That env gate, in `playwright.config.mjs`, adds
the macOS WebGPU flags (`--use-angle=metal`, `--use-gl=angle`,
`--enable-unsafe-webgpu`, `--enable-gpu`, `--ignore-gpu-blocklist`), and headless
Chromium then acquires a hardware Metal-backed WebGPU adapter with `shader-f16`.
Verified green on Apple Silicon: the real q4f16/WebGPU path loads, NER produces
spans, and the three-legged oracle passes.

Scope: **dev convenience, not a CI path.** It is parallel to — and independent of —
the Linux `E2E_GPU` (Vulkan) flags the RunPod runner sets; the two gates don't
interact. It lets a developer exercise the real model path on a Mac without
standing up a GPU pod, but the authoritative gate is still the RunPod container.

## Decision (2026-06-06): the native local run is the gate; RunPod CI is deferred

The two corrections above explored automating this in CI on a self-hosted RunPod
GPU runner and made that the "authoritative" target, demoting the native Mac run to
a "dev convenience escape hatch." We are **reverting to this ADR's original stance**:
the gate is **local and human-run**, invoked via `pnpm test:e2e` before a release.
It is not in CI.

What changed and why: the RunPod runner was wired but never verified — the hardware
WebGPU/`shader-f16` adapter on the pod (issue 05) and a green oracle on the
q4f16/Vulkan path (issue 04) were never confirmed, and the automation depends on an
external worker repo + provisioning that isn't in place. Meanwhile the **native Mac
run is verified green** and exercises the exact production q4f16/WebGPU path. Rather
than carry half-wired, unverifiable CI on the branch, we ship the working local gate
now and keep the GPU-CI ambition as a roadmap item.

The WebGPU finding from the corrections above **still stands** — q4f16 needs a
hardware WebGPU adapter, so any future CI home must be a GPU host. That work
(RunPod runner + pod WebGPU spike + model cache) moves to the backlog:
`.scratch/e2e-verification/issues/` (issues 04, 05, 03). The `.github/workflows/e2e.yml`
workflow and the candidate Linux/`E2E_GPU` Vulkan flags have been removed from the
branch — their design is preserved in those issues. The Mac/`E2E_GPU_MAC` flags are
no longer an "escape hatch" but the gate's normal, only path.
