# NER detection layer in the worker

Status: ready-for-human

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Add the second detection layer so the text path reaches full v1 coverage — natural-language PII the regex layer can't catch.

Inside the existing Web Worker, run the OpenAI privacy-filter model via transformers.js v4 (ONNX) with WebGPU acceleration and a WASM fallback, emitting the `PERSON`, `ADDRESS`, and `ACCOUNT_NUMBER` Categories. Merge NER Spans with regex Spans through the existing overlap-merge (higher-confidence wins) so both layers feed one canonical Span list. Detection now genuinely depends on the model being present (gated by slice 6).

## Acceptance criteria

- [ ] Worker loads the model and runs inference off the UI thread — **load path verified live (worker fetches from HF, off UI thread); inference pending device smoke**
- [ ] `PERSON`, `ADDRESS`, `ACCOUNT_NUMBER` Items appear in the review list with correct Tokens — **pending device smoke** (mapping/offsets unit-tested)
- [ ] WebGPU is used when available; WASM fallback works when it is not — **selection logic implemented (adapter probe → WASM); needs a WebGPU machine to confirm both paths**
- [x] NER Spans merge with regex Spans (no duplicate/overlapping redactions) — cross-layer merge unit-tested
- [x] Detection does not run until the model is `MODEL_READY` — App renders the gate until ready; the dropzone (and thus `detect`) only exists post-ready
- [x] Smoke test: a short fixture string with known-good detections returns the expected entities (not a model-quality benchmark) — `src/detection/nerSpans.test.ts` (logic layer; device-level smoke pending)

## Blocked by

- `.scratch/v1/issues/06-model-gate.md`
- `.scratch/v1/issues/02-regex-category-set.md`

## Comments

### Code implemented — awaiting real-environment smoke (2026-05-29, agent)

Scope broadened per decision: the model's **all 8** labels are mapped (not just 3) —
`private_person→PERSON`, `private_address→ADDRESS`, `account_number→ACCOUNT_NUMBER`,
`private_email→EMAIL`, `private_phone→PHONE`, `private_url→URL`, `private_date→DATE`,
`secret→SECRET`. `SSN`/`CREDIT_CARD`/`IBAN`/`IP` stay regex-only. Quantization: `q4` (~770 MB).

Implemented: `detection/nerSpans.ts` (pure mapping/offsets/confidence + tests), `detection/ner.ts`
(transformers.js loader, WebGPU adapter-probe→WASM fallback, `detectNer`), `patterns.ts`
(`regexScoredSpans` split), unified `detector.worker.ts` (owns the model; multiplexes
load/clear/detect) + `detector.ts` `createModelWorker()` (gate client proxied to the worker, real
cancel via worker replacement), App wired to the unified worker, Vite `optimizeDeps.exclude`.

Verified: tsc clean; 81 unit tests (NER mapping/offsets/confidence, cross-layer merge, gate reducer);
production build bundles worker + transformers.js + ORT WASM. Live (headless, no GPU): worker boots,
loads transformers.js + ONNX-Runtime, fetches `config.json` from HF with no errors, gate →
`downloading`, `beforeunload` fires during download; `onnx/model_q4.onnx` confirmed to exist on HF.

**Pending (human, WebGPU desktop):** download the model through the gate and drop a `.txt` containing
a name + address + email; confirm `PERSON`/`ADDRESS`/`EMAIL` Items appear with correct Tokens and line
locators, regex+NER overlaps don't double-redact, and both WebGPU and WASM paths work. The open risk is
whether transformers.js v4.2.0 fully supports `openai/privacy-filter`'s architecture at load+inference.
