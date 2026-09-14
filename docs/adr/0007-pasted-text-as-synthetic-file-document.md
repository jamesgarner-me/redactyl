# Pasted text as a synthetic-File Document

We let users **Paste** text directly — via the clipboard or by typing — instead of opening a file. Rather than introduce a distinct "snippet" concept with its own detection, redaction and naming rules, we model pasted text as an ordinary text/CSV **Document**: the pasted string is wrapped in an in-memory `File` (`pasted-text.txt`) and run through the existing `createDocumentOpener`. The opener's extension dispatch and `looksLikeCsv` sniff, the Document seam, review, redaction, the Mapping sidecar and the receipt are all reused verbatim. From **Detect** onward, a paste is indistinguishable from an opened `.txt`.

## Considered options

- **A distinct `Snippet` concept and code path.** Rejected: it would duplicate the Document seam (locate/redact/allowMapping), fork `App`'s screen flow at review and redact, and re-implement naming — all to model something that behaves exactly like a text file once its bytes exist. It also widens the language for no user-visible gain.
- **Call `createTextDocument` directly, bypassing the opener (as the `?demo` path does).** Rejected once we decided pasted tabular data should behave like a misnamed `.txt` upload: skipping the opener skips `looksLikeCsv`, so a pasted CSV table would redact as plain text — losing cell-boundary-safe redaction and the name-column refinement of the CSV adapter ([ADR 0004](./0004-csv-cell-flattening-for-detect.md)).
- **Wrap the paste in a synthetic `File` and reuse the opener.** Chosen. One dispatch site, one sniff, one seam.

## Consequences

- **Synthetic identity.** Pasted text has no filename, so it is given one: `pasted-text.txt` → `pasted-text.redacted.txt`. A pasted table that passes the sniff opens as a **CSV** Document but keeps the same `.txt` identity on save, exactly like a sniffed `.txt` file (ADR 0004).
- **Copy is gated on the output, not the source.** Because a paste becomes an ordinary Document, the receipt cannot (and need not) tell paste from file. "Copy redacted text" is offered whenever the redacted output is text-based (`blob.type` starts with `text/`, i.e. `text/plain` or `text/csv`), which also benefits file-opened text. PDF output (`application/pdf`) is never copyable.
- **The faked `File` is deliberate, not accidental.** A reader encountering `new File([text], 'pasted-text.txt')` might assume it is a workaround; it is the whole point — it collapses paste onto the file pipeline so no second path can drift.
- **Sniff-failure parity with `.txt`.** A pasted string that looks tabular but fails to parse follows the same fail-open behaviour as a misnamed `.txt`: the opener's `.txt` branch runs `looksLikeCsv` then `createCsvDocument`, and a hard parse failure there surfaces as the opener's generic read error rather than a review screen. This matches file behaviour rather than introducing a paste-specific case.
