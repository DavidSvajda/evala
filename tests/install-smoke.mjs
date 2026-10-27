// Installation metadata + one mobile page. No engine search or account changes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { readFile } from 'node:fs/promises';

const server = createAnalysisServer({ token: 'install-fixture', publicReports: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = process.env.EVALA_BASE_URL || `http://127.0.0.1:${server.address().port}`,
  version = JSON.parse(await readFile('package.json', 'utf8')).version,
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EVALA_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EVALA_BROWSER_EXECUTABLE }
      : process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
        : {}),
  }),
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', '{"onboardingComplete":true}'),
  );
  await page.goto(base + '/study.html#/settings');
  const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href'),
    response = await page.request.get(new URL(manifestURL, base).href),
    manifest = await response.json();
  assert.ok(response.ok());
  assert.equal(manifest.name, 'Evala');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/study.html#/home');
  assert.equal(manifest.scope, '/');
  assert.notEqual(manifestURL, 'manifest.json'); // Preserve the extension manifest.
  assert.equal(
    await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'),
    'yes',
  );
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  for (const [url, size] of [
    [appleIcon, 180],
    ...manifest.icons.map((icon) => [icon.src, Number(icon.sizes.split('x')[0])]),
  ]) {
    const icon = await page.request.get(new URL(url, base).href),
      bytes = await icon.body();
    assert.ok(icon.ok());
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
  const session = await page.context().newCDPSession(page),
    parsed = await session.send('Page.getAppManifest');
  assert.deepEqual(parsed.errors, []);
  await page.locator('#install-app-help summary').click();
  assert.match(await page.locator('#install-app-help').textContent(), /Zvol Přidat na plochu/);
  await page.locator('#language-choice').selectOption('en');
  await page.waitForFunction(
    () =>
      document.querySelector('#install-app-help summary').textContent ===
      'Add Evala to your home screen',
  );
  assert.match(await page.locator('#install-app-help').textContent(), /Choose Add to Home Screen/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (process.env.EVALA_BASE_URL) {
    const deployed = await (await page.request.get(base + '/manifest.json')).json();
    assert.equal(deployed.version, version);
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: standalone manifest, iOS metadata, 180/192/512 icons, mobile CS/EN install guide, no page errors. Physical Safari installation requires the device.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
