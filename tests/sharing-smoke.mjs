import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
const directory = await mkdtemp(join(tmpdir(), 'evala-share-browser-'));
const server = createAnalysisServer({
  localEngineOnly: true,
  accounts: { store: createDocumentStore({ directory, connectionString: '' }) },
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
const original =
  '[White "Schweits"]\n[Black "Friend"]\n[Event "PRIVATE EVENT"]\n[Date "2026.10.20"]\n[Result "*"]\n\n1. e4 {PRIVATE NOTE} e5 2. Nf3 Nc6 *';
const today = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
const newGame =
  '[White "Schweits"]\n[Black "New player"]\n[Date "' +
  today +
  '"]\n[Result "1-0"]\n\n1. d4 d5 2. c4 1-0';
let stage = 0,
  providerRequests = 0;
const errors = [];
try {
  const fresh = await browser.newPage();
  await fresh.goto(base + '/study.html');
  await fresh.waitForFunction(() => document.documentElement.lang === 'en');
  await fresh.getByRole('link', { name: 'Overview', exact: true }).waitFor();
  await fresh.close();
  const owner = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await owner.addInitScript(() => {
    localStorage.setItem('evala-language', 'cs');
    localStorage.setItem(
      'evala-study-options',
      JSON.stringify({ lastUsername: 'Schweits', lastPlatform: 'chesscom' }),
    );
  });
  await owner.route('https://api.chess.com/**', (route) => {
    providerRequests++;
    route.fulfill({
      json: route.request().url().endsWith('/archives')
        ? { archives: ['https://api.chess.com/pub/player/schweits/games/2026/11'] }
        : {
            games: [original, ...(stage ? [newGame] : [])].map((pgn, i) => ({
              rules: 'chess',
              pgn,
              end_time: Date.now() / 1000 + i,
            })),
          },
    });
  });
  const page = await owner.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/study.html?lang=cs#/games');
  await page.locator('#pgn-input').fill(original);
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#library-count').textContent === '1');
  await page.goto(base + '/study.html?lang=cs#/analysis');
  await page.locator('#next-move').click();
  await page.locator('#next-move').click();
  const historyLength = await page.evaluate(() => history.length);
  await page.locator('#previous-move').click();
  assert.equal(new URL(page.url()).searchParams.get('ply'), '1');
  assert.equal(await page.evaluate(() => history.length), historyLength);
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#position-label').textContent.includes('e4'),
  );
  assert.equal(new URL(page.url()).searchParams.get('ply'), '1');
  await page.locator('#first-move').click();
  await page.locator('#study-board [data-square="e2"]').click();
  await page.locator('#study-board [data-square="e4"]').click();
  await page.locator('#study-board [data-square="c7"]').click();
  await page.locator('#study-board [data-square="c5"]').click();
  await page.locator('#previous-move').click();
  assert.equal(new URL(page.url()).searchParams.get('step'), '1');
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('#position-label').textContent.includes('1/2'),
  );
  await page.locator('#share-menu > summary').click();
  await page.locator('[data-share-mode="variation"]').click();
  await page.locator('#share-url').waitFor();
  const shared = await page.locator('#share-url').inputValue();
  assert.ok(shared.includes('share='));
  assert.ok(shared.includes('lang=cs'));
  const recipient = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await recipient.addInitScript(() => {
    localStorage.setItem('evala-language', 'en');
    localStorage.setItem('evala-display:guest', JSON.stringify({ language: 'en' }));
  });
  const viewer = await recipient.newPage();
  viewer.on('pageerror', (e) => errors.push(e.message));
  const cloud = [];
  viewer.on('request', (r) => {
    if (/\/api\/(analyze|review-game|opponent\/move)/.test(r.url())) cloud.push(r.url());
  });
  await viewer.goto(shared);
  await viewer.waitForFunction(() =>
    document.querySelector('#position-label').textContent.includes('1/2'),
  );
  assert.equal(await viewer.locator('html').getAttribute('lang'), 'cs');
  assert.equal(await viewer.locator('#shared-game-banner').isVisible(), true);
  assert.equal(await viewer.locator('#library-count').textContent(), '0');
  assert.equal(
    await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await viewer.locator('#return-game').click();
  await viewer.reload();
  await viewer.locator('#share-menu > summary').waitFor();
  await viewer.waitForFunction(
    () => document.querySelector('#shared-game-banner').hidden === false,
  );
  assert.equal(await viewer.locator('#return-game').isVisible(), false);
  assert.equal(cloud.length, 0);
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.locator('#share-menu > summary').click();
  await viewer.locator('.share-panel').waitFor();
  const panel = await viewer.locator('.share-panel').boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 390);
  await mkdir('test-results', { recursive: true });
  await viewer.screenshot({ path: 'test-results/share-mobile.png' });
  await viewer.locator('#share-menu > summary').click();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.locator('#share-menu > summary').click();
  await page.screenshot({ path: 'test-results/share-desktop.png' });
  await page.locator('#share-menu > summary').click();
  // Refresh fetches only new games and leaves the selected game/position intact.
  await page.locator('#return-game').click();
  await page.locator('#next-move').click();
  const selected = new URL(page.url()).searchParams.get('game'),
    ply = new URL(page.url()).searchParams.get('ply');
  stage = 1;
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#library-count').textContent === '2');
  assert.equal(new URL(page.url()).searchParams.get('game'), selected);
  assert.equal(new URL(page.url()).searchParams.get('ply'), ply);
  await page.goto(base + '/study.html?lang=cs#/games');
  await page.locator('#refresh-games').click();
  await page.waitForFunction(() =>
    document.querySelector('#library-refresh-status').textContent.includes('aktuální'),
  );
  assert.equal(await page.locator('#library-count').textContent(), '2');
  assert.ok((await page.locator('.status-today').count()) > 0);
  assert.ok(providerRequests > 0);
  // A recipient can save a personal copy, while revocation blocks later opens.
  await viewer.goto(shared);
  await viewer.waitForFunction(() =>
    document.querySelector('#position-label').textContent.includes('1/2'),
  );
  await viewer.locator('#save-shared-game').click();
  await viewer.waitForFunction(() => document.querySelector('#library-count').textContent === '1');
  await page.goto(base + '/study.html?lang=cs#/analysis');
  await page.locator('#share-menu > summary').click();
  await page.locator('.share-link-row button').click();
  await page.waitForFunction(() =>
    document.querySelector('#share-status').textContent.includes('zrušen'),
  );
  await viewer.reload();
  await viewer.waitForFunction(() =>
    document.querySelector('#shared-game-message').textContent.includes('není dostupná'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS default EN / explicit CS, exact URLs and reload, private-safe share in clean browser, variant, save copy, revoke, mobile menu, F5 import/dedup and preserved selection; zero cloud calculations',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  await rm(directory, { recursive: true, force: true });
}
