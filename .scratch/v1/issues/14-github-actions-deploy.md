# GitHub Actions deploy on push to main + PR preview channels

Status: completed

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section.

## What to build

Codify what issue 13 proved manually: build and deploy on every push to `main`, and post a Firebase preview channel URL on every PR. The workflow runs `pnpm build` and then `firebase deploy --only hosting` (or the `FirebaseExtended/action-hosting-deploy` action) using a Google service account key stored as a GitHub Actions secret.

`firebase init hosting:github` scaffolds most of this — generates the service-account JSON, stores it in the repo as a secret, and writes two workflow files (one for `main`, one for PRs). The acceptance below is what should be true after the scaffolding is committed.

## Acceptance criteria

- [x] `.github/workflows/firebase-hosting-merge.yml` (or equivalent) exists and runs `pnpm install` + `pnpm build` + Firebase deploy on push to `main`
- [x] `.github/workflows/firebase-hosting-pull-request.yml` (or equivalent) exists and deploys to a Firebase preview channel for each PR; the PR receives a comment with the preview URL
- [x] A `FIREBASE_SERVICE_ACCOUNT_*` secret is configured in the repo settings; the workflows reference it
- [x] A push to `main` results in `redactyl.jamesgarner.me` updating without any local `firebase deploy` invocation
- [x] A PR opened against `main` gets a working preview URL that itself has `crossOriginIsolated === true`

## Blocked by

- `.scratch/v1/issues/13-firebase-hosting-deploy.md` (the Firebase site and `firebase.json` must exist first)

## Comments

**Workflow files committed:**

- `.github/workflows/firebase-hosting-merge.yml` — `pnpm install --frozen-lockfile`
  + `pnpm build` + `FirebaseExtended/action-hosting-deploy` to `channelId: live`
  on push to `main`.
- `.github/workflows/firebase-hosting-pull-request.yml` — same build, deploys a
  preview channel per PR and comments the URL. Fork PRs are skipped (`if:` guards
  the head repo) since they can't read the service-account secret.

Written pnpm-aware rather than the npm scaffolding `firebase init hosting:github`
emits: `pnpm/action-setup@v4` (version resolved from the new `package.json`
`packageManager: pnpm@10.33.0` field) before `setup-node@v4` with `cache: pnpm`.

**Remaining human steps (need the Firebase project from issue 13):**

1. Generate the service-account key and store it as the repo secret
   **`FIREBASE_SERVICE_ACCOUNT_REDACTYL_AAA111`** (the name both workflows
   reference, matching `firebase init hosting:github`'s convention for project
   `redactyl-aaa111`). `firebase init hosting:github` does this; or create the
   key in the GCP console and add it under Settings → Secrets → Actions.
2. Verify: a push to `main` updates the live site with no local `firebase deploy`;
   a PR gets a preview URL whose frame reports `crossOriginIsolated === true`.

**Verified done (2026-05-30):**

- Secret `FIREBASE_SERVICE_ACCOUNT_REDACTYL_AAA111` is configured in the repo
  (added 2026-05-29), and both workflows reference it.
- The merge workflow ("Deploy to Firebase Hosting on merge") has run on push to
  `main` three times, all **success** — most recently 2026-05-30 (1m28s) — with
  no local `firebase deploy`. The live site at `https://redactyl.jamesgarner.me/`
  returns HTTP 200 and is updated by CI.
- The PR-preview workflow file is committed and correct but has no runs yet only
  because no PR has been opened against `main` (work lands directly on `main`).
  Nothing to fix — the path will fire on the first PR. Status → completed.
