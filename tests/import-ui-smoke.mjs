import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.goto(base + '#/games');
  await page.locator('#pgn-input').fill(await readFile('tests/fixtures/immortal.pgn', 'utf8'));
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() =>
    document.querySelector('#import-status').textContent.includes('1 nových'),
  );
  await page.goto(base + '#/analysis');
  assert.match(await page.locator('#game-title').innerText(), /Anderssen/);
  await page.locator('#last-move').click();
  assert.match(await page.locator('#position-label').innerText(), /Be7#/);
  await page.goto(base + '#/games');
  await page.locator('#import-panel > summary').click();
  await page.locator('.fen-import > summary').click();
  await page.locator('#fen-input').fill('invalid');
  await page.locator('#import-fen').click();
  assert.match(await page.locator('#import-status').innerText(), /Neplatný FEN/);
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  await page.locator('#fen-input').fill(fen);
  await page.locator('#import-fen').click();
  await page.waitForFunction(() => document.body.dataset.page === 'analysis');
  assert.equal(await page.locator('#review-game').isDisabled(), true);
  assert.equal(await page.locator('#analyze-position').isEnabled(), true);
  await page.reload();
  assert.equal(await page.locator('#review-game').isDisabled(), true);
  assert.match(await page.locator('#game-title').innerText(), /Position/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS supplied PGN through UI, checkmate navigation, invalid FEN recovery, Black-to-move FEN and persisted position',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
