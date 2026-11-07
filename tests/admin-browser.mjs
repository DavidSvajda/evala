import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const id = hash('browser-admin'),
  accountCookie = hash('browser-session'),
  grant = hash('browser-grant');
const directory = await mkdtemp(join(tmpdir(), 'evala-admin-ui-'));
const store = createDocumentStore({ directory, connectionString: '', databaseUrl: '' });
const now = Date.now();
await store.put('account:' + id, {
  id,
  name: '<img src=x onerror=alert(1)>',
  email: 'owner@example.test',
  createdAt: now,
  lastLoginAt: now,
  authEpoch: 'epoch',
  games: {},
  training: {},
});
await store.put('session:' + hash(accountCookie), {
  userId: id,
  epoch: 'epoch',
  cookieVersion: 1,
  expires: now + 60000,
  createdAt: now,
  adminGrantHash: hash(grant),
});
const server = createAnalysisServer({
  localEngineOnly: true,
  adminAccountId: id,
  accounts: { store },
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
try {
  const page = await browser.newPage();
  await page.context().addCookies([
    { name: 'evala_account', value: accountCookie, url: base },
    { name: 'evala_admin', value: grant, url: base },
  ]);
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await mkdir('test-results', { recursive: true });
  for (const size of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(base + '/admin');
    await page.locator('#admin-data:not([hidden])').waitFor();
    assert.equal(await page.locator('#admin-users img').count(), 0);
    assert.match(await page.locator('#admin-users').textContent(), /<img/);
    assert.equal(await page.locator('#admin-traffic-chart rect').count(), 30);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/admin-${size.width}.png` });
  }
  await store.remove('session:' + hash(accountCookie));
  await page.locator('#reload-admin').click();
  await page.getByText('Přístup je omezen na správce.', { exact: true }).waitFor();
  assert.equal(await page.locator('#admin-data').isVisible(), false);
  assert.equal(await page.locator('#admin-users tr').count(), 0);
  assert.deepEqual(failures, []);
  await page.goto(base + '/privacy.html');
  await page.locator('#privacy-language').click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.match(
    await page.getByText('A separate security cookie', { exact: false }).textContent(),
    /15 minutes/,
  );
  console.log(
    'PASS owner dashboard, responsive layout, literal account names, session revocation and privacy copy',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
}
