// One short release gate, no screenshot matrix or external sign-in.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { readFile } from 'node:fs/promises';
const server = createAnalysisServer({ token: 'release-fixture', publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = process.env.EVALA_BASE_URL || `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32'
      ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
      : {}),
  }),
  page = await browser.newPage({ viewport: { width: 1366, height: 768 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.route('https://api.chess.com/pub/player/schweits', (r) =>
    r.fulfill({ json: { username: 'Schweits' } }),
  );
  await page.goto(base + '/study.html#/home');
  await page.locator('#onboarding').waitFor();
  await page.locator('#onboarding-username').fill('https://www.chess.com/member/Schweits');
  await page.locator('#onboarding-rating').selectOption('1200');
  await page.locator('#onboarding-form [type=submit]').click();
  await page.locator('#onboarding').waitFor({ state: 'hidden' });
  await page.locator('#start-lesson').click();
  await page.waitForFunction(
    () => document.querySelector('#puzzle-status').textContent === 'Najdi nejlepší tah',
  );
  const bank = JSON.parse(await readFile('public/data/puzzles.json', 'utf8')).puzzles,
    id = (await page.locator('#puzzle-number').textContent()).replace('Úloha ', '').trim(),
    puzzle = bank.find((p) => p.id === id);
  for (let i = 1; i < puzzle.moves.length; i += 2) {
    const uci = puzzle.moves[i];
    for (const sq of [uci.slice(0, 2), uci.slice(2, 4)])
      await page.locator(`#puzzle-board [data-square="${sq}"]`).click();
    if (uci[4]) await page.locator(`#puzzle-promotion [data-piece="${uci[4]}"]`).click();
  }
  await page.waitForFunction(
    () => document.querySelector('.puzzle-feedback').dataset.state === 'success',
  );
  await page.goto(base + '/study.html#/home');
  assert.match(await page.locator('#lesson-progress').textContent(), /^1\/6/);
  await page.locator('#onboarding').waitFor({ state: 'hidden' });
  await page.goto(base + '/study.html#/settings');
  await page.locator('#linked-username').fill('https://www.chess.com/member/Schweits');
  await page.locator('#connect-chesscom').click();
  await page.waitForFunction(
    () => document.querySelector('#chesscom-profile a')?.textContent === 'schweits',
  );
  await page.goto(base + '/study.html#/games');
  await page
    .locator('#pgn-input')
    .fill('[White "Schweits"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.locator('#import-pgn').click();
  await page.goto(base + '/study.html#/analysis');
  await page.locator('#toggle-settings').click();
  await page.locator('#profile').selectOption('quick');
  await page.locator('#close-settings').click();
  await page.locator('#review-game').click();
  await page.waitForFunction(
    () => document.querySelector('#review-state').textContent === 'Uloženo',
  );
  assert.ok((await page.locator('#move-list .notation-eval').first().textContent()).trim());
  await page.locator('#toggle-language').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/study.html#/home');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.match(await page.locator('#lesson-progress').textContent(), /positions practised/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: onboarding, public profile connection, lesson solve/progress/reload, English mobile layout, short real streamed review. Public profile response is a fixture.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
