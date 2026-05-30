# Security Policy

Redactyl is a privacy tool whose core promise is **fail-closed**: it should
never hand you a document that looks redacted but isn't, and it should never
send your document anywhere. Security reports that undermine either guarantee
are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately via GitHub's [private vulnerability
reporting](https://github.com/jamesgarner-me/redactyl/security/advisories/new)
("Report a vulnerability" under the repo's **Security** tab). This keeps the
report confidential until a fix is available.

When reporting, please include:

- A description of the issue and the guarantee it breaks.
- Steps to reproduce, ideally with a minimal sample document (with any real
  personal data removed — use synthetic PII).
- The browser and version, since the model runtime and PDF handling are
  browser-dependent.

## What counts as a vulnerability

High-priority classes, in line with the [threat model](./README.md#threat-model):

- **Incomplete redaction** — output where data that was marked for removal is
  still recoverable (e.g. left in PDF text, metadata, or an object stream).
- **A document produced that looks redacted but isn't** — any path that defeats
  the fail-closed verification pass.
- **Data egress** — anything that causes a document, or data derived from it, to
  leave the browser after the one-time model download.
- **Detection bypass that the UI presents as safe** rather than as a known
  limitation.

Detection *misses* on their own (a PII pattern not recognised) are a quality
issue, not a vulnerability — Redactyl states plainly that detection is an aid,
not a guarantee. File those as normal issues.

## Response

This is a personal open-source project, so responses are best-effort rather
than bound by an SLA. Expect an initial acknowledgement within about a week.
Fixes for confirmed fail-closed or egress issues are prioritised over features.
