# NER detection layer in the worker

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Add the second detection layer so the text path reaches full v1 coverage — natural-language PII the regex layer can't catch.

Inside the existing Web Worker, run the OpenAI privacy-filter model via transformers.js v4 (ONNX) with WebGPU acceleration and a WASM fallback, emitting the `PERSON`, `ADDRESS`, and `ACCOUNT_NUMBER` Categories. Merge NER Spans with regex Spans through the existing overlap-merge (higher-confidence wins) so both layers feed one canonical Span list. Detection now genuinely depends on the model being present (gated by slice 6).

## Acceptance criteria

- [ ] Worker loads the model and runs inference off the UI thread
- [ ] `PERSON`, `ADDRESS`, `ACCOUNT_NUMBER` Items appear in the review list with correct Tokens
- [ ] WebGPU is used when available; WASM fallback works when it is not
- [ ] NER Spans merge with regex Spans (no duplicate/overlapping redactions)
- [ ] Detection does not run until the model is `MODEL_READY`
- [ ] Smoke test: a short fixture string with known-good detections returns the expected entities (not a model-quality benchmark)

## Blocked by

- `.scratch/v1/issues/06-model-gate.md`
- `.scratch/v1/issues/02-regex-category-set.md`
