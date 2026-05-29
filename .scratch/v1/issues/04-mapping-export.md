# Mapping export + Advanced footer

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

Let the user optionally keep a re-identification Mapping so they can round-trip AI responses back to real values.

Add a collapsed `▸ Advanced` footer containing only the **off-by-default** "Also save a re-identification mapping" checkbox and its warning ("anyone with this file can reverse the redaction"). When enabled, `MappingExporter` builds a `<basename>.redactyl-mapping.json` file recording `Token → { category, value }` only — deliberately omitting page numbers, character offsets, and bounding boxes. On the receipt, surface a second manual-save card for the mapping file that repeats the reversal warning.

Mapping file shape:

```json
{
  "version": 1,
  "createdAt": "2026-05-28T11:23:45Z",
  "originalFilename": "contract.pdf",
  "tokens": {
    "<EMAIL_1>":  { "category": "EMAIL",  "value": "alice@example.com" },
    "<PERSON_1>": { "category": "PERSON", "value": "Alice Smith" }
  }
}
```

## Acceptance criteria

- [ ] The mapping checkbox lives in the collapsed Advanced footer and is off by default
- [ ] When off, no mapping card and no mapping file
- [ ] When on, the receipt shows a second save card and a manual save writes `<basename>.redactyl-mapping.json`
- [ ] The mapping JSON matches the documented shape and contains **no** positions/offsets/bboxes
- [ ] The mapping card repeats the reversal warning
- [ ] Unit test asserts the mapping shape and the absence of positional fields

## Blocked by

- `.scratch/v1/issues/03-review-screen-ux.md`
