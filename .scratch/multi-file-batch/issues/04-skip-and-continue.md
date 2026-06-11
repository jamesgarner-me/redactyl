# Skip-and-continue failure handling

Status: ready-for-agent

## Parent

Grilling session on multi-file upload/redaction/download. See the "skip-and-continue" consequence in `docs/adr/0005-multi-file-batch-redaction.md`.

## What to build

Make a single failing file non-fatal to the **Batch**. Today a bad file fails the whole flow back to the dropzone; in a Batch the others must still produce output.

A file that fails to **open** (e.g. encrypted PDF — the existing open-time failure) or fails to **redact** (e.g. a PDF verification leak surviving rasterisation — the existing fail-closed redact outcome) is marked **failed** in the Batch and excluded from the output bundle; the loop continues to the next Document. Crucially, the PDF redact-time failure is **fail-closed**, so a quarantined file simply never enters the redacted-outputs zip — skipping it leaks nothing.

The receipt separates **succeeded** from **failed**: succeeded outputs keep their saves / "Save all", and a clearly distinct section lists each failed file with its reason (reusing the existing open/redact failure messages). If **every** file in the Batch fails, the receipt shows only the failure list (nothing to download).

## Acceptance criteria

- [ ] An open-time failure on one file marks it failed and the Batch continues with the rest
- [ ] A redact-time fail-closed outcome on one file marks it failed and excludes it from the bundle; the rest still bundle
- [ ] The receipt visibly separates succeeded outputs from a failed-files list, each failure showing its reason
- [ ] A quarantined PDF never appears in `my-redacted-documents-YYYYMMDD.zip` (no leak)
- [ ] An all-failed Batch shows the failure list and offers no download
- [ ] Unit tests cover: one open failure mid-Batch, one redact failure mid-Batch, and the all-failed case
- [ ] `tsc` clean; `pnpm lint` clean (0 errors/warnings introduced); full suite green

## Blocked by

- `.scratch/multi-file-batch/issues/01-batch-sequential-loop.md`
