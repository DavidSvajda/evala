import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { parsePgn } from '../src/study/game.js';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await mkdir('test-results', { recursive: true });
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.goto(base + '#/home');
  await page.locator('#journey-primary').click();
  assert.ok(page.url().endsWith('#/insights'));
  const games = ['a', 'b', 'c'].map((id) => {
    const g = parsePgn('[White "Player"]\n[Black "Opponent"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    g.id = id;
    const cp = (value) => ({
      kind: 'cp',
      value,
      depth: 18,
      lines: [
        { kind: 'cp', value, depth: 18, pv: ['e2e4'] },
        { kind: 'cp', value: value - 150, depth: 18, pv: ['d2d4'] },
      ],
    });
    g.analysis = {
      complete: true,
      positions: [
        cp(0),
        cp(-100),
        cp(0),
        {
          kind: 'mate',
          value: -1,
          depth: 18,
          lines: [{ kind: 'mate', value: -1, depth: 18, pv: ['d8h4'] }],
        },
        { kind: 'mate', value: -1, terminal: true, lines: [] },
      ],
      moves: [],
    };
    return g;
  });
  await page.evaluate(async (games) => {
    localStorage.setItem(
      'evala-display:guest',
      JSON.stringify({
        onboardingComplete: true,
        chessUsername: 'Player',
        sound: false,
        soundVersion: 1,
      }),
    );
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('evala-study', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('games', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('games', 'readwrite');
      games.forEach((g) => tx.objectStore('games').put(g));
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, games);
  await page.goto(base + '#/home');
  await page.reload();
  await page.locator('[data-journey-example="0"]').waitFor();
  await page.screenshot({ path: 'test-results/journey-desktop.png' });
  await page.locator('[data-journey-example="0"]').click();
  assert.match(await page.locator('#position-label').innerText(), /g4/);
  assert.equal(await page.locator('#analysis-coach-tab').getAttribute('aria-selected'), 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/journey-mobile-review.png' });
  const tabs = await page.locator('.analysis-tabs').boundingBox(),
    graph = await page.locator('#eval-graph').boundingBox();
  assert.ok(tabs.y < graph.y, 'mobile coach precedes graph');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + '#/home');
  await page.locator('#journey-primary').click();
  await page.locator('#puzzle-board [data-square="e2"]').click();
  await page.locator('#puzzle-board [data-square="e4"]').click();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('evala-display:guest')).lesson.done.length === 1,
  );
  await page.goto(base + '#/home');
  assert.match(await page.locator('.journey-progress').innerText(), /1\/6/);
  await page.locator('#toggle-language').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#training-journey h2').textContent ===
      'Recognise threats to the king',
  );
  await page.locator('#toggle-theme').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/journey-mobile-dark.png' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Persisted completion, including a reload, must offer the follow-up step.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('evala-display:guest'));
    p.lesson.done = [...p.lesson.ids];
    localStorage.setItem('evala-display:guest', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      document.querySelector('#training-journey h2').textContent === 'Today’s lesson is complete',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS import → evidence → coach → focused personal puzzle → saved progress → EN/dark/mobile → completion',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
