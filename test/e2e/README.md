# End-to-end PII-recall verification

A full-stack, browser-driven gate that exercises the one thing the headless
[corpus regression](../fixtures/README.md) structurally cannot: the **NER layer's
recall** in a real runtime. It builds the app, serves it under the cross-origin
isolation headers `pnpm preview` sets, drives the real UI with Playwright,
downloads the real `openai/privacy-filter` model, redacts committed **Samples**,
and asserts the personal data is gone from the downloaded output.

It is a **local, human-run, pre-release gate** — not a CI check. See
[ADR 0003](../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md) for why
(772 MB/run vs the GitHub free tier).

> **Charter:** primarily **NER detection-recall** verification; secondarily a
> full-stack smoke test (UI + model + pipeline together). Samples are therefore
> weighted toward `PERSON`/`ADDRESS`/contextual PII that regex can't catch, with
> enough regex-detectable PII mixed in to exercise the cross-layer merge.

## Vocabulary

These are **test-infra** terms — they live here, not in `CONTEXT.md` (which is the
product glossary only). They reuse the existing corpus words **oracle** and
**leak** unchanged: one test vocabulary, two harnesses.

**Sample**:
The E2E unit — a committed `.txt` / `.md` **source document** plus its
**Manifest**. Distinct from a headless **corpus fixture** (same family, but
UI-level and recall-aware rather than pipeline-level). Source is committed and
frozen; AI may *assist authoring* the prose offline, but the test only ever
*reads* committed inputs — never generates live (a regression gate, not a fuzzer).
PDF Samples are rendered deterministically at test time from committed text via
the existing `pdf-lib` builders, so the no-binary-fixtures policy still holds.

**Manifest**:
A Sample's hand-verified ground truth: a list of entities, each
`{ value, category, expectDetect, token }`. Extends the corpus's `piiAbsent`
idea into per-entity, recall-aware truth. An entity with `expectDetect: false`
records a **known recall gap** — the oracle asserts it stays flagged as a gap, so
the corpus *documents* what NER misses rather than hiding it.

## The three-legged oracle

Per Sample, for each Manifest entity with `expectDetect: true`:

1. **Detected (recall)** — the entity was surfaced as an **Item** in the review
   UI (read via the row's accessible name, e.g. `getByLabel(/^Redact PERSON/)`).
   *The priority leg.*
2. **Absent (leak-free)** — its `value` does **not** appear in the downloaded
   output (read directly for text; re-extracted via pdfjs/pdftotext for PDF —
   the same oracle the corpus uses).
3. **Replaced** — the expected **Token** (`<PERSON_1>`, …) **is present** in the
   output, distinguishing a real redaction from "the value silently never made
   it in."

"Diff input vs output" is the *intent*; the *mechanism* is these manifest-based
assertions, not a blind textual diff (which is green on wrong removals and red on
correct ones).

## Topology

`pnpm test:e2e` (`run.sh`) runs Playwright **natively** against the host's
Chromium: `playwright install chromium → pnpm build → vite preview (127.0.0.1)
→ playwright test → propagate exit code`. The exit code is the gate. The model
downloads from the HF CDN on first run; artifacts (downloaded output, Playwright
report/trace) land in `test/e2e/artifacts/`. The first slice runs **cold** (real
HF download) to prove the download + consent path.

## Running it

```sh
pnpm test:e2e
```

One path, run by a human before a release. It needs a **hardware WebGPU adapter**:
the production `q4f16` model runs only on the WebGPU execution provider (the
WASM/CPU EP lacks the `GatherBlockQuantized` kernel; software WebGPU lacks
`shader-f16`). `run.sh` sets **`E2E_GPU_MAC=1`**, which makes `playwright.config.mjs`
launch Chromium with the macOS WebGPU flags — `--use-angle=metal`, `--use-gl=angle`,
`--enable-unsafe-webgpu`, `--enable-gpu`, `--ignore-gpu-blocklist` — so headless
Chromium acquires a hardware Metal-backed adapter advertising `shader-f16` and the
real q4f16 path runs.

**Verified green on Apple Silicon** (model loads on WebGPU, NER spans produced,
three-legged oracle passes). A GPU-less host falls back to WASM/CPU and the model
won't load — so this is, for now, a Mac dev-box gate.

## Status

The harness is built and green locally on Apple Silicon — build, `vite preview`
under cross-origin isolation, model download, drop, review, redact, download, and
the three-legged oracle all pass. Cross-origin isolation in headless Chromium is
proven (the issue-01 spike passed).

Next, within the local gate: PDF Samples, more categories, Exclude/Dismiss paths.

## Future: running this in CI on a GPU

To gate releases automatically rather than by hand, this needs to run in CI — but
on a **GPU host**, since `q4f16` can't run on GitHub's free GPU-less runners. The
explored approach (a self-hosted ephemeral GitHub Actions runner on a RunPod GPU
pod, with Linux/Vulkan Chromium flags rather than the Mac/Metal ones) is **deferred
to the backlog**, tracked in `.scratch/e2e-verification/issues/` (issue 04 — runner,
issue 05 — pod WebGPU spike, issue 03 — model cache). The candidate Vulkan flags and
runner wiring live in those issues, not in this branch.
