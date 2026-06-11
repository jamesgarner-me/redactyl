# Lenient gated intake — warning modal + cap of 10

Status: ready-for-agent

## Parent

Grilling session on multi-file upload/redaction/download. See the "lenient, gated intake" consequence in `docs/adr/0005-multi-file-batch-redaction.md`.

## What to build

Replace slice 01's silent handling of unsupported files with a **lenient, gated** intake: assess every file in a drop/selection up front, then warn the user about what will be left out before any processing begins.

On intake, partition the dropped files into supported (`.pdf`, `.txt`, `.md`, `.csv`) and the rest, and apply a soft cap of **10** Documents per Batch (over-cap supported files are excess). Then:

- If there is **nothing to leave out** (all supported and within the cap), proceed straight into analysing with **no modal** — no interruption.
- If some files would be **skipped** (unsupported and/or over-cap), show a **warning modal** that enumerates them under a clear "these won't be included" message — listing unsupported files and over-cap files together as one unified skip list — with a primary **"Continue with N file(s)"** and a secondary **"Cancel"**. Continue starts the Batch with the supported, in-cap files; Cancel adds nothing and returns to the dropzone so the user can re-pick.
- If **every** file is unsupported (nothing processable), do **not** show the warning modal — fall back to the existing dropzone error state ("None of these are supported. Redactyl handles .pdf, .txt, .md and .csv.").

The cap (10) and the messaging strings are tunable defaults.

## Acceptance criteria

- [ ] All-supported, within-cap drops proceed to analysing with no modal
- [ ] A mixed drop (some unsupported and/or over the cap of 10) shows a warning modal listing every skipped file under one unified message, with "Continue with N file(s)" and "Cancel"
- [ ] Continue starts the Batch with only the supported, in-cap files; Cancel adds nothing and returns to the dropzone
- [ ] Over-cap supported files beyond 10 are listed as skipped in the same modal
- [ ] An all-unsupported drop shows the dropzone error, not the modal
- [ ] Unit tests cover the partition/cap logic and each branch (silent proceed, gated warn, all-unsupported error)
- [ ] `tsc` clean; `pnpm lint` clean (0 errors/warnings introduced); full suite green

## Blocked by

- `.scratch/multi-file-batch/issues/01-batch-sequential-loop.md`
