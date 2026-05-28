# Review screen UX — buckets, Exclude/Dismiss, masking, locators

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Turn the basic list from slice 1 into the full review screen — the core screen of the app — realising the `CONTEXT.md` vocabulary (Item, Occurrence, Bucket, Exclude, Dismiss) verbatim.

Add a **summary strip** of Bucket chips with Occurrence counts, where `ID` = `SSN`+`CREDIT_CARD`+`IBAN`+`ACCOUNT_NUMBER`, `NETWORK` = `URL`+`IP`, and all other Categories map 1:1; clicking a chip bulk-toggles Exclude for that whole Bucket (recoverable). Keep list rows **granular** (`☑ · CATEGORY · value · N× · locator`), all pre-checked. Implement the two distinct opt-outs: unchecking = **Exclude** (it is PII, skip this run — row greyed, stays, strip count unchanged, headline −1); the row `×` = **Dismiss** (not PII — row leaves the list, strip count −1, recoverable via a footer "N dismissed · show"). Mask `SECRET` and `ID`-Bucket values with a recognisable hint (prefix / last-4) plus a per-row eye to reveal; show all other Categories in clear. Show **line-number** locators for text (`ln 12, 88`). Add the empty state (`✓ No personal data detected in <file>` with the honesty caveat and a `Redact another file` CTA — no output produced) and the live `N items · M occurrences` count, where the headline counts **Items**.

## Acceptance criteria

- [ ] Summary strip shows one chip per Bucket with its Occurrence count; clicking bulk-toggles Exclude and is recoverable
- [ ] Rows stay granular with real Categories and Tokens (never `<ID_…>`)
- [ ] Exclude greys the row, keeps it, leaves the strip count unchanged, drops the "items to redact" headline by one
- [ ] Dismiss removes the row, decrements its Bucket count, and is recoverable via "N dismissed · show"
- [ ] `SECRET` and `ID`-Bucket values are masked with a hint and reveal via a per-row eye; other Categories shown in clear
- [ ] Text locators show line numbers
- [ ] Empty state renders with the caveat and produces no output file
- [ ] Headline counts unique Items; the sub-count reads `N items · M occurrences`

## Blocked by

- `.scratch/v1/issues/02-regex-category-set.md`
