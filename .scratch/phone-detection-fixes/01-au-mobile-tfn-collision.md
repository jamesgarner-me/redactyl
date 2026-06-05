# AU mobile claimed by TFN pattern — `<ACCOUNT_NUMBER>` token, stranded `+61`

Status: completed

## Parent

Post-v1 detection bug. Extends the regex layer from
`.scratch/v1/issues/02-regex-category-set.md` and `.scratch/v1/issues/18-detection-quality.md`.

## Problem

An Australian mobile written international-style — e.g. `+61 400 000 004` — is redacted as
`+61 <ACCOUNT_NUMBER_n>` instead of `<PHONE_n>`. The trailing 9 digits get masked but:

- they carry the wrong label (`ACCOUNT_NUMBER`, i.e. the ID/TFN bucket, not `PHONE`), and
- the `+61` country code is left **in clear** outside the token.

This only fires when the mobile's 9 trailing digits happen to pass the TFN checksum, so it leaks
intermittently across a document (the original report saw ~6–8 cases). No raw subscriber digits
escape, but the leading `+61` does, and the classification is wrong.

## Root cause (confirmed against code)

`src/detection/patterns.ts`:

- The TFN pattern is classed as `ACCOUNT_NUMBER`, `/\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g`, **confidence
  85**, gated by `tfnValid` (ATO mod-11) — `patterns.ts:104-109`.
- The `PHONE` pattern matches the *full* `+61 400 000 004` but at **confidence 40** —
  `patterns.ts:128-132`.

For `+61 400 000 004`:
1. The TFN regex matches the bare `400 000 004` (the `\b` starts at the first digit, so `+61 ` is
   excluded), and `tfnValid("400000004")` returns true.
2. `mergeSpans` (`src/detection/merge.ts`) resolves the overlap by **highest confidence wins** → 85
   (ACCOUNT_NUMBER) beats 40 (PHONE). The PHONE span is dropped.
3. The surviving span covers only `400 000 004`, so `+61 ` is outside every span and is never
   tokenised.

The comment at `patterns.ts:126-127` asserts the PHONE 3-3-3 branch "requires the leading + so it
never collides with a bare 9-digit TFN" — but that invariant is **one-directional**. It stops PHONE
from eating bare TFNs; it does nothing to stop the TFN pattern from eating a phone's digits.

> Note: `408 776 221` (used in the existing `patterns.test.ts` PHONE test) does **not** pass the TFN
> checksum, which is why that test passes today and the bug went unnoticed. `400 000 004` does pass —
> use it as the reproduction fixture.

## Fix

Make the collision-avoidance symmetric: stop the TFN/`ACCOUNT_NUMBER` pattern from matching a
9-digit run that is immediately preceded by a `+CC` country-code prefix (those digits belong to a
phone number, not a TFN). Add a negative lookbehind to the pattern in `patterns.ts:106`:

```js
// before
pattern: /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
// after
pattern: /(?<!\+\d{1,3}[\s.-]?)\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g,
```

With the TFN match suppressed, nothing overlaps the PHONE span, so PHONE (conf 40) survives and the
full `+61 400 000 004` is tokenised as a single `<PHONE_n>`. (The NER `private_phone` span, if the
model also fires, collapses with it.) Verified:

- `"+61 400 000 004"` → TFN pattern no longer matches; PHONE matches the full number.
- `"TFN: 400 000 004"` (standalone) → still matches as `ACCOUNT_NUMBER` (no `+CC` prefix).

Variable-length lookbehind is supported in all target browsers (V8/Chromium, this is a
WebGPU-targeting browser tool), so no compatibility concern.

Update the comment at `patterns.ts:101-103`/`126-127` to record that the collision guard now runs in
both directions.

## Acceptance criteria

- [ ] `+61 400 000 004` (and other `+CC`-prefixed mobiles whose tail passes the TFN checksum) is
      redacted as one `<PHONE_n>` token covering the `+61` — no stranded country code, no
      `ACCOUNT_NUMBER` label
- [ ] A standalone TFN with no `+CC` prefix (e.g. `400 000 004`, or `TFN: 400 000 004`) is still
      detected as `ACCOUNT_NUMBER` and still gated by `tfnValid`
- [ ] No regression to existing PHONE matches (`+1 415 555 2671`, `+61 408 776 221`, `+14155552671`)
- [ ] Unit test in `src/detection/patterns.test.ts` covering both the collision case and the
      standalone-TFN case (use `400 000 004` as the passing-checksum fixture)
- [ ] `tsc` clean; `npm test` green

## Blocked by

None.
