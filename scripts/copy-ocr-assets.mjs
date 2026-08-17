// Provision the self-hosted Tesseract OCR assets under public/ocr so they are
// served same-origin (COEP `require-corp` blocks the tesseract.js CDN default)
// and precached for offline use by the PWA. Run before dev/build (see the
// `predev`/`prebuild` scripts). The assets are large binaries, so they are
// gitignored and regenerated here rather than committed.
import { mkdirSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'ocr');
const coreDir = join(root, 'node_modules', 'tesseract.js-core');
const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');

// tessdata_fast (English) — smaller/faster than the standard set, gzip-encoded to
// match tesseract.js's `gzip: true` fetch. ~1.9 MB.
const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';
const langOut = join(outDir, 'eng.traineddata.gz');

mkdirSync(outDir, { recursive: true });

// The Tesseract worker script.
copyFileSync(workerSrc, join(outDir, 'worker.min.js'));

// The LSTM WASM cores (plain / SIMD / relaxed-SIMD). tesseract.js picks the best
// one the browser supports at runtime, so ship all three.
const coreFiles = readdirSync(coreDir).filter((f) => /-lstm\.(js|wasm|wasm\.js)$/.test(f));
for (const f of coreFiles) copyFileSync(join(coreDir, f), join(outDir, f));

if (existsSync(langOut) && statSync(langOut).size > 0) {
  console.log(`[ocr-assets] worker + ${coreFiles.length} core files; lang already present.`);
} else {
  console.log('[ocr-assets] downloading eng.traineddata.gz …');
  const res = await fetch(LANG_URL);
  if (!res.ok) throw new Error(`Failed to download language data: HTTP ${res.status}`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(langOut, Buffer.from(await res.arrayBuffer()));
  console.log(`[ocr-assets] worker + ${coreFiles.length} core files + language data ready.`);
}
