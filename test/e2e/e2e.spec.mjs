import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// The text-Sample E2E slice. Drives the REAL UI through the whole journey —
// model gate (cold HF download) → drop → review → redact → download — then runs
// the three-legged, Manifest-based oracle against the downloaded output.
// See test/e2e/README.md for the Sample/Manifest vocabulary and the oracle.

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const samplePath = here('./samples/letter.md');
const manifestPath = here('./samples/letter.manifest.json');

// First visit downloads ~772 MB and warms the WASM runtime before the dropzone
// appears — generous so a slow line isn't mistaken for a failure.
const MODEL_READY_TIMEOUT = 10 * 60 * 1000;
const ANALYZE_TIMEOUT = 5 * 60 * 1000;

test('text Sample — NER recall + leak-free redaction (three-legged oracle)', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expected = manifest.entities.filter((e) => e.expectDetect);

  // Surface the in-browser story (model load progress, NER debug, errors) in the
  // container logs — invaluable when a run stalls.
  page.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  await page.goto('/');

  // --- Cross the model gate: real, cold download from the HF CDN ---
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.getByRole('button', { name: /Download model/ }).click();

  // The app swaps the gate for the dropzone only once the model is `ready`. Fail
  // fast & loud if the gate errors instead, rather than waiting out the timeout.
  const dropzone = page.getByText('Drop a file here');
  await Promise.race([
    dropzone.waitFor({ state: 'visible', timeout: MODEL_READY_TIMEOUT }),
    page
      .getByText('Download failed')
      .waitFor({ state: 'visible', timeout: MODEL_READY_TIMEOUT })
      .then(async () => {
        const msg = await page.locator('.model-error').textContent().catch(() => '');
        throw new Error(`Model gate entered error state: ${msg}`);
      }),
  ]);
  await expect(dropzone).toBeVisible();

  // --- Drop the Sample (hidden input; setInputFiles drives the real onChange) ---
  await page.locator('input[type="file"]').setInputFiles(samplePath);

  // --- Review screen (detection done: regex + NER) ---
  const redactButton = page.locator('.redact-bar button');
  await expect(redactButton).toBeVisible({ timeout: ANALYZE_TIMEOUT });

  // Leg 1 — DETECTED (recall): every expected entity surfaced as an Item. Read
  // off each review row's checkbox accessible name (`Redact <CATEGORY> <value>`).
  const detected = await page
    .locator('input.row-check')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || ''));
  for (const e of expected) {
    expect(
      detected.some((name) => name.includes(e.value)),
      `Leg 1 (detected): expected an Item containing "${e.value}" [${e.category}]. Detected items: ${JSON.stringify(detected)}`,
    ).toBe(true);
  }

  // --- Redact: accept-all is the default (nothing excluded/dismissed) ---
  await redactButton.click();

  // --- Capture the downloaded redacted output ---
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.output-card button.save').first().click();
  const download = await downloadPromise;
  const outPath = here('./artifacts/' + download.suggestedFilename());
  await download.saveAs(outPath);
  const output = await readFile(outPath, 'utf8');

  // Legs 2 & 3 — ABSENT + REPLACED, against the real output bytes.
  for (const e of expected) {
    expect(
      output.includes(e.value),
      `Leg 2 (absent): "${e.value}" [${e.category}] still present in the output`,
    ).toBe(false);
    expect(
      output.includes(e.token),
      `Leg 3 (replaced): token ${e.token} [${e.category}] missing from the output`,
    ).toBe(true);
  }
});
