# Demo mode through the Document seam + dead-code cleanup

Status: ready-for-agent

## Parent

Architecture review candidate B — "the `Document` seam".

## What to build

Route demo mode (`?demo`) through the same seam and remove the last refactor remnants, so there is exactly one path into the review screen.

`loadSample` should produce a `TextDocument` from the embedded sample rather than constructing a bespoke review object, so the demo exercises the real `Document` interface (locate/redact included). Sweep for any helpers, types, or imports left orphaned by slices 01–03 and delete them.

## Acceptance criteria

- [ ] Demo mode builds a `TextDocument` and enters review via the same code path as a real text file (locate + redact work in demo)
- [ ] No orphaned helpers/types/imports remain from the refactor (`source`-era code fully gone)
- [ ] `tsc` clean; full suite green; no unused-export or dead-code warnings introduced

## Blocked by

- `.scratch/document-seam/issues/03-document-opener-collapse-branching.md`
