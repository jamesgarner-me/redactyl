# Purpose-first landing intro + model download gated behind a modal

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1). Reworks the first-run model gate from issue 06 and the explainer from issue 17, and **subsumes issue 16** (HuggingFace CDN disclosure).

## What to build

Two changes to the first-run experience, both in the model gate (`src/ui/ModelGate.tsx`, `src/ui/ProcessExplainer.tsx`).

### 1. Purpose-first landing card (`missing` state)

Today the `missing` card leads with "Nothing leaves your device" — which assumes the visitor already knows what Redactyl is. Lead with *purpose*, then the promise, then a single button that opens the modal:

> **Redactyl removes personal data from your documents.**
> It finds names, addresses, emails, account numbers and more in PDFs and text files, and gives you back a clean copy with each one replaced — so it's safe to share. The main use: sanitising a file before you paste or upload it to an AI tool.
>
> **Nothing leaves your device.** Detection runs entirely in your browser.
>
> `[ Get Started ]`

Terminology (per `CONTEXT.md`): use **"removes" / "redact" / "sanitise"**, never user-facing **"strip"** (reserved for internal PDF-stream removal). Lead with **"personal data"**, not "PII" (PII stays as the technical model label inside the modal). "AI tool", not "chatbot"/"model".

The primary button no longer starts the download directly — it opens the modal (below).

### 2. Model download gated behind a modal

Clicking **Get Started** opens a native `<dialog>` (`showModal()`) that owns the whole describe → download → progress journey. The model gate **state machine is untouched** — modal open/closed is local UI state in `ModelGate`, orthogonal to the `probing/missing/downloading/error/ready` machine.

**Describe view (state `missing`):**

> ### Download the detection model
>
> Redactyl detects personal data with **openai/privacy-filter**, a small open model that runs entirely in your browser — on your GPU where available, otherwise your CPU. It's downloaded once from **huggingface.co** (the only network request Redactyl ever makes) and cached on this device. After that, your files are processed with no network at all.
>
> [facts table: Model / Detects / Runtime / Size — relocated from `ProcessExplainer`, kept verbatim]
>
> [disclaimer blockquote — the OpenAI model-card quote + link]
>
> `[ ↓ Download model (770 MB) ]`

The HuggingFace disclosure (issue 16) is woven into the description paragraph above — not bolted on. Now that COEP is `require-corp` satisfied by HF's CORS headers (ADR 0001 correction), the disclosure stays simple; no CORP caveat.

**Downloading view (state `downloading`):**

The existing progress bar (bytes / total / % / current file) + **Cancel**, plus the disclaimer blockquote, plus the collapsible **"How does this process work?"** 7-stage pipeline diagram (fill-the-wait content stays here).

**Content split (per Q4):** description paragraph + facts table + disclaimer = decision-support, shown in the describe-view above the button. The 7-stage pipeline diagram = fill-the-wait, shown during downloading. The **disclaimer blockquote appears in both views** (issue 17 invariant: it must never be hidden inside the collapsible panel).

**Error view (state `error`):** the existing message + Retry, inside the modal.

**Ready:** the modal auto-closes and `App` reveals the dropzone (existing behaviour — `App` swaps `ModelGate` for the dropzone when `state.name === 'ready'`).

### Dismissibility matrix

| State | scrim click / Escape | Escape hatch |
|---|---|---|
| `missing` (describe) | dismiss → back to landing card | — |
| `downloading` | **inert** (no dismiss) | **Cancel** aborts the download **and returns to the describe view** inside the still-open modal |
| `error` | dismiss freely | Retry stays in modal |
| `ready` | n/a | auto-closes |

Implement "inert while downloading" by `preventDefault()`-ing the `<dialog>` `cancel` event (blocks Escape) and gating the backdrop-click handler on `state.name !== 'downloading'`. The `beforeunload` warning from issue 06 still guards a full tab close during download. Focus lands on the modal title (or download button) on open via `aria-labelledby`; focus returns to **Get Started** on close.

### 3. Fold-in: stale COEP/Safari cleanup

The `require-corp` correction (ADR 0001) makes two things stale — fix both here:

- `ModelGate.tsx` `unsupported` copy and the `modelGate.ts:17` comment say "Safari 17.4 or later" / "Safari < 17.4". Reword the user-facing copy to name the real cause, e.g. *"Your browser doesn't support the technology this needs — try a current version of Chrome, Firefox, Edge, or Safari."* (The real exclusion is now only a browser with no `SharedArrayBuffer` at all, not a Safari-version cutoff.)
- ADR 0001's opening paragraph (line 3) still says COEP `credentialless`, and the status note says "COOP/COEP constraints… unchanged" — both contradict the Correction section below them. Reconcile the intro/status-note to `require-corp`. Leave issue 15's text alone (completed history, already carries its own correction note).

## Acceptance criteria

- [ ] The `missing` landing card leads with the purpose statement, then the privacy promise, then a single **Get Started** button; copy uses "personal data" and "AI tool" and avoids user-facing "strip"
- [ ] **Get Started** opens a native `<dialog>`; the model gate state machine is unchanged (modal-ness is local UI state)
- [ ] Describe-view shows the model description, the facts table, the disclaimer blockquote, the HuggingFace disclosure, and the download button
- [ ] Downloading-view shows progress (bytes / total / % / file) + Cancel + the disclaimer + the collapsible pipeline diagram
- [ ] The disclaimer blockquote is present in **both** the describe and downloading views and is never nested inside the collapsible panel
- [ ] While `downloading`, scrim-click and Escape do **not** dismiss; **Cancel** aborts and returns to the describe view inside the open modal
- [ ] In `missing` and `error`, scrim-click / Escape dismiss the modal; on `ready` the modal auto-closes and the dropzone shows
- [ ] Modal a11y: `aria-modal`/`<dialog>`, `aria-labelledby` the title, focus moves into the modal on open and back to **Get Started** on close
- [ ] HuggingFace named as the model source + stated as the only outbound request (delivers issue 16); reviewed against `CONTEXT.md` vocabulary
- [ ] `unsupported` copy and the `modelGate.ts` comment no longer reference a Safari-version cutoff; ADR 0001 intro/status-note reconciled to `require-corp`
- [ ] No new dependencies; no new outbound calls; no analytics/telemetry
- [ ] DOM tests: disclosure string present in the describe-view; disclaimer present (and not inside `<details>`) in both views; scrim/Escape inert while downloading; the 7 pipeline stages present in order

## Implementation notes

- Build the UI to the `frontend-design` skill's standard — this is the first impression of the app.
- Reuse the existing `progress` rendering and `formatBytes` from `ModelGate.tsx`; relocate `FACTS`, the disclaimer blockquote, the `MODEL_CARD_URL`, and the pipeline `STAGES` from `ProcessExplainer.tsx` rather than rewriting them.

## Blocked by

None — purely client-side.

## Related

- Issue 06: model gate state machine (state machine reused unchanged)
- Issue 16: HuggingFace CDN disclosure — **subsumed by this issue** (disclosure now lives in the describe-view)
- Issue 17: process explainer — content split between the two modal views
- ADR 0001: COEP `require-corp` correction (intro/status-note reconciled here)
