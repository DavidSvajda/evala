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
  await page.addInitScript(() => localStorage.setItem('evala-language', 'cs'));
  await page.route('https://lichess.org/api/user/LichessPlayer', (route) =>
    route.fulfill({
      json: { username: 'LichessPlayer' },
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.route(/^https:\/\/lichess\.org\/api\/games\/user\/LichessPlayer\?/, (route) =>
    route.fulfill({
      body: '[Site "https://lichess.org/game/Abcd1234"]\n[White "LichessPlayer"]\n[Black "Opponent"]\n\n1. e4 e5 1-0',
      contentType: 'application/x-chess-pgn',
      headers: { 'Access-Control-Allow-Origin': '*' },
    }),
  );
  await page.route('https://api.chess.com/pub/player/chessplayer/games/archives', (route) =>
    route.fulfill({ json: { archives: [] }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  );
  await page.goto(base + '#/settings');
  await page.locator('#linked-username').fill('ChessPlayer');
  await page.locator('#save-chess-profile').click();
  await page.locator('#linked-platform').selectOption('lichess');
  await page.locator('#linked-username').fill('https://lichess.org/@/LichessPlayer');
  await page.locator('#connect-chesscom').click();
  await page.locator('#lichess-profile a').waitFor();
  assert.equal(await page.locator('#chesscom-profile a').textContent(), 'ChessPlayer');
  await page.reload();
  await page.locator('#lichess-profile a').waitFor();
  assert.equal(await page.locator('#chesscom-profile a').textContent(), 'ChessPlayer');
  await page.waitForFunction(() => !document.querySelector('#refresh-games').disabled);
  await page.locator('[data-import-profile="lichess"]').click();
  await page.waitForFunction(() =>
    /1 nových|Duplicity přeskočeny/.test(document.querySelector('#import-status').textContent),
  );
  assert.equal(await page.locator('#platform').inputValue(), 'lichess');
  assert.equal(await page.locator('#username').inputValue(), 'LichessPlayer');
  await page.locator('#import-panel > summary').click();
  await page.locator('#platform').selectOption('chesscom');
  assert.equal(await page.locator('#username').inputValue(), 'ChessPlayer');
  await page.goto(base + '#/settings');
  await page.locator('[data-unlink-profile="chesscom"]').click();
  assert.equal(await page.locator('#chesscom-profile a').count(), 0);
  assert.equal(await page.locator('#lichess-profile a').textContent(), 'LichessPlayer');
  await page.goto(base + '#/games');
  if (!(await page.locator('#import-panel').evaluate((element) => element.open)))
    await page.locator('#import-panel > summary').click();
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
  if (!(await page.locator('#import-panel').evaluate((element) => element.open)))
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
  await page.waitForFunction(() =>
    /Position/.test(document.querySelector('#game-title').textContent),
  );
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
