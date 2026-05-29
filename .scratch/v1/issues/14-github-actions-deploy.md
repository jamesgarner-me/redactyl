# GitHub Actions deploy on push to main + PR preview channels

Status: ready-for-agent

## Parent

`.scratch/v1/PRD.md` (Redactyl v1) — see the `### Hosting` section.

## What to build

Codify what issue 13 proved manually: build and deploy on every push to `main`, and post a Firebase preview channel URL on every PR. The workflow runs `pnpm build` and then `firebase deploy --only hosting` (or the `FirebaseExtended/action-hosting-deploy` action) using a Google service account key stored as a GitHub Actions secret.

`firebase init hosting:github` scaffolds most of this — generates the service-account JSON, stores it in the repo as a secret, and writes two workflow files (one for `main`, one for PRs). The acceptance below is what should be true after the scaffolding is committed.

## Acceptance criteria

- [ ] `.github/workflows/firebase-hosting-merge.yml` (or equivalent) exists and runs `pnpm install` + `pnpm build` + Firebase deploy on push to `main`
- [ ] `.github/workflows/firebase-hosting-pull-request.yml` (or equivalent) exists and deploys to a Firebase preview channel for each PR; the PR receives a comment with the preview URL
- [ ] A `FIREBASE_SERVICE_ACCOUNT_*` secret is configured in the repo settings; the workflows reference it
- [ ] A push to `main` results in `redactyl.jamesgarner.me` updating without any local `firebase deploy` invocation
- [ ] A PR opened against `main` gets a working preview URL that itself has `crossOriginIsolated === true`

## Blocked by

- `.scratch/v1/issues/13-firebase-hosting-deploy.md` (the Firebase site and `firebase.json` must exist first)
