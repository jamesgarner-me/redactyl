import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// transformers.js's threaded ONNX-Runtime WASM needs SharedArrayBuffer, which
// requires cross-origin isolation. COEP `credentialless` keeps cross-origin
// model fetches from the HF CDN working without requiring CORP headers on them.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Offline support: precache the app shell + its deps (including the bundled
    // ONNX-Runtime WASM, ~22 MB, and transformers.js, ~23 MB) so a return visit
    // runs with no network at all. The 770 MB NER model is *not* precached here —
    // transformers.js already persists it in Cache Storage (`transformers-cache`)
    // on first download; the SW handles everything else. After the first load the
    // only thing that ever touched the network is the consent-gated model fetch.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        // The bundled wasm/transformers chunks dwarf workbox's 2 MB default, but
        // they're exactly the deps the offline NER path needs — raise the ceiling
        // so they're precached rather than silently skipped.
        globPatterns: ['**/*.{js,css,html,wasm}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
      manifest: {
        name: 'Redactyl',
        short_name: 'Redactyl',
        description: 'Strip PII from PDFs and text, entirely in your browser.',
        theme_color: '#06223f',
        background_color: '#06223f',
        display: 'standalone',
      },
    }),
  ],
  // transformers.js dynamically loads ONNX-Runtime assets; pre-bundling it with
  // esbuild breaks those imports, so leave it to be resolved at runtime. The
  // app is run via `pnpm build && pnpm preview` (the bundled path); `pnpm dev`
  // is known to hang loading the model and is not a supported run mode.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  test: {
    environment: 'node',
    // Co-located module tests plus the cross-cutting corpus regression in test/.
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
