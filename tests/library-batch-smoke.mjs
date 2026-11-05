import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
import { Chess } from 'chess.js';
const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('evala-language', 'cs');
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem(
      'evala-study-options',
      JSON.stringify({ engine: 'lite', reportProfile: 'quick' }),
    );
  });
  const base = `http://127.0.0.1:${server.address().port}/study.html#/games`;
  await page.goto(base);
  await page.locator('#library-sort').waitFor();
  const games = Array.from({ length: 60 }, (_, i) => {
    const chess = new Chess();
    chess.header('White', `Player${i}`, 'Black', 'Other', 'Date', '2026.11.02');
    chess.move(chess.moves()[i % 20]);
    chess.move(chess.moves()[Math.floor(i / 20)]);
    return parsePgn(chess.pgn());
  });
  await page.evaluate(async (games) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study');
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
  await page.locator('#library-batch-count').selectOption('50');
  await page.locator('#library-select-recent').click();
  assert.equal(await page.locator('#game-list input:checked').count(), 50);
  await page.locator('#library-analyze-selected').click();
  await page.waitForFunction(() => document.querySelector('#report-cancel').hidden === false);
  assert.equal(await page.locator('#report-game-list input:checked').count(), 50);
  assert.ok(page.url().endsWith('#/insights'));
  await page.locator('#report-cancel').click();
  await page.waitForFunction(() => document.querySelector('#report-cancel').hidden === true);
  assert.equal(await page.locator('#report-game-list input:checked').count(), 50);
  assert.equal(await page.locator('#report-analyze').isEnabled(), true);
  assert.ok((await page.locator('#report-progress-text').textContent()).includes('Pozastaveno'));
  assert.deepEqual(errors, []);
  console.log(
    'PASS selecting 50 library games, starting existing local queue, pause and resume control without importing again',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
