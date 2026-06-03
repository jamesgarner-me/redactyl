# Self-hosted GPU runner (RunPod) with ephemeral GitHub Actions registration

Status: ready-for-human

## Parent

E2E PII-recall verification. The GPU requirement and pivot are recorded in the
2026-06-03 correction to
[ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md).

## Why

The production model variant `q4f16` runs only on the WebGPU execution provider; a
GPU-less host can't run NER at all (see issue 02's finding). Verifying recall on
anything but the real q4f16/WebGPU path would not test what users run. So the E2E
runs on a GPU, hosted as a self-hosted **ephemeral** GitHub Actions runner on a
RunPod GPU pod.

## What to build

- A persistent RunPod pod on a CUDA base image, with the **NVIDIA driver + a
  Vulkan ICD + nvidia-container-toolkit** so headless Chromium can obtain a
  hardware WebGPU adapter (CUDA alone is not sufficient — transformers.js uses the
  browser's WebGPU, not CUDA).
- The GitHub Actions runner installed inside, registered with `--ephemeral`, and
  auto-registering on boot via a startup script / RunPod template.
- A workflow that runs the existing E2E image (`test/e2e/Dockerfile`) on this
  runner with GPU access and the Vulkan/GPU Chromium flags from the spike, gating
  on the container's exit code.
- The 772 MB model cached on the pod's persistent disk (converges with the
  warm-cache work, issue 03) so runs don't cold-download each time.

## Acceptance criteria

- [ ] A RunPod pod boots and auto-registers an `--ephemeral` GitHub Actions runner
- [ ] Headless Chromium on the pod gets a hardware WebGPU adapter with `shader-f16` (verified by issue 05)
- [ ] A workflow runs the E2E image on the runner and the three-legged oracle passes on the real q4f16/WebGPU path
- [ ] The model is served from the pod's cache, not cold-downloaded per run
- [ ] Runner registration is ephemeral (fresh per job); secrets handled via GitHub/RunPod, not committed

## Blocked by

- Issue 05 (pod WebGPU spike) — de-risk hardware WebGPU + shader-f16 before building the automation.

## Comments

### 2026-06-03 — runner wiring landed; two design pivots from "What to build"

The runner config is built in the `worker-github_runner` repo (cloned alongside
this one) and the consuming workflow is in `.github/workflows/e2e.yml`. Two
deliberate departures from the original plan above:

- **Serverless endpoint, not a persistent pod.** The worker stays a RunPod
  *serverless* worker: each job boots a worker that registers one ephemeral
  runner, runs the e2e, then exits. Matches ADR 0003's ephemeral principle and
  only bills per run. (Trade-off: warm model cache now needs a network volume,
  not local disk — folds into issue 03.)
- **Playwright runs directly on the runner, not the nested `test/e2e/Dockerfile`.**
  Avoids docker-in-docker + GPU passthrough on serverless. The runner image is
  rebased on the Playwright base (`v1.49.1-noble`) + Vulkan + Node/pnpm, and the
  workflow runs `pnpm build && playwright test` directly. `test/e2e/Dockerfile`
  remains the local-run path.

Changes made:
- `handler.py`: repo-scoped registration (personal repo can't use the org API) +
  `--ephemeral` + `runpod` label.
- `Dockerfile`: Playwright base + Vulkan loader + `NVIDIA_DRIVER_CAPABILITIES=all`
  (the graphics caps that inject the Vulkan ICD — the crux of the GPU path).
- redactyl: `e2e.yml` (boot-runner → self-hosted e2e) + `E2E_GPU`-gated candidate
  Chromium Vulkan flags in `playwright.config.mjs`.
- `worker-github_runner/docs/redactyl-runner.md`: endpoint env, secrets, build/push.

Acceptance criteria status: registration is repo-scoped + ephemeral and secrets
live on the RunPod endpoint / GitHub (not committed) — wired, unverified. The
remaining criteria (hardware adapter with `shader-f16`, oracle green on
q4f16/WebGPU, model served from cache) are all gated on **issue 05** + human
RunPod provisioning, so this stays `ready-for-human`. The candidate Vulkan flags
are a best guess for the spike to confirm, not verified hardware.
