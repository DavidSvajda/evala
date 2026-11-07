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
  const openImport = async () => {
    await page.goto(base + '#/games');
    await page.locator('main[data-page="games"]:not([hidden])').waitFor();
    if (!(await page.locator('#import-panel').evaluate((panel) => panel.open)))
      await page.locator('#import-panel > summary').click();
  };
  const expectAnalysis = async (title) => {
    await page.locator('main[data-page="analysis"]:not([hidden])').waitFor();
    assert.match(await page.locator('#game-title').innerText(), title);
    assert.equal(await page.locator('#review-progress').isVisible(), false);
  };
  await page.addInitScript(() => localStorage.setItem('evala-language', 'cs'));
  await openImport();
  await page.locator('#pgn-file').setInputFiles({
    name: 'recent.pgn',
    mimeType: 'application/x-chess-pgn',
    buffer: Buffer.from('[White "Recent player"]\n[Date "2026.11.06"]\n\n1. d4 d5 *'),
  });
  await expectAnalysis(/Recent player/);
  await openImport();
  const historic = (await readFile('tests/fixtures/immortal.pgn', 'utf8')).replace(
    /^[^\n]+/,
    '[White "Adolf Anderssen"]\n[Black "Lionel Kieseritzky"]\n[Date "1851.06.21"]',
  );
  await page.locator('#pgn-input').fill(historic);
  await page.locator('#import-pgn').click();
  await expectAnalysis(/Anderssen/);
  await page.locator('#last-move').click();
  assert.match(await page.locator('#position-label').innerText(), /Be7#/);
  await openImport();
  assert.equal(await page.locator('#library-sort').inputValue(), 'imported');
  assert.match(await page.locator('#game-list .game-item').first().innerText(), /Anderssen/);
  await page.locator('#library-sort').selectOption('newest');
  assert.match(await page.locator('#game-list .game-item').first().innerText(), /Recent player/);
  await page.locator('#library-sort').selectOption('imported');
  await page
    .locator('#pgn-input')
    .fill('[Event "First game"]\n\n1. c4 e5 *\n\n[Event "Second game"]\n\n1. Nf3 d5 *');
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#pgn-input').value === '');
  assert.ok(page.url().endsWith('#/games'), 'bulk import leaves the library visible');
  await openImport();
  await page.locator('.fen-import > summary').click();
  await page.locator('#fen-input').fill('invalid');
  await page.locator('#import-fen').click();
  assert.match(await page.locator('#import-status').innerText(), /Neplatný FEN/);
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  await page.locator('#fen-input').fill(fen);
  await page.locator('#import-fen').click();
  await expectAnalysis(/Position/);
  assert.equal(await page.locator('#review-game').isDisabled(), true);
  assert.equal(await page.locator('#analyze-position').isEnabled(), true);
  assert.equal(await page.locator('#analysis-lines-tab').getAttribute('aria-selected'), 'true');
  await page.reload();
  assert.equal(await page.locator('#review-game').isDisabled(), true);
  assert.match(await page.locator('#game-title').innerText(), /Position/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS single pasted/file PGN and FEN open analysis, new imports sort first, batch stays in library',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
