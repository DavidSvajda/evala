import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';
import { encodeTask } from '../src/training/study-kit.js';
import { parsePgn } from '../src/study/game.js';

const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/study.html`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('evala-language', 'en');
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
    const NativeWorker = Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('stockfish-19')) return new NativeWorker(url, options);
      }
      postMessage(command) {
        const send = (data) => queueMicrotask(() => this.onmessage?.({ data }));
        if (command === 'uci') send('uciok');
        if (command === 'isready') send('readyok');
        if (command.startsWith('go ')) {
          send('info depth 18 score cp 0 nodes 1000 pv h8g8');
          send('bestmove h8g8');
        }
      }
      terminate() {}
    };
  });
  await page.goto(base + '#/practice');
  await page.locator('#workshop-study-tab').click();
  await page.locator('.kit-editor').first().locator('summary').click();
  await page.locator('#kit-line-form [name=title]').fill('My Italian');
  await page.locator('#kit-line-form [name=pgn]').fill('1. e4 e5 2. Nf3 Nc6 3. Bc4 *');
  await page.locator('#kit-line-form button[type=submit],#kit-line-form .primary-button').click();
  await page.getByText('Line saved.', { exact: true }).waitFor();
  await page.locator('[data-kit=recall]').click();
  await page.locator('#kit-board [data-square=e2]').click();
  await page.locator('#kit-board [data-square=e4]').click();
  await page.getByText('Recalled. This position will return later.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close exercise', exact: true }).click();
  await page.locator('[data-kit=endgame][data-id=queen]').click();
  await page.locator('#kit-board [data-square=f5]').click();
  await page.locator('#kit-board [data-square=f4]').click();
  await page.waitForFunction(() =>
    document.querySelector('#kit-feedback').textContent.includes('Your move · 1/12'),
  );
  await page.getByRole('button', { name: 'Close exercise', exact: true }).click();
  await page.reload();
  await page.locator('#workshop-study-tab').click();
  await page.getByText('My Italian', { exact: true }).waitFor();
  const promotion = encodeTask({
    id: 'promotion',
    title: 'Promotion exercise',
    fen: '7k/P7/8/8/8/8/8/4K3 w - - 0 1',
    prompt: 'Choose an underpromotion.',
    solution: ['a7a8n'],
  });
  const requested = [];
  page.on('request', (r) => {
    if (r.isNavigationRequest()) requested.push(r.url());
  });
  await page.goto(base + '#/practice?exercise=' + promotion);
  await page.reload();
  await page.getByRole('button', { name: 'Save to my study', exact: true }).click();
  assert.ok(
    requested.length > 0 && requested.every((url) => !new URL(url).searchParams.has('exercise')),
    'exercise contents must stay out of the HTTP query',
  );
  await page.locator('#kit-board [data-square=a7]').click();
  await page.locator('#kit-board [data-square=a8]').click();
  await page.locator('#kit-promotion').getByRole('button', { name: 'Knight', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('#kit-board [data-square=a8]')
      .getAttribute('aria-label')
      .includes('knight'),
  );
  await page.locator('#kit-answer').fill('I chose a knight and checked the resulting draw.');
  await page.locator('#kit-done').click();
  await page.getByText('Answer saved. Completion is self-reported.', { exact: true }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/study-kit-desktop.png', fullPage: true });
  await page.locator('#toggle-theme').click();
  await page.locator('#toggle-language').click();
  await page.getByRole('tab', { name: 'Moje studium', exact: true }).waitFor();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'test-results/study-kit-mobile-dark.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 812, height: 375 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const game = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  await page.goto(base + '?lang=en#/games');
  await page.evaluate(async (g) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open('evala-study', 1);
      q.onsuccess = () => r(q.result);
    });
    await new Promise((r) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put(g);
      tx.oncomplete = r;
    });
    db.close();
  }, game);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(base + `?lang=en&game=${game.id}#/analysis`);
  await page.locator('#review-game').waitFor();
  assert.ok((await page.locator('#review-estimate').textContent()).includes('positions · about'));
  const layout = await page.evaluate(() => ({
    board: document.querySelector('#study-board').getBoundingClientRect().toJSON(),
    review: document.querySelector('#review-game').getBoundingClientRect().toJSON(),
  }));
  assert.ok(layout.review.y < 500 && layout.review.x > layout.board.x, JSON.stringify(layout));
  await page.locator('#toggle-settings').click();
  assert.equal(await page.locator('#study-depth').isVisible(), false);
  await page.locator('.advanced-settings summary').click();
  assert.equal(await page.locator('#study-depth').isVisible(), true);
  await page.locator('#close-settings').click();
  await page.screenshot({ path: 'test-results/study-workspace-laptop.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS repertoire save/reload/recall, engine reply, private fragment exercise import, underpromotion, answer persistence, bilingual themes, phone/landscape and laptop layout',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
