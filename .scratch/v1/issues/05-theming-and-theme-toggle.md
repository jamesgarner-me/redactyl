# Theming + View Transition theme toggle + settings sheet

Status: ready-for-human

## Parent

`.scratch/v1/PRD.md` (Redactyl v1)

## What to build

The app's visual design language and chrome — HITL because the View Transition effect and the overall look warrant a human design review against the wireframes.

Build a semantic-token theme system (CSS custom properties) for both themes, **dark by default** regardless of OS `prefers-color-scheme`, with the user's explicit choice persisted in `localStorage`. Use the navy-anchored ramp derived from the five brand colours with `#f17300` reserved as a true accent, plus functional red (danger/safety) and green (verified) outside the brand set. Use a system/sans font for chrome and **JetBrains Mono** for all data (values, Tokens, masked secrets, last-4, filenames). Implement the top-bar sun/moon toggle as the single source of truth using `document.startViewTransition` + `flushSync`, revealing the new theme with a `clip-path: circle()` expanding from the toggle's screen coordinates (~0.4s ease-out); skip the transition under `prefers-reduced-motion` and feature-detect to an instant swap. Add the ⚙ settings sheet with slots for model-cache actions (wired in slice 6) — theme is **not** duplicated there. Add the small-screen non-blocking advisory and the a11y baseline: visible `--accent` focus rings on every interactive element and `aria-live` regions for counts and safety messages.

## Acceptance criteria

- [ ] App opens dark with no stored preference; toggle persists choice to `localStorage`
- [ ] Semantic tokens match the PRD table for both dark and light themes
- [ ] Data renders in JetBrains Mono; chrome/prose renders in the sans UI font
- [ ] Theme toggle animates via View Transition `clip-path: circle()` from the button's coordinates
- [ ] `prefers-reduced-motion` and missing `startViewTransition` both fall back to an instant swap
- [ ] Settings sheet opens with model-cache action slots; theme is not duplicated in it
- [ ] Small-screen advisory appears without blocking use
- [ ] Every interactive element shows a visible focus ring; counts/safety use `aria-live`
- [ ] Human design review sign-off against `docs/wireframes/`

## Blocked by

- `.scratch/v1/issues/01-text-tracer-bullet.md`
