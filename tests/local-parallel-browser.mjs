import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';

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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('evala-language', 'en');
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 12, configurable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    const NativeWorker = window.Worker;
    window.fixtureSearches = 0;
    window.fixtureCompleted = 0;
    window.fixtureWorkers = 0;
    window.Worker = class {
      constructor(url, opts) {
        if (!String(url).includes('stockfish-19')) return new NativeWorker(url, opts);
        window.fixtureWorkers++;
      }
      send(data) {
        if (!this.dead) this.onmessage?.({ data });
      }
      postMessage(command) {
        if (command === 'uci') queueMicrotask(() => this.send('uciok'));
        if (command === 'isready') queueMicrotask(() => this.send('readyok'));
        if (command.startsWith('go ')) {
          window.fixtureSearches++;
          this.timer = setTimeout(() => {
            for (let n = 1; n <= 3; n++)
              this.send('info depth 22 multipv ' + n + ' score cp 0 nodes 1000 pv e2e4 e7e5');
            window.fixtureCompleted++;
            this.send('bestmove e2e4');
          }, 220);
        }
        if (command === 'stop') {
          clearTimeout(this.timer);
          queueMicrotask(() => this.send('bestmove e2e4'));
        }
      }
      terminate() {
        this.dead = true;
        clearTimeout(this.timer);
      }
    };
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/study.html';
  const game = parsePgn('1. Nf3 Nf6 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 *');
  await page.goto(base + '#/games');
  await page.locator('#library-sort').waitFor();
  await page.evaluate(async (g) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study', 1);
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const t = db.transaction('games', 'readwrite');
      t.objectStore('games').put(g);
      t.oncomplete = r;
    });
    db.close();
  }, game);
  await page.goto(base + '?game=' + game.id + '#/analysis');
  await page.locator('#review-game').waitFor();
  await page.locator('#review-game').click();
  await page.waitForFunction(() => window.fixtureCompleted >= 2);
  await page.locator('#review-game').click();
  await page.waitForFunction(
    () => !document.querySelector('#review-game').classList.contains('running'),
  );
  const saved = await page.evaluate(async (id) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study', 1);
      q.onsuccess = () => r(q.result);
    });
    const game = await new Promise((r) => {
      const q = db.transaction('games').objectStore('games').get(id);
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return game;
  }, game.id);
  assert.equal(saved.analysis.complete, false);
  const done = saved.analysis.positions.filter(Boolean).length;
  assert.ok(done > 0 && done < game.fens.length);
  assert.equal(await page.evaluate(() => window.fixtureWorkers), 2);
  await page.reload();
  await page.locator('#review-game').waitFor();
  await page.locator('#review-game').click();
  await page.waitForFunction(
    () => document.querySelector('#review-state').textContent === 'Saved',
    {},
    { timeout: 15000 },
  );
  assert.equal(await page.evaluate(() => window.fixtureSearches), game.fens.length - done);
  await page.locator('#toggle-settings').click();
  await page.locator('#compute-mode').selectOption('eco');
  await page.waitForFunction(() =>
    document.querySelector('#local-performance').textContent.includes('1. Progress'),
  );
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/local-performance-desktop.png' });
  await page.locator('#toggle-language').click();
  await page.waitForFunction(() => document.documentElement.lang === 'cs');
  assert.ok(
    (await page.locator('#local-performance').textContent()).includes('Současné výpočty: 1'),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/local-performance-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS parallel review, pause/reload/resume, mode selection and bilingual desktop/mobile settings',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
