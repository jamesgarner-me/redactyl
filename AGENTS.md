# AGENTS.md

Guidance for cloud agents working in this repository.

## Cursor Cloud specific instructions

### Product

Redactyl is a **browser-only** SPA (Vite + React + TypeScript) that redacts PII from PDF, `.txt`, and `.md` files. There is **no backend**, database, or Docker stack.

### Dev workflow (important)

- **Do not use `pnpm dev`.** Vite's dep pre-bundling breaks transformers.js and hangs model load. Use:

  ```sh
  pnpm build
  pnpm preview --host 127.0.0.1 --port 4173
  ```

- Open **`http://127.0.0.1:4173`** (or `?demo` for the sample-document affordance once the model is cached).
- The preview server must serve with **cross-origin isolation** headers (`COOP: same-origin`, `COEP: require-corp`); `vite preview` sets these via `vite.config.ts`.

### Commands

| Task | Command |
|------|---------|
| Install | `pnpm install --frozen-lockfile` |
| Lint | `pnpm lint` (warnings in `App.tsx` / `ModelGate.tsx` are pre-existing) |
| Unit tests | `pnpm test` |
| Build | `pnpm build` |
| E2E | `pnpm test:e2e` — see caveats below |

There is **no** `npm run format` script in this repo.

### E2E caveats

`pnpm test:e2e` runs `test/e2e/run.sh`, which expects **hardware WebGPU** (documented for Apple Silicon with `E2E_GPU_MAC=1`). It will not run meaningfully on typical Linux cloud VMs. Unit tests (`pnpm test`) are the reliable CI-equivalent gate here.

### Model download in cloud VMs

The NER model (~770 MB from HuggingFace CDN) is required for interactive detection and the full review → redact flow. Model download may fail in some cloud environments (e.g. missing WebGPU / kernel support). Unit tests exercise detection and redaction without a live browser model.

### Optional system dependency

`pdftotext` on `PATH` enables an extra PDF corpus oracle in tests; tests skip gracefully if absent.
