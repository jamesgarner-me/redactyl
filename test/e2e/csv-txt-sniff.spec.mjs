import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// E2E slice for GitHub #11: CSV content uploaded as .txt is sniffed, reviewed with
// row/column locators, and redacted cell-by-cell. See test/e2e/README.md.

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const samplePath = here('./samples/contacts-csv-as-txt.txt');
const manifestPath = here('./samples/contacts-csv-as-txt.manifest.json');

const MODEL_READY_TIMEOUT = 10 * 60 * 1000;
const ANALYZE_TIMEOUT = 5 * 60 * 1000;

test.use({ video: 'on' });

test('CSV-in-.txt Sample — sniff, row/col locators, leak-free redaction', async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expected = manifest.entities.filter((e) => e.expectDetect);

  page.on('console', (m) => console.log(`[browser:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

  // Simulate a return visit with a cached model so the dropzone is available on
  // GPU-less hosts. Regex detection (emails, IPs, credit cards) still runs;
  // NER may be absent without WebGPU — the manifest asserts regex-detectable PII.
  await page.addInitScript(() => {
    localStorage.setItem('redactyl-model-cached', '1');
  });

  await page.goto('/');

  const dropzone = page.getByText('Drop a file here');
  await expect(dropzone).toBeVisible({ timeout: MODEL_READY_TIMEOUT });

  await page.locator('input[type="file"]').setInputFiles(samplePath);

  const redactButton = page.locator('.redact-bar button');
  await expect(redactButton).toBeVisible({ timeout: ANALYZE_TIMEOUT });

  // Sniff path: first email row should show row/column locator, not line numbers.
  const firstEmailRow = page.getByLabel(/Redact EMAIL beshelby0@t-online\.de/);
  await expect(firstEmailRow).toBeVisible();
  const locatorCell = page
    .locator('.review-list .row')
    .filter({ has: firstEmailRow })
    .locator('.row-locator');
  await expect(locatorCell).toHaveText(/^row \d+, col \d+/);

  const detected = await page
    .locator('input.row-check')
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || ''));
  for (const e of expected) {
    const found =
      e.category === 'CREDIT_CARD'
        ? detected.some(
            (name) => name.includes('CREDIT_CARD') && name.includes(e.value.slice(-4)),
          )
        : detected.some((name) => name.includes(e.value));
    expect(
      found,
      `Leg 1 (detected): expected an Item containing "${e.value}" [${e.category}]. Detected items: ${JSON.stringify(detected)}`,
    ).toBe(true);
  }

  await redactButton.click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('.output-card button.save').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('contacts-csv-as-txt.redacted.txt');

  const outPath = here('./artifacts/' + download.suggestedFilename());
  await download.saveAs(outPath);
  const output = await readFile(outPath, 'utf8');

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

  // Output must remain valid CSV (cell structure preserved on row 2).
  expect(output.startsWith('id,name,email,ip_address,credit_card\r\n')).toBe(true);
  const row2 = output.split('\r\n')[1];
  expect(row2).toMatch(/^1,Bert Eshelby,<EMAIL_1>,<IP_1>,<CREDIT_CARD_1>/);
});
