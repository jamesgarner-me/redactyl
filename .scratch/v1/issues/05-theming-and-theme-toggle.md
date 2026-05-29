# Theming + View Transition theme toggle + settings sheet

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The app's visual design language and chrome — HITL because the View Transition effect and the overall look warrant a human design review against the wireframes.

Build a semantic-token theme system (CSS custom properties) for both themes, **dark by default** regardless of OS `prefers-color-scheme`, with the user's explicit choice persisted in `localStorage`. Use the navy-anchored ramp derived from the five brand colours with `#f17300` reserved as a true accent, plus functional red (danger/safety) and green (verified) outside the brand set. Use a system/sans font for chrome and **JetBrains Mono** for all data (values, Tokens, masked secrets, last-4, filenames). Implement the top-bar sun/moon toggle as the single source of truth using `document.startViewTransition` + `flushSync`, revealing the new theme with a `clip-path: circle()` expanding from the toggle's screen coordinates (~0.4s ease-out); skip the transition under `prefers-reduced-motion` and feature-detect to an instant swap. Add the ⚙ settings sheet with slots for model-cache actions (wired in slice 6) — theme is **not** duplicated there. Add the small-screen non-blocking advisory and the a11y baseline: visible `--accent` focus rings on every interactive element and `aria-live` regions for counts and safety messages.

## Acceptance criteria

- [x] App opens dark with no stored preference; toggle persists choice to `localStorage`
- [x] Semantic tokens match the PRD table for both dark and light themes
- [x] Data renders in JetBrains Mono; chrome/prose renders in the sans UI font (font caveat below)
- [x] Theme toggle animates via View Transition `clip-path: circle()` from the button's coordinates
- [x] `prefers-reduced-motion` and missing `startViewTransition` both fall back to an instant swap
- [x] Settings sheet opens with model-cache action slots; theme is not duplicated in it
- [x] Small-screen advisory appears without blocking use
- [x] Every interactive element shows a visible focus ring; counts use `aria-live` (safety banners land in slice 9)
- [x] Human design review sign-off against `docs/wireframes/` — signed off 2026-05-29

## Blocked by

- `.scratch/v1/issues/01-text-tracer-bullet.md`

## Comments

### Code implemented — awaiting design sign-off (2026-05-29, agent)

All code-verifiable criteria are done; status stays `ready-for-human` for the visual sign-off only.

Implemented:
- `src/styles.css` — semantic-token system (`:root` dark default + `[data-theme='light']`), matching the PRD table; `--font-sans` / `--font-mono`; View Transition `::view-transition-*` + `reveal` keyframes; accent `:focus-visible` ring; top-bar / settings-sheet / advisory styling.
- `src/ui/useTheme.ts` — dark default, `localStorage` persistence, `startViewTransition` + `flushSync` with the expanding `clip-path: circle()` from click coords; reduced-motion / no-VT instant-swap fallbacks.
- `src/ui/ThemeToggle.tsx`, `TopBar.tsx` (wordmark+tagline, `Model: ready ✓` chip, toggle, ⚙), `SettingsSheet.tsx` (model-cache action slots — disabled until slice 6 wires them; theme not duplicated).
- `index.html` — inline pre-paint theme script (no flash) + meta description.
- a11y: `aria-live` on the review counts; focus rings everywhere; Escape closes the sheet.

**Demo mode for review:** run `pnpm dev` and open `…/?demo` — a "▶ Load sample document (demo)" button on the dropzone replays the embedded fixture (`src/demo/sampleDocument.ts`) through analyzing → review (all 12 Categories, masking, multi-occurrence locators) → redact → receipt, so the full UX can be reviewed without a real file.

**Pending for the human reviewer:**
- Visual sign-off against `docs/wireframes/` (look, spacing, the "quiet" feel) and the View-Transition timing/easing.
- AA contrast check of `--text` on `--bg`/`--surface` in both themes.
- **Font caveat:** JetBrains Mono / Inter are referenced as font-family stacks but **not self-hosted** — they fall back to `system-ui` / `ui-monospace` unless installed locally. Self-hosting the `woff2` (to guarantee the faces offline without a CDN fetch that would violate the privacy/offline promise) is left as a sign-off decision.
