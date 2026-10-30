import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ token: 'promotion-fixture', publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
});
try {
  for (const piece of ['q', 'r', 'b', 'n']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      page = await context.newPage();
    await page.addInitScript(() =>
      localStorage.setItem(
        'evala-display:guest',
        JSON.stringify({ onboardingComplete: true, autoNext: false }),
      ),
    );
    await page.route('**/data/puzzles.json', (route) =>
      route.fulfill({
        json: {
          puzzles: [
            {
              id: 'promote-' + piece,
              fen: '4k3/P7/8/8/8/8/8/7K b - - 0 1',
              moves: ['e8f8', 'a7a8' + piece],
              rating: 800,
              themes: ['promotion'],
            },
          ],
        },
      }),
    );
    await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/puzzles`);
    await page.locator('#puzzle-board [data-square="a7"]').click();
    await page.locator('#puzzle-board [data-square="a8"]').click();
    await page.locator('#puzzle-promotion[open]').waitFor();
    const box = await page.locator('#puzzle-promotion').boundingBox();
    assert.ok(
      box.y >= 0 && box.y + box.height <= 844,
      'promotion picker must be visible without scrolling',
    );
    await page.keyboard.press('Escape');
    await page.locator('#puzzle-board [data-square="a7"]').click();
    await page.locator('#puzzle-board [data-square="a8"]').click();
    await page.locator(`#puzzle-promotion [data-piece="${piece}"]`).click();
    await page.waitForFunction(
      () => document.querySelector('#puzzle-status').textContent === 'Správně',
    );
    assert.equal(await page.locator('#puzzle-promotion').isVisible(), false);
    await context.close();
  }
  console.log(
    'PASS: queen, rook, bishop and knight promotions, cancellation and mobile picker visibility.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
