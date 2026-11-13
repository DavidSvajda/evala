import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
import { classifyMove } from '../src/study/review.js';
const data = JSON.parse(
  await readFile(new URL('./fixtures/performance-rapid.json', import.meta.url)),
);
const game = parsePgn(data.pgn);
game.analysis = data.analysis;
game.analysis.moves = game.moves.map((m, i) =>
  classifyMove(m, game.analysis.positions[i], game.analysis.positions[i + 1]),
);
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
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('evala-language', 'cs');
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
  });
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.goto(base + '#/games');
  await page.locator('#library-sort').waitFor();
  await page.evaluate(async (game) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study');
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put(game);
      tx.oncomplete = r;
    });
    db.close();
  }, game);
  await page.goto(base + `?game=${game.id}&ply=10#/analysis`);
  await page.locator('.performance-estimate').first().waitFor();
  assert.ok((await page.locator('.performance-estimate').nth(0).textContent()).includes('1 697'));
  assert.ok((await page.locator('.performance-estimate').nth(1).textContent()).includes('1 714'));
  assert.ok(
    (await page.locator('.performance-estimate').nth(1).textContent()).includes('Předběžný odhad'),
  );
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/performance-desktop.png' });
  await page.locator('#toggle-language').click();
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.locator('#summary .performance-method').last().locator('summary').click();
  assert.ok(
    (await page.locator('#summary .performance-method').last().textContent()).includes(
      'The starting point is the player rating',
    ),
  );
  assert.ok(
    (await page.locator('.performance-estimate').nth(1).textContent()).includes(
      'Provisional estimate',
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/performance-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log(
    'PASS existing saved review derives updated performance without engine searches, shows baseline/provisional status and translates methodology on desktop/mobile',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
