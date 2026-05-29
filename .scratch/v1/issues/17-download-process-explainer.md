# 'How does this process work?' explainer on the model download screen

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Screen-by-screen` section, screen 1 ("Model gate"), *Downloading* bullet.

## What to build

The `downloading` state of the model gate currently shows a progress card and nothing else — a captive moment with nothing for the user to read. Add two new pieces of UI on that screen to explain what the 770 MB is for and to honestly disclose the model's limitations, without disturbing the `missing` / `error` / `probing` states.

**Pinned disclaimer (always visible during download)**

A small visually-demarcated notice rendered as a blockquote, attributed to the model authors so the warning carries their credibility, not ours:

> "Privacy Filter is a redaction and data minimization aid, not an anonymization, compliance, or a safety guarantee."
> — OpenAI Privacy Filter model card

The quoted phrase links to the HuggingFace model card. The disclaimer sits at the **same DOM level as the progress card** (not inside the collapsible panel below it) so a user who collapses the panel cannot collapse the disclaimer away. Styled with `--border` + a subtle icon; never colour-only.

**Explainer panel (`<details>`, default open)**

Labeled "How does this process work?". Contents:

1. **Pipeline diagram** — vertical flow of seven stages rendered as DOM nodes (no SVG asset, no image): `File → Extract → Detect (Regex + NER) → Review → Redact → Verify → Output`. `Detect` is a compound node visibly containing `Regex` and `NER` sub-nodes. The `NER` sub-node uses `--accent` and an inline text label ("downloading now"); colour is not the only carrier of that signal. All other nodes use neutral surface tokens (`--surface-2`, `--border`).
2. **Short model description** — two sentences explaining what the model is (token classification trained to identify personal data; runs entirely in this browser via WebGPU when available, WASM otherwise).
3. **Definition list** — four facts, exact wording: `Model: openai/privacy-filter` · `Detects: people, addresses, account numbers` · `Runtime: in this browser` · `Size: 770 MB (quantised)`.

Implementation note: extract the new UI into `src/ui/ProcessExplainer.tsx` so `ModelGate.tsx` stays small. The component is rendered conditionally inside the `downloading` branch of `ModelGate.tsx`; the other states are unchanged.

## Acceptance criteria

- [ ] Disclaimer blockquote appears on the `downloading` state, *outside* the `<details>` panel, and remains visible whether or not the panel is collapsed
- [ ] Disclaimer quote text matches the wording above verbatim; the phrase is linked to the OpenAI Privacy Filter HuggingFace model card
- [ ] `<details>` panel renders open on first display; the user can collapse it and the collapse state persists during the rest of the download
- [ ] Pipeline diagram renders the seven stages in vertical order, with `Detect` showing `Regex` and `NER` as sub-nodes
- [ ] The `NER` sub-node is visually distinguished using `--accent` **and** an accompanying text affordance ("downloading now") — the highlight does not rely on colour alone
- [ ] The diagram region carries an `aria-label` that describes the flow in prose
- [ ] All new copy honours `CONTEXT.md` vocabulary — uses **Detect** / **Item** / **Token** correctly; does not invent new terms
- [ ] No new outbound runtime calls: the model-card link opens on click only (no prefetch, no analytics)
- [ ] `probing`, `missing`, and `error` states are visually identical to before the change (regression check)
- [ ] Unit / DOM test asserts (a) the disclaimer string is present in the rendered `downloading` state, (b) the disclaimer is *not* nested inside the `<details>` element, (c) the seven pipeline stages are present in order

## Blocked by

None — can start immediately.
