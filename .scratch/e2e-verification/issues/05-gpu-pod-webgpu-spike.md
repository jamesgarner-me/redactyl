# Spike: hardware WebGPU + shader-f16 in headless Chromium on the GPU pod

Status: ready-for-human

## Parent

E2E PII-recall verification. The GPU-path requirement is the 2026-06-03 correction
to [ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md).
This is the GPU-path equivalent of the cross-origin-isolation spike (issue 01).

## What to build

A throwaway spike on the GPU pod that answers the scariest assumption of the GPU
pivot **before** any runner automation is built: can headless Chromium on the pod
obtain a **hardware WebGPU adapter advertising the `shader-f16` feature** (q4f16
requires f16), while still being cross-origin isolated? A CUDA base image is not
enough — this validates the NVIDIA driver + Vulkan ICD + nvidia-container-toolkit
+ Chromium Vulkan flags all line up.

Reuse the issue-01 spike harness shape: serve the real app via `vite preview`,
launch headless Chromium with the candidate GPU/Vulkan flags, and read the GPU
state from the page.

## Acceptance criteria

- [ ] On the pod, `navigator.gpu.requestAdapter()` returns a **hardware** adapter (not SwiftShader/software fallback)
- [ ] The adapter's features include `shader-f16`
- [ ] `self.crossOriginIsolated === true` still holds with the GPU flags
- [ ] Bonus: the full app actually loads the q4f16 model to `ready` (no GatherBlockQuantized error)
- [ ] The working Chromium GPU/Vulkan flags are recorded for issue 04

## Blocked by

- A provisioned RunPod GPU pod (the human-provisioning step in issue 04's environment).

## Comments

### 2026-06-03 — staged for verification by the runner config

The runner wiring (issue 04) is now built, which gives this spike a concrete
environment to run in rather than a bare pod:

- The runner image sets `NVIDIA_DRIVER_CAPABILITIES=all` — the graphics/display
  caps that let nvidia-container-toolkit inject the host's Vulkan ICD. This is the
  single most likely thing to be wrong, so **confirm it first**: a CUDA-only
  container (default `compute,utility` caps) will fail this spike outright.
- Candidate Chromium flags to validate live in redactyl's
  `playwright.config.mjs` behind `E2E_GPU=1`:
  `--use-angle=vulkan --enable-features=Vulkan --enable-unsafe-webgpu
  --ignore-gpu-blocklist`. These are a **best guess, not verified** — the whole
  point of this spike is to confirm/correct them. Record the working set back
  into `playwright.config.mjs` (acceptance criterion above).
- `vulkan-tools` is in the image, so `vulkaninfo` can confirm a hardware Vulkan
  device before even launching Chromium.

Still `ready-for-human`: needs a person to provision the GPU pod and eyeball the
adapter. This remains the gating prerequisite for a trustworthy green e2e.
