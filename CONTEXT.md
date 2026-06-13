# Redactyl

A browser-only tool that finds personal data in PDFs, text files and CSV exports and produces a sanitised copy where the data is truly removed — nothing ever leaves the device.

## Language

**Document**:
The opened file the user is redacting — its extracted text together with whatever the source format needs to locate **Occurrences** and produce a sanitised copy. **Detect** runs on a Document's text; **Redact** produces a new Document of the same kind.
_Kinds_: **text** (`.txt` / `.md`), **CSV** (`.csv`, or tabular comma-separated content in a `.txt` file detected at open time — see [ADR 0004](./docs/adr/0004-csv-cell-flattening-for-detect.md)) and **PDF**. The kind decides how Occurrences are located (line vs row/column vs page). A sniffed `.txt` keeps its original filename on save (`contacts.txt` → `contacts.redacted.txt`) even though redaction uses the CSV cell adapter.
_Avoid_: file (the raw upload before extraction), input.

**Batch**:
An ordered set of **Documents** the user opened together in one go. The user works through them one Document at a time — each is **Detected**, reviewed and **Redacted** independently (no cross-Document grouping) — and the redacted outputs are taken away together. A Batch of one is just the single-file flow.
_Avoid_: queue, set, session, job.

**Cell**:
A single field in a **CSV** **Document** — one row/column intersection. The atomic unit for CSV occurrence location and redaction; **Detect** still runs on the Document's flattened `text`, but **Redact** replaces values inside Cells, not across cell boundaries.
_Avoid_: field, column value.

**Detect**:
Identify ranges of text that might be personal data, via a regex layer and an NER layer.

**Span**:
A single `{start, end, category, value}` range within the extracted text — one appearance of one piece of data. Internal term.
_User-facing alias_: **Occurrence**.

**Entity**:
A unique personal-data value, grouped across all the places it appears. The unit the user accepts or opts out of.
_User-facing alias_: **Item**.
_Avoid_: finding, match, thing.

**Occurrence**:
The user-facing word for a **Span** — one appearance of an **Item** in the document. Shown per row as `3×`.

**Item**:
The user-facing word for an **Entity** — one unique value the user decides on. The review headline counts Items ("13 items to redact").
_Avoid_: thing, finding.

**Category**:
The granular classification of a Span/Entity. The canonical set is: `EMAIL`, `PHONE`, `URL`, `IP`, `DATE`, `SSN`, `CREDIT_CARD`, `IBAN`, `ACCOUNT_NUMBER`, `SECRET`, `PERSON`, `ADDRESS`. Categories drive the replacement **Token** (`<SSN_1>`).

**Bucket**:
A display-only grouping of Categories used solely in the review summary strip. Buckets do **not** affect tokens or list rows, which stay granular.
- **ID** = `SSN` + `CREDIT_CARD` + `IBAN` + `ACCOUNT_NUMBER`
- **NETWORK** = `URL` + `IP`
- All other Categories map 1:1 to their own Bucket.

**Accept**:
The default state of an **Item** — its checkbox is checked and it will be redacted.

**Exclude**:
Unchecking an Item: "it IS PII, but skip it this run." The row stays visible (greyed), still counts toward its strip **Bucket**, and the headline "items to redact" drops by one. Reversible.

**Dismiss**:
Removing an Item via its `×`: "this is NOT PII." The row leaves the list, its Bucket count decrements, and it is recoverable via a footer "N dismissed · show" affordance. Distinct from **Exclude** in *intent* (false positive vs deliberate skip), though both leave the Item out of the output.

**Redact**:
Produce the sanitised output with every accepted **Item** replaced by its **Token**.
_Avoid (user-facing)_: **Strip** — "strip" refers only to the internal removal of text from a PDF content stream, never a user-facing concept.

**Token**:
The replacement string written into the output, shaped `<CATEGORY_N>` (`<EMAIL_1>`, `<PERSON_2>`). `N` is a per-Category counter assigned in first-appearance order. Stable within one redaction run.

**Mapping**:
Optional sidecar file recording `Token → original value`. Controlled by a global user preference in **Settings → Output** — off by default, applies to every **Redact** run while enabled. No per-**Document** override on the review screen. Produced for all **Document** kinds when enabled; for **PDF** the sidecar records what was removed (tokens are not written into the PDF bytes).

## Relationships

- A **Batch** contains one or more **Documents**; each is reviewed and redacted independently of the others.
- A **Detect** pass produces **Spans**; Spans sharing a value collapse into one **Entity** (Item).
- An **Item** has one or more **Occurrences** (Spans) and exactly one **Category**.
- A **Category** belongs to exactly one display **Bucket**.
- Each accepted **Item** is assigned one **Token**; a **Mapping** records Token → value.

## Example dialogue

> **Dev:** "The strip shows an `ID` chip with count 4 — is `ID` what goes in the token?"
> **Designer:** "No. `ID` is just a **Bucket** for the summary strip. The row still reads `SSN` and the token is `<SSN_1>`. Buckets never reach the output."
> **Dev:** "And the headline '13 items'?"
> **Designer:** "Items are unique values — **Entities**. The 25 is **Occurrences** (Spans). You decide per Item; unchecking an Item drops all its Occurrences."

## Flagged ambiguities

- "thing" / "hit" (wireframe shorthand) resolved to **Item** (unique value) and **Occurrence** (one appearance). The headline counts Items.
- "ID" was used in the wireframe as if it were a Category; resolved to a display-only **Bucket** over `SSN`/`CREDIT_CARD`/`IBAN`/`ACCOUNT_NUMBER`. Tokens stay granular.
