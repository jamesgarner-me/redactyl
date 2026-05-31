# Document interface + TextDocument adapter

Status: completed

## Parent

Architecture review candidate B — "the `Document` seam". Plan recorded in conversation; the new **Document** domain term is defined in `CONTEXT.md`.

## What to build

Introduce the **Document** seam and its first adapter, and route the **text** redaction path through it end-to-end — so a `.txt`/`.md` file still drops, analyses, reviews and redacts exactly as today, but every text-source-specific decision now lives behind the interface instead of branching in `App`.

The interface (the opened **Document**): exposes its `filename`, extracted `text` (the input to **Detect**), `allowMapping` (true for text), an optional `safetyWarning` (always absent for text), a `locate(item)` returning the line locator (`ln 12, 88`), and an async `redact(accepted, { saveMapping })` returning a result that is either success (output name + blob + optional **Mapping** sidecar) or a fail-closed failure (text never fails closed, but the result type is shared with the PDF adapter to come). The output-name helper (`notes.txt` → `notes.redacted.txt`) lives with the seam and is shared by future adapters.

`TextDocument` owns: line-locator construction, tokenisation → redaction → blob, and **Mapping** sidecar building when requested.

At this slice `App` may still branch PDF vs text — only the text branch is rerouted through `TextDocument`. The `ReviewBase` union and `makeLocator` stay until the opener slice.

This came from a grilling session that fixed three decisions: the Document owns the **full journey** (extract/locate/redact/capabilities), adapters are **stateful opened-document instances** carrying their own context, and the PDF verify deps are injected **at opener construction** (relevant from slice 02).

## Acceptance criteria

- [ ] A `Document` interface exists with `filename`, `text`, `allowMapping`, optional `safetyWarning`, `locate(item)`, and async `redact(accepted, { saveMapping })` returning a shared success/fail-closed result type
- [ ] `TextDocument` implements it: line locators, redaction, and Mapping sidecar on request — behaviour identical to the current text path
- [ ] The text drop → review → redact flow is routed through `TextDocument`; redacting a `.txt`/`.md` produces the same output (and same `.redactyl-mapping.json` when asked) as before
- [ ] Unit tests exercise `TextDocument` through the interface: locator output, redacted blob content, mapping present/absent per `saveMapping` — no React
- [ ] `tsc` clean; full suite green

## Blocked by

None - can start immediately
