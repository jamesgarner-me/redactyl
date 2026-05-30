# Text tracer bullet — scaffold + EMAIL regex, end-to-end

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The thinnest complete path through the whole app on a text file, establishing the project skeleton and the screen state machine for every later slice to extend.

Scaffold a Vite + React + TypeScript single-page app with Vitest. Stand up the App state coordinator and its screen flow (dropzone → analyzing → review → redacting → receipt) plus a minimal top bar. Wire `FileDropZone` to accept a **single** `.txt` or `.md` file. Run a `Detector` inside a single Web Worker that, for now, detects only the `EMAIL` Category. Feed accepted Items through `Tokeniser` (per-Category, first-appearance ordering) and `TextRedactor` (right-to-left replacement) to produce sanitised text. Show a basic `EntityReviewList` with all rows pre-checked, a `RedactButton`, and a receipt offering **manual save** (no auto-download) of the `.redacted.txt` output.

The Web Worker boundary is established here on purpose so later detection layers are purely additive inside the worker.

## Acceptance criteria

- [x] Project builds and runs via Vite; `vitest` runs the suite
- [x] Dropping a `.txt`/`.md` file containing emails moves through analyzing → review → redacting → receipt
- [x] Each unique email is one Item; repeated emails collapse and show an Occurrence count
- [x] Accepted Items are replaced with stable `<EMAIL_1>`, `<EMAIL_2>` … Tokens, numbered in first-appearance order
- [x] Detection runs in a Web Worker (UI thread is not blocked)
- [x] The receipt offers a manual `↓ save` of the output named `<basename>.redacted.txt`; nothing is written until the user clicks
- [x] Unit tests cover `Tokeniser` (ordering, per-Category counter) and a `TextRedactor` round-trip on the EMAIL case

## Blocked by

None - can start immediately
