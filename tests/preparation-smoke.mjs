import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createAnalysisServer } from '../server/index.mjs';

const pgn = `[Event "Preparation fixture"]\n[White "Rival"]\n[Black "Other"]\n[Result "1-0"]\n\n1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 Nc6 1-0`;
const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('evala-language', 'en'));
  await page.route('https://lichess.org/api/games/user/Rival?**', (route) =>
    route.fulfill({ body: pgn, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route('https://tablebase.lichess.ovh/standard?**', (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { category: 'win', dtz: 7, moves: [{ uci: 'e2e3', category: 'loss' }] },
    }),
  );
  await page.goto(base + '/study.html#/games');
  if (!(await page.locator('#import-panel').evaluate((el) => el.open)))
    await page.locator('#import-panel > summary').click();
  await page.locator('#pgn-input').fill(pgn);
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#pgn-input').value === '');
  await page.goto(base + '/study.html#/analysis');
  await page.locator('#analysis-preparation-tab').click();
  await page.locator('#prep-book-load').click();
  assert.match(await page.locator('#prep-book-results').innerText(), /e4/);
  await page.getByText('PGN and repertoire', { exact: true }).click();
  assert.equal(await page.locator('#prep-pgn-tree button').count(), 2);
  await page.locator('#prep-pgn-tree button').first().click();
  await page.locator('#prep-node-note').fill('Tested alternative');
  await page.locator('#prep-note-save').click();
  await page.getByText('Note saved in PGN.').waitFor();
  await page.locator('#prep-repertoire-add').click();
  await page.getByText(/2 new lines saved/).waitFor();
  await page.getByText('Opponent preparation', { exact: true }).click();
  await page.locator('#prep-opponent-platform').selectOption('lichess');
  await page.locator('#prep-opponent-name').fill('Rival');
  await page.locator('#prep-opponent-load').click();
  await page.locator('#prep-opponent-results button').first().waitFor();
  assert.match(await page.locator('#prep-opponent-results').innerText(), /1\/0\/0/);
  await page.goto(base + '/study.html#/games');
  if (!(await page.locator('#import-panel').evaluate((el) => el.open)))
    await page.locator('#import-panel > summary').click();
  await page.locator('.fen-import > summary').click();
  await page.locator('#fen-input').fill('8/8/8/8/8/2K5/4Q3/7k w - - 0 1');
  await page.locator('#import-fen').click();
  await page.waitForFunction(() => document.querySelector('#fen-input').value === '');
  await page.locator('#analysis-preparation-tab').click();
  await page.getByText('Exact endgames · 7 pieces', { exact: true }).click();
  await page.locator('#prep-table-load').click();
  await page.locator('#prep-table-results button').first().waitFor();
  assert.match(await page.locator('#prep-table-status').innerText(), /Win.*DTZ 7/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS mobile preparation: PGN variants, repertoire, local book, opponent and tablebase',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
