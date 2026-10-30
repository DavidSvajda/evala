import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
const server = createAnalysisServer({ token: 'bulk-fixture', publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = `http://127.0.0.1:${server.address().port}/study.html#/games`;
const games = ['Alpha', 'Beta', 'Gamma'].map((name, i) =>
  parsePgn(
    `[White "${name}"]\n[Black "Other"]\n[Date "2026.10.${20 + i}"]\n\n1. ${['e4 e5 2. Nf3 Nc6', 'd4 d5 2. c4 e6', 'c4 e5 2. Nc3 Nf6'][i]} *`,
  ),
);
try {
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true })),
  );
  await page.goto(base);
  await page.locator('#library-sort').waitFor();
  await page.evaluate(async (games) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study', 1);
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const tx = db.transaction('games', 'readwrite');
      games.forEach((g) => tx.objectStore('games').put(g));
      tx.oncomplete = r;
    });
    db.close();
  }, games);
  await page.reload();
  await page.locator('.library-select-row').first().waitFor();
  await page.locator('#library-sort').selectOption('oldest');
  assert.match(await page.locator('#game-list .game-item').first().innerText(), /Alpha/);
  await page.locator('#library-search').fill('Beta');
  await page.locator('#library-select-visible').click();
  await page.locator('#library-search').fill('');
  assert.equal(await page.locator('#game-list input:checked').count(), 1);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#library-delete-selected').click();
  assert.equal(await page.locator('.library-select-row').count(), 3);
  page.once('dialog', (d) => d.accept());
  await page.locator('#library-delete-selected').click();
  await page.waitForFunction(() => document.querySelectorAll('.library-select-row').length === 2);
  await page.reload();
  assert.equal(await page.locator('.library-select-row').count(), 2);
  await page.locator('#toggle-language').click();
  await page.locator('#toggle-theme').click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/bulk-library-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/bulk-library-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  page.once('dialog', (d) => d.accept());
  await page.locator('#library-delete-all').click();
  await page.waitForFunction(() => document.querySelectorAll('.library-select-row').length === 0);
  await page.reload();
  assert.equal(await page.locator('.library-select-row').count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: sorting, filtered selection, cancel, selected/delete-all, reload persistence and mobile.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
