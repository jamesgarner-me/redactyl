# Complete the regex Category set + span merge

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Fill out the deterministic regex layer so the text path detects the full v1 regex Category set, flowing each new Category through detect → token → redact → save exactly like EMAIL already does.

Add Categories: `PHONE`, `URL`, `IP`, `DATE`, `SSN`, `CREDIT_CARD` (Luhn-validated), `IBAN` (mod-97 validated), and `SECRET` (AWS `AKIA…`, OpenAI `sk-…`, Anthropic `sk-ant-…`, Stripe live keys, generic `Bearer …`, JWT, PEM blocks). Because multiple Categories now overlap, add a span-merge step that dedupes overlapping Spans with higher-confidence wins. Accept a `customPatterns?: {category, pattern}[]` argument on the `Detector` interface from day one — no UI surface in v1.

## Acceptance criteria

- [ ] All listed Categories are detected and produce correct `<CATEGORY_N>` Tokens
- [ ] `CREDIT_CARD` matches pass Luhn; non-Luhn numbers are rejected
- [ ] `IBAN` matches pass mod-97; invalid checksums are rejected
- [ ] `SECRET` covers AWS / OpenAI / Anthropic / Stripe / Bearer / JWT / PEM formats
- [ ] Overlapping Spans are merged with higher-confidence wins (no double-redaction, no Token collisions)
- [ ] `Detector` accepts `customPatterns` and applies them, with no UI added
- [ ] Per-Category unit tests: known PII matched, known non-PII rejected, Luhn + mod-97 validation

## Blocked by

- `.scratch/v1/issues/01-text-tracer-bullet.md`
