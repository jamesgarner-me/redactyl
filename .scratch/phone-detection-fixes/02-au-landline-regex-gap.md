# AU landline `+61 3 9602 8899` matches no PHONE alternative — leaks in clear

Status: completed

## Parent

Post-v1 detection bug. Extends the regex layer from
`.scratch/v1/issues/02-regex-category-set.md` and `.scratch/v1/issues/18-detection-quality.md`.

## Problem

An Australian landline written international-style with a single-digit area code —
`+61 3 9602 8899` — is **not detected at all** by the regex PHONE pattern and leaks verbatim. The
original report saw a Compliance Hotline number escape this way.

> The original analysis attributed this to "the redactor stops at the first match on a line." That is
> **incorrect** — `regexScoredSpans` runs a global `while (re.exec(...))` loop (`patterns.ts:209`) and
> finds every match on every line. The real cause is a format-coverage gap (below). Any sibling
> number on the same line that *was* redacted simply happened to be in a covered format (or was
> caught by NER).

## Root cause (confirmed against code)

The `PHONE` pattern (`src/detection/patterns.ts:128-132`) has three alternatives:

1. `\+\d{10,15}` — bare international, no separators
2. `(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}` — 3-3-4 grouping
3. `\+\d{1,3}[\s.-]?\d{3}[\s.-]\d{3}[\s.-]\d{3}` — `+CC` 3-3-3 (AU mobiles)

`+61 3 9602 8899` is `+CC` + **single-digit area code** (`3`) + `4-4` grouping. It fits none of the
three: alt 1 needs no spaces, alts 2 and 3 both require a 3-digit first group after the country code.
So no PHONE span is produced and (ADDRESS aside) nothing else claims it.

## Fix

Add a fourth PHONE alternative for the `+CC <1-digit area> NNNN NNNN` shape. Append it **last** so it
cannot truncate a longer 3-3-4 / 3-3-3 match (alternation is ordered; the existing comment notes this
matters). In `patterns.ts:129-130`:

```js
pattern:
  /(?:\+\d{10,15})|(?:(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})|(?:\+\d{1,3}[\s.-]?\d{3}[\s.-]\d{3}[\s.-]\d{3})|(?:\+\d{1,3}[\s.-]\d[\s.-]\d{4}[\s.-]\d{4})/g,
```

The new branch `\+\d{1,3}[\s.-]\d[\s.-]\d{4}[\s.-]\d{4}` requires the inter-group separators to be
present (landlines are always written spaced/hyphenated), which keeps false positives down — it
won't fire on bare digit runs. Verified:

- `"+61 3 9602 8899"` → now matches in full.
- No regression: `+1 415 555 2671` (3-3-4), `+61 408 776 221` (3-3-3 mobile), `+14155552671` (bare)
  all still match exactly as before, and the new branch does not truncate any of them.

Extend the explanatory comment at `patterns.ts:122-127` to describe the fourth branch.

### Scope note

This fix targets the **international `+CC`** landline form that leaked. The bare national forms
(`(03) 9602 8899`, `03 9602 8899`) are out of scope for this issue — they carry higher
false-positive risk (10-digit `0X ...` runs) and weren't part of the reported leak. Flag for a
follow-up if national-form coverage is wanted.

## Acceptance criteria

- [ ] `+61 3 9602 8899` (and equivalents with `.`/`-` separators, e.g. `+61-3-9602-8899`) is
      detected and redacted as `<PHONE_n>`
- [ ] No regression to existing PHONE matches (`+1 415 555 2671`, `+61 408 776 221`, `+14155552671`,
      `(415) 555-2671`) — assert each matches in full, unchanged
- [ ] Unit test in `src/detection/patterns.test.ts` covering the AU landline form, with at least one
      separator variant
- [ ] `tsc` clean; `npm test` green

## Blocked by

None. Independent of `01-au-mobile-tfn-collision.md` (different pattern, no merge interaction).
