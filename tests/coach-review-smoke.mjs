import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';

const server = createAnalysisServer({ token: 'coach-fixture', publicReports: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const game = parsePgn('[White "Coach fixture"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
game.analysis = {
  complete: true,
  positions: [
    {
      kind: 'cp',
      value: 20,
      depth: 18,
      lines: [
        { kind: 'cp', value: 20, depth: 18, pv: ['e2e4', 'e7e5', 'g1f3'] },
        { kind: 'cp', value: 15, depth: 18, pv: ['d2d4'] },
      ],
    },
    {
      kind: 'cp',
      value: -300,
      depth: 18,
      lines: [{ kind: 'cp', value: -300, depth: 18, pv: ['e7e5'] }],
    },
    {
      kind: 'cp',
      value: -300,
      depth: 18,
      lines: [{ kind: 'cp', value: -300, depth: 18, pv: ['e2e4'] }],
    },
    {
      kind: 'mate',
      value: -1,
      depth: 18,
      lines: [{ kind: 'mate', value: -1, depth: 18, pv: ['d8h4'] }],
    },
    { kind: 'mate', value: -1, depth: 18, terminal: true, lines: [] },
  ],
  moves: [],
};
try {
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true })),
  );
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.goto(base);
  await page.locator('#toggle-theme').waitFor();
  await page.evaluate(async (game) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('evala-study', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put(game);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, game);
  await page.goto(base + '#/analysis');
  await page.reload();
  await page.locator('#analysis-coach-tab').click();
  await page.locator('#coach-next').click();
  assert.match(await page.locator('#gm-coach-text').innerText(), /f3/);
  await page.locator('#coach-best').click();
  assert.equal(await page.locator('#return-game').isVisible(), true);
  const scroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.scrollY), scroll);
  assert.match(await page.locator('#position-label').innerText(), /2\/3/);
  await page.locator('#return-game').click();
  await page.locator('#coach-next').click();
  await page.locator('#gm-retry-btn').click();
  assert.equal(await page.locator('#gm-coach-card').isVisible(), false);
  assert.equal(await page.locator('.eval-score').innerText(), '—');
  await page.locator('#retry-cancel').click();
  await page.locator('#toggle-language').click();
  await page.waitForFunction(
    () => document.querySelector('#analysis-coach-tab').textContent === 'Coach',
  );
  assert.match(await page.locator('#coach-progress').innerText(), /Decision/);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/coach-desktop-light.png', fullPage: true });
  await page.locator('#toggle-theme').click();
  await page.screenshot({ path: 'test-results/coach-desktop-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/coach-mobile-dark.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: guided review, legal variation playback, keyboard without scroll, hidden retry hints, bilingual coach and mobile overflow.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
