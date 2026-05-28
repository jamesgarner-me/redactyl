# Redactyl v1 — Browser-based PII Redactor for PDFs and Text

Status: ready-for-agent

## Problem Statement

I regularly want to paste PDFs and plain-text documents into AI tools (ChatGPT, Claude) to summarise, transform, or get advice about them. Those documents contain personal data — names, emails, phone numbers, addresses, account numbers, occasional secrets — that I don't want to send to a third-party LLM provider.

The existing options all fall short of what I want:

- **Server-side redaction tools** (Microsoft Presidio, Philterd, Apryse) require running a backend or trusting a hosted service. The whole point is that the file should never leave my device.
- **Online "redact your PDF" tools** upload the file to do the redaction. Defeats the purpose entirely.
- **Desktop PDF editors** (Acrobat, Preview's "redaction" tool) typically just overlay black rectangles without removing the underlying text — copy/paste still reveals what was supposedly redacted.
- **The closest match, 2redact.com**, is browser-based and client-side but is not confirmed open source, can't be customised, and the trust story is "trust this random web app." For something handling my private data, I want to own and inspect the code.

I want a tool that runs entirely in my browser, looks for PII automatically, lets me confirm what to redact, and produces a sanitised output file where the PII is **actually gone** from the underlying document — not just visually covered.

## Solution

A static web app — Redactyl — that runs entirely in the browser with no backend. The user opens the app (either hosted as a static page or from a local file), explicitly downloads a 770MB PII detection model once, then drops in PDFs or text files for sanitisation.

The flow:

1. Drop a `.pdf`, `.txt`, or `.md` file
2. Redactyl extracts text (for PDFs, with bounding-box positions)
3. Detection runs in two layers: deterministic regex (emails, phones, SSNs, credit cards, IBANs, IPs, URLs, dates, common API secret formats) and an NER model in a Web Worker (people, addresses, account numbers)
4. Detected entities are shown as a flat list, grouped by category, with checkboxes (all pre-checked)
5. The user unchecks any false positives
6. Clicking **Redact** produces a sanitised file of the same type, with each accepted entity replaced by a stable per-document token like `<EMAIL_1>` or `<PERSON_2>`
7. For PDFs, the redaction is *true*: the underlying text operators in the content stream are rewritten so copy/paste yields nothing, and a verification pass confirms this before the file is offered for download
8. Optionally, the user can also export a sidecar mapping file (`<basename>.redactyl-mapping.json`) so the redaction can be reversed locally — useful for round-tripping AI responses back to real values

The product's central guarantee is **fail-closed**: if Redactyl can't be certain it sanitised the document (encrypted PDF, scanned PDF, garbled extraction, verification failure that even rasterisation can't fix), no output file is produced.

## User Stories

### Core redaction flow

1. As a user with a `.txt` file containing structured PII (emails, phone numbers), I want to drop it into Redactyl and get a sanitised text file back, so that I can paste safe content into ChatGPT.
2. As a user with a `.pdf` file containing names, addresses, and a credit-card number, I want to drop it in and get a redacted PDF back where those values are truly gone from the underlying text, so that copy/paste from the redacted file reveals nothing.
3. As a user, I want to see every PII detection listed before redaction happens, so that I can verify what the tool found before committing to changes.
4. As a user, I want detected entities pre-checked for redaction by default, so that the common case (redact everything detected) is one click.
5. As a user, I want to uncheck individual entities I don't want redacted (e.g. a public company URL the tool flagged), so that I retain control over what gets stripped.
6. As a user, I want the redacted output file to download with a clear suffix like `.redacted.pdf`, so that it's obvious which file is the sanitised version.

### Detection coverage

7. As a user, I want emails, phone numbers, SSNs, credit cards, IBANs, IP addresses, URLs, and common date formats detected automatically, so that I don't have to spec them up front.
8. As a user pasting code or configuration into AI tools, I want common API key formats (AWS access keys, OpenAI `sk-…`, Anthropic `sk-ant-…`, Stripe keys, generic `Bearer` tokens, JWTs, PEM blocks) detected as the `SECRET` category, so that I don't accidentally leak a credential.
9. As a user, I want person names detected by an NER model, so that natural-language PII is caught without me writing regex.
10. As a user, I want postal addresses and account numbers detected by an NER model, so that I get coverage beyond pure regex.

### Replacement semantics & round-tripping

11. As a user, I want each redacted value replaced with a stable token like `<EMAIL_1>`, `<EMAIL_2>`, `<PERSON_1>`, so that I can refer to specific entities in my AI prompt ("send a follow-up email to `<EMAIL_1>`") and the model can answer coherently.
12. As a user, I want token numbering to be per-category and assigned in the order entities first appear in the document, so that the tokens are readable and deterministic.
13. As a user, I want an optional checkbox to "Also save a re-identification mapping", off by default, so that I can choose whether to keep a key linking tokens back to real values.
14. As a user who enabled the mapping checkbox, I want a second downloaded file named `<basename>.redactyl-mapping.json` containing token→value pairs, so that I can substitute real values back into AI responses later.
15. As a privacy-conscious user, I want the mapping file to omit page numbers, character offsets, and bounding boxes (storing only token→value), so that if the mapping leaks separately from the document it has limited forensic value.

### Model download & gating

16. As a first-time visitor, I want a clear up-front explanation of the 770MB model download — what it is, why it's that size, that it's a one-time cost — so that I can make an informed decision before committing.
17. As a first-time visitor, I want the model download to be triggered by an explicit button click, not start in the background, so that my bandwidth isn't used without consent.
18. As a user downloading the model, I want to see a progress bar with bytes loaded, total size, percentage, and the current file being fetched, so that I know progress is real and can estimate time remaining.
19. As a user downloading the model, I want a cancel button and a warning before I close the tab mid-download, so that I don't accidentally lose progress.
20. As a user whose model download failed (network issue, disk full), I want a clear error message and a retry button, so that I can recover without restarting from scratch.
21. As a returning user, I want the app to detect that the model is already cached and skip the download gate entirely, so that subsequent visits are fast.
22. As a user, I want a subtle "Model: ready" indicator in the app once cached, with an option to re-download or clear the cache, so that I can recover if the cache gets corrupted.

### PDF safety

23. As a user who accidentally drops a password-protected PDF, I want a clear error explaining the PDF is encrypted and how to decrypt it first, so that I'm not confused why nothing happened.
24. As a user who drops a scanned PDF (an image-only PDF with no extractable text), I want a prominent warning that scanned PDFs aren't supported in v1 and that the file is NOT sanitised, so that I don't paste a still-leaky document into ChatGPT thinking it was cleaned.
25. As a user who drops a PDF with corrupted/garbled text extraction, I want a clear warning that detection is unreliable for this file and the document is NOT sanitised, so that I'm not misled.
26. As a user, I want the Redact button disabled and no output produced whenever a safety check fails, so that the tool never gives me a file that pretends to be sanitised but isn't.
27. As a user, I want the partial detection results visible even when a safety check fails, so that I can see what the tool did manage to find for transparency.

### PDF true-redaction guarantees

28. As a user redacting a PDF, I want each accepted entity's text removed from the PDF's content stream (not just covered with a black rectangle), so that copy/paste from the redacted file yields no PII.
29. As a user redacting a PDF, I want a black rectangle drawn over the redacted region in the visual output, so that the redaction is obvious to anyone reading the file.
30. As a user, I want Redactyl to verify after redaction that no accepted PII appears in the output (by re-parsing and re-running detectors), so that I can trust the guarantee instead of just hoping the rewrite worked.
31. As a user, I want pages where the content-stream rewrite fails verification to be automatically rasterised (rendered to image), so that the true-redaction guarantee holds even for PDFs with tricky fonts (ligatures, CID fonts, kerned `TJ` operators).
32. As a user, I want to be told when a page was rasterised as a fallback, so that I understand why text isn't searchable on that page in the output.

### Trust & privacy

33. As a security-conscious user, I want the app to make no network requests after initial app + model load, so that I can verify in devtools that my files aren't being uploaded.
34. As a user, I want everything to work offline after the first visit (service worker caches app + model), so that I can use Redactyl on a disconnected machine.
35. As a user, I want a clear README explaining the threat model, what's stored where, and how to verify nothing leaves the browser, so that I can decide whether to trust the tool.

## Implementation Decisions

### Architecture

- **Stack:** Vite + React + TypeScript, served as a static single-page app. No backend. Static hosting (GitHub Pages or Cloudflare Pages) is decided at release prep.
- **Inference runtime:** transformers.js v4 running the OpenAI privacy-filter model in ONNX, with WebGPU acceleration and WASM fallback.
- **Worker boundary:** All detection (regex + NER) runs in a single Web Worker so that the UI thread stays responsive during model load and inference.
- **Persistence:** The model is cached in IndexedDB by transformers.js. The app and its dependencies are cached by a service worker (`vite-plugin-pwa`).

### Modules

The implementation is organised around deep modules with simple interfaces. The complex ones (`PdfExtractor`, `PdfRedactor`) hide significant internal complexity behind a single externally-callable method.

| Module | Surface | Encapsulates |
|---|---|---|
| `Detector` | `detect(text) → PiiSpan[]` | Regex pattern set + NER pipeline + worker dispatch + merge of overlapping spans |
| `Tokeniser` | `assignTokens(spans) → TokenAssignment` | Per-category counters, first-appearance ordering |
| `TextRedactor` | `redact(text, spans, tokens) → string` | Right-to-left span replacement, offset accounting |
| `PdfExtractor` | `extract(bytes) → ExtractedPdf \| SafetyError` | pdfjs API, three safety checks (encrypted/scanned/garbled), per-glyph bbox mapping |
| `PdfRedactor` | `redact(bytes, accepted) → ArrayBuffer` | pdf-lib operator rewrite + verification pass + rasterise fallback for failed pages |
| `PdfVerifier` | `verify(bytes, expectedAbsent) → VerificationResult` | Re-parse + re-detect; detector-based leak check (not naive substring match) |
| `ModelGate` | `state()` / `download() → AsyncIterable<Progress>` | transformers.js cache probing, progress streaming, error/retry |
| `MappingExporter` | `build(tokens, filename) → MappingFile` | Mapping JSON construction |

Shallow modules (orchestration / UI): `App` (state coordinator), `FileDropZone`, `EntityReviewList`, `RedactButton`.

### Detection categories (v1)

A single canonical category enum, emitted by both layers; merge.ts dedupes overlapping spans with higher-confidence wins.

- **Regex layer:** `EMAIL`, `PHONE`, `URL`, `IP`, `DATE`, `SSN`, `CREDIT_CARD` (Luhn-validated), `IBAN` (mod-97 validated), `SECRET` (AWS `AKIA…`, OpenAI `sk-…`, Anthropic `sk-ant-…`, Stripe live keys, generic `Bearer …`, JWT, PEM blocks)
- **NER layer:** `PERSON`, `ADDRESS`, `ACCOUNT_NUMBER`

Detector interface accepts `customPatterns?: {category, pattern}[]` from day one; UI surface deferred to v2.

### Replacement format

Stable per-entity, per-category tokens. Each token has the shape `<CATEGORY_N>` where `N` is a 1-indexed counter that resets per category and is assigned in first-appearance order within the document.

### Mapping file format

JSON, written as a separate download when the user opts in. Filename pattern: `<basename>.redactyl-mapping.json`. Deliberately omits positions to limit forensic value if the mapping is leaked without the redacted document.

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

### Model gate state machine

The app refuses to perform detection until the model is in IndexedDB. The user-facing state machine is:

```
                  ┌──── (cache probe finds files) ────────────┐
                  │                                           ▼
   [app load] → MODEL_MISSING ──(user clicks Download)──→ MODEL_DOWNLOADING ──(success)──→ MODEL_READY
                  ▲                                                      │
                  │                                                      ▼
                  └────────────── (user retries) ────────── MODEL_ERROR
```

File drop is disabled in `MODEL_MISSING`, `MODEL_DOWNLOADING`, and `MODEL_ERROR`. A `beforeunload` warning is registered during `MODEL_DOWNLOADING`.

### PDF redaction pipeline

```
extract → safety checks → detect → review → redact (pdf-lib operator rewrite + black rect)
                                              │
                                              ▼
                                            verify (re-parse + re-detect)
                                              │
                                              ├── all clear ────────────────────────→ download
                                              │
                                              └── leaks found on pages X,Y ─→ rasterize(X,Y) → verify again
                                                                                              │
                                                                                              ├── clear → download (with rasterised-page banner)
                                                                                              └── still leaking → block download, surface error
```

The verification step uses the same `Detector` used in the initial pass — comparing detected spans, not substring containment — so that genuinely innocent substrings (`Johnson` containing the redacted `John`) are not falsely flagged as leaks.

### Safety checks for PDFs

Three checks during extraction, all fail-closed (no output file ever produced if any fires):

1. **Encrypted** — pdfjs reports the document as encrypted or throws `PasswordException`. Surface: "PDF is password-protected; decrypt it first."
2. **Scanned (no text layer)** — a page has zero text items but the operator list contains image-drawing operators (`Do`, `paintImageXObject`). Surface: "Pages X, Y appear to be scans; v1 doesn't OCR; **do not paste this file into ChatGPT thinking it's sanitised**."
3. **Garbled extraction** — a page exceeds 5% non-printable / U+FFFD / unmapped-glyph characters. Surface: "Page X produced unreadable text; can't reliably detect PII; **don't assume this file is sanitised**."

### Delivery plan

Build proceeds as vertical slices; each slice ships the drop → detect → review → redact → download flow end-to-end for its scope. Slices 1–3 are internal milestones — no public release until slice 4. Time estimates are deliberately omitted; the content-stream rewrite in slice 3 is intrinsically unpredictable.

- **Slice 1** — Text path with regex only (end-to-end on `.txt`/`.md`)
- **Slice 2** — Add NER model + model-gate UX (text path becomes full-coverage)
- **Slice 3** — Add PDF support: extraction + 3 safety checks + content-stream rewrite + verification + rasterise fallback
- **Slice 4** — Release prep: service worker for offline, README, real-world PDF corpus regression check, hosting

### Out-of-scope categories

v1 does not detect customer names, project codenames, internal Jira/Slack identifiers, or other non-classical PII. The detector interface supports `customPatterns` so v2 can add them as a small additive change with a UI affordance.

## UI Design (v1)

> **Self-contained section.** Everything UI/visual lives here so it can be read (or carved off) on its own. Source wireframes: `docs/wireframes/` (sketch-style; their handwritten margin notes are annotations, not product copy). Where a decision diverges from a wireframe, it's called out under [Deviations from the wireframes](#deviations-from-the-wireframes). Vocabulary (Item, Occurrence, Bucket, Exclude, Dismiss, Token) is defined in the repo-root `CONTEXT.md` and used verbatim below.

### Scope

v1 is a **single-file** flow on one continuous, centred, single-column surface: *model gate → dropzone → analyzing → review → redacting → receipt*. Multi-file is a later version and the layout deliberately doesn't pre-build for it.

### Design language & theme

**Dark mode is the default**, independent of the OS `prefers-color-scheme`. The user's explicit choice persists in `localStorage`; absent a stored choice, the app opens dark. Light is a first-class alternative reachable only via the toggle.

The palette is five brand colours (`#054a91`, `#3e7cb1`, `#81a4cd`, `#dbe4ee`, `#f17300`). None is a near-black, so the **dark theme is a navy-anchored ramp**: a background darker than `#054a91` is derived, surfaces step up through the brand blues, and `#f17300` is reserved as a true accent (primary action, focus rings, links) rather than a fill. Light mode mirrors the ramp. Functional **red** (danger/safety) and **green** (verified) are introduced outside the 5-colour brand set, because the brand palette carries no semantic red/green.

Semantic tokens (CSS custom properties), both themes:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#06223f` (derived) | `#f4f7fb` (derived) | page background |
| `--surface` | `#054a91` | `#ffffff` | cards, list, dropzone |
| `--surface-2` | `#0a3a70` | `#dbe4ee` | raised / hover |
| `--border` | `#3e7cb1` | `#81a4cd` | hairlines, dividers |
| `--text-dim` | `#81a4cd` | `#3e7cb1` | secondary text, meta |
| `--text` | `#dbe4ee` | `#054a91` | primary text |
| `--accent` | `#f17300` | `#f17300` | Redact, focus ring, links |
| `--danger` | `#e5484d` (functional) | `#cf2d35` | safety banners, errors |
| `--success` | `#3fb950` (functional) | `#2f9e44` | verified badge |

**Typography:** a system/sans UI font (Inter / `system-ui`) for chrome — headings, buttons, labels, prose. **JetBrains Mono** for all *data*: detected values, tokens (`<EMAIL_1>`), masked secrets, last-4 digits, filenames. Monospace keeps masked values and tokens aligned and unambiguous; sans keeps the explainer/warning prose readable.

### Theme toggle — the View Transition effect

Browser-native, no library. The toggle is a single sun/moon button in the top bar (no duplicate control elsewhere — single source of truth).

- On click, call `document.startViewTransition(() => ReactDOM.flushSync(() => setTheme(next)))`. The browser snapshots the current page, lets React commit the new theme synchronously, snapshots the new page, and exposes both as `::view-transition-old(root)` / `::view-transition-new(root)`.
- The new theme is revealed with a **`clip-path: circle()` that expands from the toggle button's screen coordinates** (captured on click and passed to the animation as CSS vars), wiping over the old theme beneath. ~0.4s ease-out.
- **`prefers-reduced-motion`**: skip `startViewTransition` entirely and swap the theme instantly.
- Feature-detect: if `startViewTransition` is unavailable, fall back to an instant swap.

```css
::view-transition-old(root) { animation: none; }      /* old stays static beneath */
::view-transition-new(root) {
  animation: reveal 0.4s ease-out;
  clip-path: circle(0 at var(--tx) var(--ty));
}
@keyframes reveal { to { clip-path: circle(var(--r) at var(--tx) var(--ty)); } }
@media (prefers-reduced-motion: reduce) { /* JS skips startViewTransition */ }
```

### App shell / chrome

A persistent, quiet top bar across every screen:

- **Left:** `Redactyl` wordmark + tagline "Strip PII from PDFs and text, entirely in your browser".
- **Right cluster:** `Model: ready ✓` status chip · ☾ theme toggle · ⚙ settings.
- The **⚙ settings sheet** holds model-cache actions (**Re-download**, **Clear cache** → returns to the Step-1 gate) and a slot for future prefs. Theme is **not** duplicated here.
- The model chip is a status indicator only; recovery actions live behind the gear.

### Screen-by-screen

**1 · Model gate** (first visit / `MODEL_MISSING`) — the "quiet card." Privacy promise leads ("Nothing leaves your device… 770MB one-time download, then cached locally, files never uploaded"), then a single primary `↓ Download PII model (770 MB)` button. File drop is disabled here.
- *Downloading:* card content swaps in place to a determinate progress bar with **bytes loaded / total / percentage / current file**, a **Cancel** button, and a registered `beforeunload` warning.
- *Error:* clear message (network / disk) + **Retry**.
- *Ready:* advances to the dropzone; on return visits the cache probe skips this screen entirely.

**2 · Dropzone** — the **whole canvas** is the drop target ("Drop a file here / or / Choose a file…", chips `.pdf .txt .md`). **Single file only.** Invalid drops are **rejected inline** and keep the user on the dropzone:
- Multiple files / a folder → "One file at a time in v1 — you dropped N files."
- Unsupported type → "Redactyl handles .pdf, .txt and .md. \"photo.png\" isn't supported."

**3 · Analyzing** (interim) — the dropzone is replaced by a minimal centred spinner with the filename and `Analyzing…`. Resolves to the review list, the empty state, or a safety state.

**4 · Review** — the core screen.
- **Summary strip** (top): one chip per **Bucket** with its occurrence count. Buckets group display only — `ID` = `SSN`+`CREDIT_CARD`+`IBAN`+`ACCOUNT_NUMBER`, `NETWORK` = `URL`+`IP`; all other categories are 1:1. **Clicking a chip bulk-toggles Exclude** for that whole bucket (recoverable).
- **List rows** (granular, *not* bucketed): `☑ checkbox · CATEGORY · value · N× · locator`.
  - All rows **pre-checked** by default (one-click "redact all"; unwanted buckets dropped via the strip chip).
  - **Value masking:** `SECRET` and `ID`-bucket values are masked with a recognisable hint (prefix / last-4: `sk-live-•••••8a2f`, `••• •• 4421`) and a per-row **eye** to reveal on demand. All other categories shown in clear so false positives are judgeable.
  - **Locator:** PDFs show pages (`p. 1, 4, 7`); text shows line numbers (`ln 12, 88`).
  - **Two opt-out actions** (see `CONTEXT.md`): unchecking = **Exclude** (it *is* PII, skip this run — row greyed, stays, strip count unchanged, headline −1); the row's **×** = **Dismiss** (not PII — row leaves the list, strip count −1, recoverable via a footer "N dismissed · show").
- **Footer:** `▸ Advanced` (collapsed) containing only the off-by-default **"Also save a re-identification mapping"** checkbox + its "anyone with this file can reverse the redaction" warning; the live count `13 items · 25 occurrences`; and the primary **`Redact →`** button (accent).
- **Empty state** (no PII found): a calm `✓ No personal data detected in <file>` panel with an explicit honesty caveat ("detection isn't perfect — eyeball your file before pasting") and a `Redact another file` CTA. **No output file is produced.**
- **Safety states** (fail-closed; no output ever, Redact disabled — stories 26/27), two shapes:
  - **Encrypted** → standalone blocking error card, no list (nothing was extractable): "PDF is password-protected; decrypt it first." + `Choose another file`.
  - **Scanned / Garbled** → a persistent **red banner** pinned above a normally-rendered review list (partial results preserved): "Pages 2, 3 are scans — this file is NOT sanitised; don't paste it thinking it's clean." The `Redact →` button is hard-disabled with an inline reason.

**5 · Redacting** (interim) — spinner with staged labels `Redacting… → Verifying…` (and `Re-verifying…` if a rasterise fallback runs), then the receipt.

**6 · Receipt** — `Done — ready to save`.
- **Manual save only:** one card per output file (`report.redacted.pdf`; and, if opted-in, `report.redactyl-mapping.json`) each with a `↓ save` button. **Nothing is written to disk until the user clicks** — no auto-download.
- The mapping card repeats the reversal warning ("anyone with this file can reverse the redaction — store it carefully").
- **Verification:** always one `✓ Verified — no detectable PII in the output` badge. A second line `✓ Re-verified after flattening pages 3, 5` appears **only** when a rasterise fallback actually ran, alongside a note that those pages are now images (text not selectable).
- `Redact another file` returns to the dropzone (model stays cached).

### Responsive / device posture

**Desktop-first, degrade gracefully.** Layout stays fluid and usable down to tablet/large-phone widths in a single column. On small screens a **non-blocking advisory** appears ("Redactyl works best on desktop — 770MB one-time download and heavy in-browser processing"). No dedicated mobile layouts in v1; no hard device gate.

### Accessibility

- Full keyboard operability: the dropzone has a real `Choose a file` control; list checkboxes, eye reveals, chips, and `×` are focusable buttons.
- Visible focus ring in `--accent` on every interactive element.
- The review list is a labelled list; counts and safety banners use `aria-live` so screen readers hear "13 items to redact" and safety warnings.
- `prefers-reduced-motion` honoured for the theme transition (instant swap) and any other animation.
- Theme tokens chosen for AA contrast (`--text` on `--bg`/`--surface` in both themes); never rely on colour alone — safety/verify states pair colour with an icon and text.

### Deviations from the wireframes

- **Manual save, not auto-download.** The Step-4 note "both downloads fired automatically" is overridden: nothing writes to disk until the user clicks `↓ save` (deliberate, per-file write suits a privacy tool and avoids browser multi-download blocking). Heading is "Done — ready to save", not "…saved".
- **`ID` / `NETWORK` are display-only Buckets**, not categories. The wireframe's `ID` chip and "(SSN-ish)" shorthand map to granular categories in rows and tokens (`<SSN_1>`, never `<ID_1>`).
- **Count wording.** Headline counts **Items** (unique values), not occurrences: "13 items to redact" with "13 items · 25 occurrences" beneath — the wireframe headlined the occurrence total.
- **Two distinct opt-outs** (Exclude vs Dismiss) replace the wireframe's single ambiguous `✓`/`×` pairing.

## Testing Decisions

### Test principles

- Tests target external module behaviour, not internal implementation. The deep modules' public surfaces are tiny — those surfaces are what to test.
- For the redaction layer specifically, the test oracle is: **the same `Detector` used in the production verification pass.** Tests assert that running `Detector` on the redacted output produces no spans whose values match any of the accepted entities. This mirrors the runtime verification one-to-one.
- For PDF redaction, integration tests additionally invoke `pdftotext` (system CLI) against the fixture output as a second, independent extraction implementation — guarding against the risk that pdfjs and our own detector might share a blind spot.

### Modules covered

- **`Detector`** — unit tests per regex category (known PII matched, known non-PII rejected, Luhn validation for credit cards, mod-97 for IBAN). For NER, a smoke test against a short fixture string with known-good detections; not a model-quality test.
- **`Tokeniser`** — pure-function tests covering first-appearance ordering, per-category counter independence, idempotence.
- **`TextRedactor`** — round-trip property test: `applyMapping(redact(text, spans, tokens), mapping) === text` for any text/spans pair.
- **`PdfExtractor`** — fixture-based: clean text PDF (extracts cleanly), encrypted PDF (returns `EncryptedPdfError`), scanned PDF (returns `ScannedPdfError`), garbled PDF (returns `GarbledTextError`).
- **`PdfVerifier`** — synthetic "this PDF still contains 'alice@example.com'" fixture → reports leak; clean fixture → reports no leak.
- **`PdfRedactor`** — fixture-based integration tests: clean text PDF (no rasterise needed), ligature-heavy PDF (forces rasterise fallback), kerning-split-word PDF, multi-page PDF with spans on each page. Each asserts (a) `PdfVerifier` reports no leaks, (b) `pdftotext` on the output produces no accepted PII strings.
- **`MappingExporter`** — JSON schema/shape test; ensures positions are *not* present in output.
- **`ModelGate`** — state-transition unit tests (mock the worker); does not exercise transformers.js itself.

### Test fixtures

Seed PDFs live in `test/fixtures/pdf/`. Generate fixtures with both `pdf-lib` (deterministic synthesis) and saved real-world PDFs (small, license-clean) to cover both controlled cases and realistic ones. Document the fixture catalogue in `test/fixtures/README.md`.

### Prior art

No existing test code in this repo (greenfield). Test stack: Vitest (matches Vite default), React Testing Library only where UI tests are added in v2 (UI tests are explicitly out of scope for v1's deep modules).

## Out of Scope

- **Preview pane** — split-pane document view with per-category PII highlights. v1 ships with a flat entity list grouped by unique value. Deferred to v2 because the canonical review UX is easier to validate once real false-positive patterns are observed.
- **Per-occurrence control** — unchecking individual occurrences of the same value. Naturally follows the preview pane.
- **User-defined patterns / customer-name lists** — detector interface supports them; UI is v2.
- **OCR for scanned PDFs** — would add Tesseract.js (~10MB WASM). Scanned PDFs are detected and refused in v1.
- **DOCX, CSV, images** — file types beyond PDF + text. Out of v1.
- **Pseudonymisation** — replacing PII with realistic fake values instead of `<CATEGORY_N>` tokens.
- **Decrypting password-protected PDFs** — detected and refused.
- **Re-substitution flow** — a UI to paste an AI response + mapping file and get back the un-redacted text. Mapping format is forward-compatible; the UI lands in v1.5.
- **Behavioural UI tests** — out of scope for v1; v1 testing is module-level. Add when the preview pane (v2) introduces real interaction complexity.

## Further Notes

### Trust posture

The product's credibility hinges on the user being able to verify the privacy claim. Two things to lean into in the README:

1. The static-site / no-backend architecture is observable in devtools — after the model loads, there should be **zero outgoing network traffic** during any redaction.
2. The verification pass is not just an internal safety net — it's a user-facing guarantee. The README should explain how it works so the user can audit it.

### The 770MB model is a known friction point

The OpenAI privacy-filter model is heavy by browser-app standards. The plan addresses this with an explicit, transparent download gate rather than hiding it. If post-launch metrics suggest the model size is materially affecting adoption, v1.5 can introduce a smaller distilled NER model as a default with the 770MB model as an opt-in upgrade. The `Detector` interface and worker boundary already make this swap straightforward; no architectural change is needed in v1.

### Glossary (for issue writers and contributors)

The canonical vocabulary lives in the repo-root **[`CONTEXT.md`](../../CONTEXT.md)** — the single source of truth for domain language across the codebase, issues, and tests. Use its terms verbatim; don't redefine them here (a duplicated glossary just drifts).

It covers: **Detect**, **Span** / **Occurrence**, **Entity** / **Item**, **Category**, **Bucket** (`ID`, `NETWORK`), **Accept** / **Exclude** / **Dismiss**, **Redact**, **Token**, **Mapping** — including the note that "Strip" is internal-only, never user-facing.

## Comments
