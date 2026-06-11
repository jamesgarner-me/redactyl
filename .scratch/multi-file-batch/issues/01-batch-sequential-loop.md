# Batch tracer bullet — sequential loop + per-file saves

Status: ready-for-agent

## Parent

Grilling session on multi-file upload/redaction/download. Architecture recorded in `docs/adr/0005-multi-file-batch-redaction.md`; the new **Batch** domain term is defined in `CONTEXT.md`.

## What to build

The thinnest complete path through the app for **more than one file** — establishing the **Batch** as an orchestration layer over the existing single-`Document` pipeline, with no change to the `Document` seam, `ReviewScreen`, or the detector.

`FileDropZone` accepts multiple supported files (input gains `multiple`; drag-drop of several files works). `App` gains a **Batch**: an ordered set of the dropped Documents, a pointer to the active one, and the accumulated redacted outputs. The user works through the Batch **one Document at a time** — analyze → review → redact — and on redacting one file the Batch advances the pointer to the next and re-enters analyzing/review for it, exactly as the single-file flow does today. When the last file is done, the receipt lists **every** redacted output, each with its own ↓ save (the current single-blob receipt generalised to a list).

Scope guards for this slice (replaced by later slices, keep them simple here):

- Unsupported files in a drop are silently ignored; the warning modal + cap come in slice 05.
- A file that fails to open or redact may abort for now; skip-and-continue comes in slice 04.
- No zip yet; per-file saves only. The bundled "Save all" comes in slice 02.

A **Batch of one** must behave identically to today's single-file flow (same screens, same output name, same single receipt row + ↓ save).

## Acceptance criteria

- [ ] `FileDropZone` accepts multiple supported files via both the file picker and drag-drop
- [ ] `App` models a **Batch** (ordered Documents + active pointer + accumulated outputs); the screen flow loops analyze → review → redact across the Batch, one Document at a time, reusing `ReviewScreen` unchanged
- [ ] Each Document is detected and redacted independently — no cross-file Item grouping or token sharing
- [ ] The final receipt lists every redacted output with an individual ↓ save; output names follow the existing `redactedName` helper
- [ ] A Batch of a single file is indistinguishable from today's single-file flow (screens, output name, receipt)
- [ ] Unit tests cover the Batch advance logic (sequencing, pointer, accumulated outputs) without React; existing single-file tests stay green
- [ ] `tsc` clean; `pnpm lint` clean (0 errors/warnings introduced); full suite green

## Blocked by

None - can start immediately
