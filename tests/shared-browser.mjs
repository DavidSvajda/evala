import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';

await mkdir('test-results', { recursive: true });
const server = createAnalysisServer({ token: 'private-owner-key', publicReports: true });
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.EVALA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  let workers = 0,
    wasm = 0,
    reviews = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('worker', () => workers++);
  page.on('request', (request) => {
    if (request.url().endsWith('.wasm')) wasm++;
    if (request.url().endsWith('/api/review-game')) {
      reviews++;
      assert.ok(!request.headers().authorization, 'friend must need no owner token');
    }
  });
  const games = [
    '1. f3 e5 2. g4 Qh4#',
    '1. g4 e5 2. f3 Qh4#',
    '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',
  ].map((moves, i) => ({
    rules: 'chess',
    end_time: 100 - i,
    pgn: `[Event "Shared test"]\n[White "Friend"]\n[Black "Opponent${i}"]\n[Result "${i === 2 ? '1-0' : '0-1'}"]\n[TimeControl "600"]\n[Date "2026.10.23"]\n\n${moves} ${i === 2 ? '1-0' : '0-1'}`,
  }));
  await page.route('https://api.chess.com/pub/player/friend/games/archives', (route) =>
    route.fulfill({
      json: { archives: ['https://api.chess.com/pub/player/friend/games/2026/10'] },
    }),
  );
  await page.route('https://api.chess.com/pub/player/friend/games/2026/10', (route) =>
    route.fulfill({ json: { games } }),
  );
  await page.goto(base + '/study.html');
  assert.equal(await page.locator('#analytics-workspace').isVisible(), true);
  assert.equal(await page.locator('#study-settings').isVisible(), false);
  await page.screenshot({ path: 'test-results/shared-start-desktop.png', fullPage: true });
  await page.locator('#report-username').fill('Friend');
  await page.locator('#report-count').selectOption('100');
  await page.locator('#load-report').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-game]').length === 3);
  await page.locator('[data-game]').nth(1).uncheck();
  assert.match(await page.locator('#report-analyze').textContent(), /2/);
  await page.locator('#report-analyze').click();
  await page.waitForFunction(
    () => document.querySelector('#report-progress-text').textContent.startsWith('Hotovo'),
    {},
    { timeout: 60000 },
  );
  assert.equal(reviews, 2);
  assert.equal(workers, 0);
  assert.equal(wasm, 0);
  assert.equal(await page.locator('.game-analysed').count(), 2);
  assert.match(
    await page.locator('.analytics-overview p').textContent(),
    /^2 dokončen/,
    'overview must honor the manually selected subset',
  );
  await page.screenshot({ path: 'test-results/shared-report-desktop.png', fullPage: true });
  await page.locator('[data-moment]').first().click();
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 1280, height: 640 },
  ]) {
    await page.setViewportSize(size);
    const before = await page.locator('#study-board').boundingBox();
    await page.keyboard.press('Home');
    const initial = await page.locator('#position-label').textContent();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await page.locator('#position-label').textContent(), initial);
    await page.locator('#move-filter').focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('#toggle-settings').click();
    const at = await page.locator('#position-label').textContent();
    await page.keyboard.press('ArrowLeft');
    assert.notEqual(
      await page.locator('#position-label').textContent(),
      at,
      'settings button focus must not disable arrows',
    );
    await page.locator('#close-settings').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    const after = await page.locator('#study-board').boundingBox();
    assert.deepEqual(after, before);
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.ok(
      after.height > size.height - 300,
      `board should use available height: ${after.height}`,
    );
    assert.equal(
      await page
        .locator('.position-workspace')
        .evaluate((el) => el.scrollHeight <= el.clientHeight),
      true,
    );
    await page.screenshot({ path: `test-results/shared-board-${size.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/shared-board-mobile.png', fullPage: true });
  await page.locator('#view-analytics').click();
  await page.screenshot({ path: 'test-results/shared-report-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.reload();
  assert.equal(await page.locator('#study-settings').isVisible(), false);
  await page.getByRole('heading', { name: 'Friend', exact: true }).waitFor();
  assert.match(await page.locator('.analytics-overview p').textContent(), /^2 dokončen/);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: fresh friend without token, 100-game option, manual subset, two real server reviews, no local engine, persistent insights, larger board, keyboard from board/filter/settings and desktop/mobile layouts',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
