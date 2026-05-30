# In-app disclosure of the HuggingFace CDN model download

Status: wontfix (subsumed by issue 20)

> **Superseded (2026-05-30):** the HuggingFace CDN disclosure is now delivered by
> [issue 20](20-purpose-intro-and-model-modal.md), which puts the disclosure in
> the model-download modal's describe-view as part of the consent decision. The
> requirement and its DOM-test acceptance criterion carry over there. Closing
> this to avoid two issues editing the same gate copy.

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — the product promise in `CONTEXT.md:3` ("nothing ever leaves the device") sits in tension with the runtime HuggingFace CDN fetch documented in the `### Hosting` section and [ADR 0001](../../../docs/adr/0001-browser-only-delivery-via-firebase-and-hf-cdn.md).

## What to build

Make the one outbound runtime call honest in the UI. The 770 MB NER model is fetched from the HuggingFace CDN on first use (`src/detection/ner.ts:8`); the model gate already gates this behind consent, but the current copy talks about size ("770 MB one-time download") without naming **where** the bytes come from. After the model is cached, the app makes no further network calls — that's the part of the promise that stays literally true and is worth saying.

Two small copy changes, no new screens:

1. **At the model gate (`MODEL_MISSING`):** add a one-line clarification under the existing privacy promise — "The model is downloaded once from huggingface.co (the only network request this app ever makes). After that, your files are processed entirely on this device."
2. **In the persistent top-bar status chip / settings sheet** (or wherever feels least cluttered — implementer's call): a small "How this works" link or info icon that expands the same explanation. Optional if (1) is enough — pick whichever keeps the chrome quiet.

No new dependencies, no analytics, no telemetry — that's the point.

## Acceptance criteria

- [ ] The model-gate `MODEL_MISSING` screen explicitly names HuggingFace as the source of the model download and states that it is the only outbound request the app makes
- [ ] The wording is reviewed against the `CONTEXT.md` vocabulary (use **Item** / **Occurrence** / **Token** correctly if any examples are added; do not invent new terms)
- [ ] No new dependencies introduced; no new outbound calls introduced
- [ ] Snapshot or DOM test confirms the disclosure string is present in the gate

## Blocked by

None — purely client-side; can ship before or after issues 13–15.
