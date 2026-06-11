# Zip bundling — "Save all" redacted outputs

Status: ready-for-agent

## Parent

Grilling session on multi-file upload/redaction/download. See `docs/adr/0005-multi-file-batch-redaction.md` and the **Batch** term in `CONTEXT.md`.

## What to build

Give a completed **Batch** a single download: all redacted outputs zipped in-browser into one archive, offered as a "Save all" action on the receipt, while the per-file ↓ saves from slice 01 stay available.

Add a small in-browser zip dependency (e.g. `fflate`) — no backend, must keep working under cross-origin isolation (`COOP`/`COEP`), so the build and `pnpm preview` stay green. The receipt's "Save all" zips every succeeded redacted output and triggers one download named `my-redacted-documents-YYYYMMDD.zip`, where `YYYYMMDD` is the local date at save time (e.g. `my-redacted-documents-20260612.zip`). Files inside the zip use their `redactedName` output names; if two inputs would collide on name inside the zip, disambiguate deterministically (e.g. a numeric suffix) so nothing is silently dropped.

Mappings are **not** part of this zip — they are handled separately in slice 03.

## Acceptance criteria

- [ ] An in-browser zip library is added; `pnpm build` and `pnpm preview` remain cross-origin-isolated and green
- [ ] The receipt offers a "Save all" that downloads `my-redacted-documents-YYYYMMDD.zip` (local date) containing every succeeded redacted output
- [ ] Per-file ↓ saves from slice 01 still work alongside "Save all"
- [ ] Duplicate output names within the zip are disambiguated deterministically; no file is dropped
- [ ] A Batch of one still offers the per-file save; "Save all" of one file produces a valid single-entry zip
- [ ] Unit tests cover zip assembly (entry set, names, collision disambiguation) and the dated filename
- [ ] `tsc` clean; `pnpm lint` clean (0 errors/warnings introduced); full suite green

## Blocked by

- `.scratch/multi-file-batch/issues/01-batch-sequential-loop.md`
