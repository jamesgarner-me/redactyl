#!/usr/bin/env bash
# Thin wrapper for `pnpm test:e2e`: build the ephemeral image and run it. The
# container's exit code is the gate. Artifacts (downloaded output, Playwright
# report/trace) are copied out with `docker cp` afterwards — this avoids macOS
# bind-mount / file-sharing (TCC) restrictions on paths under ~/Documents.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

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
