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

A single self-contained Docker image (multi-arch Playwright base — Apple Silicon
+ amd64). Its entrypoint: `pnpm build → pnpm preview (background, 127.0.0.1) →
playwright test → propagate exit code`. The model downloads **inside** the
container. `pnpm test:e2e` is a thin build-and-run wrapper with one volume mount
for artifacts. Nothing persists; rerun = clean room. The first slice runs
**cold** (real HF download every run) to prove the download + consent path.

## Running it

`pnpm test:e2e` builds `Dockerfile` and runs the spec; the container exit code is
the gate. **It requires a GPU host** (see Status). Artifacts (downloaded output,
Playwright report/trace) are copied to `test/e2e/artifacts/` afterwards.

## Status

The harness is built and the whole flow is wired — build, `vite preview` under
cross-origin isolation, model download, drop, review, redact, download, and the
three-legged oracle. Cross-origin isolation in containerised headless Chromium is
proven (the issue-01 spike passed).

**The NER run requires a real GPU.** The production `q4f16` model runs only on the
WebGPU execution provider; a GPU-less host falls back to WASM/CPU, which lacks the
`GatherBlockQuantized` kernel, and software WebGPU lacks `shader-f16`. So the green
run happens on a **self-hosted GPU runner (RunPod, ephemeral GitHub Actions)** —
see the 2026-06-03 correction in
[ADR 0003](../../docs/adr/0003-local-ephemeral-docker-e2e-pii-recall.md) and issues
04 (runner) and 05 (pod WebGPU spike). Container fixes already baked in:
`--disable-dev-shm-usage` + `--shm-size=2g`; `vite preview --host 127.0.0.1`.

Then: PDF Samples, more categories, Exclude/Dismiss paths, model caching on the pod
(issue 03). See `.scratch/e2e-verification/issues/`.
