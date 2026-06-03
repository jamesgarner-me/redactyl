# Ephemeral E2E harness: builds the app, serves it (vite preview, real COOP/COEP
# headers), and drives the real UI with Playwright. Default cold — the model is
# downloaded from the HF CDN inside the container on every run (ADR 0003).
# Built/run via `pnpm test:e2e`. Context is the repo root.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# The image's bundled corepack (Node 22.12.0) has stale signing keys and fails
# the pnpm signature check — install pnpm directly instead. (Spike finding.)
RUN npm install -g pnpm@10.33.0

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Playwright starts vite preview itself (webServer in the config) and runs the
# spec; its exit code is the pass/fail gate.
CMD ["pnpm", "exec", "playwright", "test", "-c", "test/e2e/playwright.config.mjs"]
