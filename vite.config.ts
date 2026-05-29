import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // transformers.js dynamically loads ONNX-Runtime assets; pre-bundling it with
  // esbuild breaks those imports, so leave it to be resolved at runtime.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
