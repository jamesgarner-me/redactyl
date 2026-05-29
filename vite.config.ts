import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// transformers.js's threaded ONNX-Runtime WASM needs SharedArrayBuffer, which
// requires cross-origin isolation. COEP `credentialless` keeps cross-origin
// model fetches from the HF CDN working without requiring CORP headers on them.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export default defineConfig({
  base: './',
  plugins: [react()],
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
    include: ['src/**/*.test.ts'],
  },
});
