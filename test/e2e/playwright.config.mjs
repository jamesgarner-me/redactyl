import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Repo root — the app is built and served (vite preview) from here.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// This gate runs natively on the host (see run.sh): E2E_GPU_MAC=1 asks headless
// Chromium for a HARDWARE Metal-backed WebGPU adapter so the production q4f16
// model (WebGPU + shader-f16, which software WebGPU lacks) actually loads.
// Verified green on Apple Silicon. Running it in CI on a GPU host needs a
// different (Vulkan) flag set — that's a roadmap item, see README → Future.
const gpuArgs = process.env.E2E_GPU_MAC
  ? [
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-unsafe-webgpu',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
    ]
  : [];

export default defineConfig({
  testDir: here('.'),
  testMatch: '**/*.spec.mjs',
  outputDir: here('./artifacts/test-output'),
  // Cold 772 MB model download + WASM warmup dominates; give the whole test room.
  timeout: 20 * 60 * 1000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: here('./artifacts/report') }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Containers default /dev/shm to 64 MB; the threaded-WASM/WebGPU runtime
          // exhausts it and hangs → write shared memory to /tmp instead.
          //
          // The model's q4f16 variant runs ONLY on the WebGPU EP (the WASM/CPU EP
          // lacks the GatherBlockQuantized kernel; software SwiftShader lacks
          // shader-f16). So this harness needs a HARDWARE WebGPU adapter — the
          // host's GPU, reached via the E2E_GPU_MAC flags above.
          args: ['--disable-dev-shm-usage', ...gpuArgs],
        },
      },
    },
  ],
  // Serve the real production path: `vite preview` applies the COOP/COEP headers
  // from vite.config.ts that the threaded-WASM NER pipeline needs.
  webServer: {
    // Bind explicit IPv4 — without --host, vite binds localhost (::1) and the
    // 127.0.0.1 readiness probe never connects (the spike hit the same thing).
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    cwd: repoRoot,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
