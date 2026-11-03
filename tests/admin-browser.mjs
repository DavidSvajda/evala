import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
try {
  const page = await browser.newPage();
  await page.route('**/api/admin/overview', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            name: '<img src=x onerror=alert(1)>',
            email: 'member@example.test',
            createdAt: Date.now(),
            lastLoginAt: null,
          },
        ],
        days: [{ date: '2026-11-03', loads: 8 }],
        generatedAt: Date.now(),
      }),
    }),
  );
  await mkdir('test-results', { recursive: true });
  for (const size of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(base + '/admin.html');
    await page.locator('#admin-data:not([hidden])').waitFor();
    assert.equal(await page.locator('#admin-users img').count(), 0);
    assert.ok((await page.locator('#admin-users').textContent()).includes('<img'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/admin-${size.width}.png`, fullPage: true });
  }
  await page.route('**/api/admin/overview', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Pouze pro správce.' }),
    }),
  );
  await page.locator('#reload-admin').click();
  await page.waitForFunction(
    () => document.querySelector('#admin-status').textContent === 'Pouze pro správce.',
  );
  assert.equal(await page.locator('#admin-data').isVisible(), false);
  await page.goto(base + '/privacy.html');
  await page.locator('#privacy-language').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(
    (await page.locator('[data-policy-extra]').textContent()).includes('Controller: David Svajda'),
  );
  await page.locator('#privacy-language').click();
  assert.ok(
    (await page.locator('[data-policy-extra]').textContent()).includes('Správcem je David Svajda'),
  );
  assert.equal((await page.request.get(base + '/terms.html')).status(), 200);
  console.log(
    'PASS private overview rendering, escaped profile data, denied refresh, responsive tables and bilingual privacy/terms',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
