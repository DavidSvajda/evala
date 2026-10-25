// One isolated display check; no engine search, account login or user data.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
import { summarize } from '../src/study/review.js';

const server = createAnalysisServer({ token: 'accuracy-fixture', publicReports: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = process.env.EVALA_BASE_URL || `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EVALA_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EVALA_BROWSER_EXECUTABLE }
      : process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
        : {}),
  }),
  page = await browser.newPage(),
  errors = [],
  game = parsePgn('[White "Accuracy fixture"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
game.analysis = {
  complete: true,
  positions: [0, -300, -300, -1000, -1000].map((value) => ({ kind: 'cp', value, depth: 18 })),
  moves: game.moves.map(() => ({ kind: 'best', accuracy: 100, loss: 0 })),
};
const expected = ['w', 'b'].map((color) => summarize(game)[color].accuracy.toFixed(1) + ' %');
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
  });
  await page.goto(base + '/study.html#/home');
  await page.locator('#home-board img').first().waitFor({ state: 'attached' });
  if (process.env.EVALA_BASE_URL) {
    const manifest = await page.evaluate(async () => (await fetch('/manifest.json')).json());
    assert.equal(manifest.version, '2.2.3');
  }
  await page.evaluate(async (game) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('evala-study', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').clear();
      tx.objectStore('games').put(game);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, game);
  await page.reload();
  await page.goto(base + '/study.html#/analysis');
  await page.locator('[data-analysis-tab="summary"]').click();
  await page.locator('#summary .accuracy-value').first().waitFor();
  assert.deepEqual(await page.locator('#summary .accuracy-value').allTextContents(), expected);
  await page.locator('#summary .accuracy-method summary').click();
  assert.match(await page.locator('#summary .accuracy-method').textContent(), /harmonický/);
  await page.locator('#toggle-language').click();
  await page.waitForFunction(
    () =>
      document.querySelector('.accuracy-method summary')?.textContent ===
      'How accuracy is calculated',
  );
  assert.deepEqual(await page.locator('#summary .accuracy-value').allTextContents(), expected);
  assert.match(
    await page.locator('#summary .accuracy-method').textContent(),
    /not the proprietary Chess.com CAPS2/,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: saved game accuracy recomputed from positions, Czech/English display, public method explanation. No engine search.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
