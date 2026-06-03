#!/usr/bin/env bash
# Wrapper for `pnpm test:e2e`.
#
# Default (no args): the canonical Docker path — build the ephemeral image and
# run the gate inside it; the container's exit code is the gate. This is the
# path the ultimate target (a RunPod GPU container) uses. Artifacts (downloaded
# output, Playwright report/trace) are copied out with `docker cp` afterwards —
# this avoids macOS bind-mount / file-sharing (TCC) restrictions on paths under
# ~/Documents.
#
# --local | --native : the macOS dev escape hatch (`pnpm test:e2e:local`).
# Docker Desktop on macOS can't pass the host GPU into a Linux container, so the
# q4f16 model (WebGPU + shader-f16) can't load there. This mode skips Docker and
# runs Playwright natively against the host's Chromium with E2E_GPU_MAC=1, which
# asks the config for a HARDWARE Metal-backed WebGPU adapter. Mac-only dev
# convenience — CI/RunPod always use the default Docker path above.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# --- macOS native run (no Docker) ---
case "${1:-}" in
  --local | --native)
    echo "[e2e] local native run — hardware Metal WebGPU via E2E_GPU_MAC=1"
    pnpm exec playwright install chromium || exit $?
    pnpm build || exit $?
    E2E_GPU_MAC=1 pnpm exec playwright test -c test/e2e/playwright.config.mjs
    exit $?
    ;;
  "") ;;
  *)
    echo "[e2e] unknown arg: $1 (use --local for the native macOS run)" >&2
    exit 2
    ;;
esac

IMAGE=redactyl-e2e
CONTAINER=redactyl-e2e-run
ARTIFACTS="$ROOT/test/e2e/artifacts"

echo "[e2e] building image ($IMAGE)..."
docker build -f test/e2e/Dockerfile -t "$IMAGE" . || exit $?

# Clear any stale container from an interrupted run.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "[e2e] running (cold model download from HF CDN)..."
# --shm-size lifts the 64 MB /dev/shm default that the threaded-WASM runtime
# would otherwise exhaust (belt-and-braces with --disable-dev-shm-usage).
docker run --name "$CONTAINER" --shm-size=2g "$IMAGE"
CODE=$?

echo "[e2e] copying artifacts..."
mkdir -p "$ARTIFACTS"
docker cp "$CONTAINER:/app/test/e2e/artifacts/." "$ARTIFACTS/" 2>/dev/null \
  || echo "[e2e] (no artifacts produced)"

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

echo "[e2e] exit code: $CODE"
exit $CODE
