import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { url } = JSON.parse(await readFile('.local-data/deployment/deployment.json', 'utf8'));
const browser = await chromium.launch({
  executablePath:
    process.env.EVALA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  let workers = 0,
    wasm = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('worker', () => workers++);
  page.on('request', (r) => {
    if (r.url().endsWith('.wasm')) wasm++;
  });
  await page.goto(url + '/study.html');
  await page.locator('#report-username').waitFor();
  assert.equal(await page.locator('#study-settings').isVisible(), false);
  await page.locator('#report-username').fill('Schweits');
  await page.locator('#report-count').selectOption('10');
  await page.locator('#load-report').click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-game]').length === 10,
    {},
    { timeout: 60000 },
  );
  await page.locator('#report-all').uncheck();
  await page.locator('[data-game]').first().check();
  const started = Date.now();
  await page.locator('#report-analyze').click();
  await page.waitForFunction(
    () => document.querySelector('#report-progress-text').textContent.startsWith('Hotovo'),
    {},
    { timeout: 120000 },
  );
  assert.match(await page.locator('.analytics-overview p').textContent(), /^1 dokončen/);
  assert.equal(workers, 0);
  assert.equal(wasm, 0);
  await page.locator('[data-moment]').first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.locator('#position-label').textContent(), 'Výchozí pozice');
  await page.screenshot({ path: 'test-results/azure-public-board.png', fullPage: true });
  await page.locator('#view-analytics').click();
  await page.screenshot({ path: 'test-results/azure-public-report.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: 'PASS',
      imported: 10,
      reviewed: 1,
      seconds: Math.round((Date.now() - started) / 1000),
      workers,
      wasm,
      anonymous: true,
      keyboard: true,
    }),
  );
} finally {
  await browser.close();
}
