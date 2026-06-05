# Text-Sample E2E slice — full thread + three-legged oracle

Status: completed

## Parent

E2E PII-recall verification. Charter, vocabulary (**Sample**, **Manifest**), and
the three-legged oracle are in `test/e2e/README.md`; the local-only/cold-download
stance is [ADR 0003](../../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md).
De-risked by issue 01 (cross-origin isolation works in containerised headless
Chromium — green light).

## What to build

The thinnest complete thread through every layer: a single ephemeral Docker
container builds the app, serves it via `pnpm preview` (real COOP/COEP headers),
and Playwright drives the **real UI** — crosses the model gate with a **cold** HF
download of `openai/privacy-filter`, drops one committed `.txt`/`.md` **Sample**,
accepts all Items, redacts, and captures the downloaded output. The
three-legged, **Manifest**-based oracle then runs.

One **Sample**: a short committed `.txt`/`.md` source plus a **Manifest** of
~3–4 entities, **at least one `PERSON` or `ADDRESS`** so NER recall is genuinely
exercised (not just regex), with one regex-detectable entity (e.g. `EMAIL`) mixed
in to cover the cross-layer merge. Each Manifest entity is
`{ value, category, expectDetect, token }`.

The three-legged oracle, per entity with `expectDetect: true`:
1. **Detected** — surfaced as an Item in the review UI (read via the row's
   accessible name, e.g. `getByLabel(/^Redact PERSON/)`).
2. **Absent** — its `value` is not present in the downloaded output text.
3. **Replaced** — its expected `token` (`<PERSON_1>`, …) is present in the output.

`pnpm test:e2e` is a thin wrapper that builds the image and `docker run`s it with
one volume mount for artifacts; the container's exit code is the pass/fail gate.

Carry forward from issue 01: multi-arch Playwright base; install pnpm via
`npm install -g pnpm@<pinned>` (not corepack). Default **cold** (real download
each run) — the warm cache is issue 03.

## Acceptance criteria

- [ ] One committed text Sample (`.txt`/`.md`) + its Manifest live under `test/e2e/samples/`
- [ ] A Dockerfile (multi-arch Playwright base) builds the app, serves `pnpm preview`, and runs the Playwright spec; entrypoint propagates the spec's exit code
- [ ] The Playwright spec drives the real flow: crosses the model gate with a cold HF download, drops the Sample, accepts all, redacts, captures the downloaded output
- [ ] The three-legged oracle (detected → absent → replaced) passes for every `expectDetect: true` entity, including the `PERSON`/`ADDRESS` one
- [ ] An entity marked `expectDetect: false`, if present, is asserted to stay a flagged known gap (documented, not hidden)
- [ ] `pnpm test:e2e` builds + runs the container end-to-end; green exit gates pass, non-zero on any leak/miss
- [ ] `test/e2e/README.md` status updated to reflect the working slice

## Finding (2026-06-03) — NER needs a real GPU

The harness (Dockerfile, spec, config, `pnpm test:e2e`) is built and drives the
whole flow; the build, serve, cross-origin isolation, model download, drop, redact
and oracle plumbing all work. But the model can't load on a GPU-less host: the
production `q4f16` variant runs **only on the WebGPU EP** — the WASM/CPU fallback
hits `Failed to find kernel for com.microsoft.GatherBlockQuantized` and software
SwiftShader lacks `shader-f16`. So the green NER run must happen on a GPU runner.
See the ADR 0003 correction and issues 04/05. (Two container fixes found en route,
now baked into the harness: `--disable-dev-shm-usage` + `--shm-size=2g` for the
threaded-WASM runtime; `vite preview --host 127.0.0.1` for the readiness probe.)

## Blocked by

- Issue 05 (pod WebGPU spike) and issue 04 (GPU runner) — the three-legged oracle
  can only pass on the real q4f16/WebGPU path, which needs a GPU.

## Resolution (2026-06-06) — completed via the native Mac run, not Docker

The slice is **green**: spec, committed Sample + Manifest, and the three-legged
oracle all pass against the real q4f16/WebGPU path. The GPU blocker above was
resolved not by a GPU pod but by running Playwright **natively on the host** with
`E2E_GPU_MAC=1` (hardware Metal-backed WebGPU adapter) — see the ADR 0003 addendum
and `test/e2e/README.md`.

The Dockerfile/container acceptance criteria (build a multi-arch image, `docker run`
exit code as the gate) are **dropped**: Docker Desktop on macOS can't pass the GPU
into the container, so the Docker path never worked locally. The Dockerfile was
removed in the 2026-06-06 cleanup; `pnpm test:e2e` is now the native run. Running
the gate in CI on a GPU host is deferred to the roadmap (issues 04, 05, 03).
