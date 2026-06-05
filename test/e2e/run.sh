#!/usr/bin/env bash
# Wrapper for `pnpm test:e2e` — the local, human-run PII-recall gate.
#
# Runs Playwright natively against the host's Chromium with E2E_GPU_MAC=1, which
# asks the config for a HARDWARE Metal-backed WebGPU adapter so the production
# q4f16 model (WebGPU + shader-f16) actually loads. Verified green on Apple
# Silicon. A GPU-less host falls back to the WASM/CPU EP, which lacks the
# model's GatherBlockQuantized kernel — running this gate in CI on a GPU host
# is tracked as a roadmap item (see test/e2e/README.md → Future).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "[e2e] native run — hardware Metal WebGPU via E2E_GPU_MAC=1"
pnpm exec playwright install chromium || exit $?
pnpm build || exit $?
E2E_GPU_MAC=1 pnpm exec playwright test -c test/e2e/playwright.config.mjs
