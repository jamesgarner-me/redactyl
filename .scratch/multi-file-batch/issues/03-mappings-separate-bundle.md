# Mappings as a separate bundle

Status: ready-for-agent

## Parent

Grilling session on multi-file upload/redaction/download. This realises the "Mappings packaged separately" consequence in `docs/adr/0005-multi-file-batch-redaction.md`.

## What to build

Collect the opted-in **Mapping** sidecars from across a **Batch** into their own archive, packaged **separately** from the redacted-outputs zip — so a leaked redacted bundle never contains the key to reverse it.

The save-mapping decision stays **per Document** (each text/CSV review opts in independently via `ReviewScreen`; PDFs never offer it — `allowMapping` is per Document and unchanged). When at least one Document in the Batch produced a Mapping, the receipt offers a distinct download, `my-redacted-documents-mappings-YYYYMMDD.zip` (local date), containing only those Mappings — never the redacted outputs, and never co-located in the redacted-outputs zip from slice 02. The existing re-identification warning copy ("Anyone with this file can reverse the redaction") carries over to this bundle. If no Document opted in, no mappings download is shown.

Mapping entry names inside the zip mirror the per-Document mapping names; collisions are disambiguated deterministically as in slice 02.

## Acceptance criteria

- [ ] Per-Document save-mapping is retained (text/CSV opt-in; PDF never offers it); no batch-wide toggle
- [ ] When any Document opted in, the receipt offers `my-redacted-documents-mappings-YYYYMMDD.zip` (local date) containing only those Mappings
- [ ] The mappings bundle is always separate from the redacted-outputs zip — they are never combined into one archive
- [ ] The re-identification warning is shown alongside the mappings download
- [ ] No mappings download appears when no Document opted in
- [ ] Mapping entry-name collisions within the zip are disambiguated deterministically
- [ ] Unit tests cover: mappings-only contents, separation from the outputs zip, and the opted-in/none cases
- [ ] `tsc` clean; `pnpm lint` clean (0 errors/warnings introduced); full suite green

## Blocked by

- `.scratch/multi-file-batch/issues/02-zip-bundle-save-all.md`
