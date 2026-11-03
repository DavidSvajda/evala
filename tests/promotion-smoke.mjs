import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { readFile } from 'node:fs/promises';
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
    await page.addInitScript(() => localStorage.setItem('evala-language', 'cs'));
    await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/puzzles`);
    if (piece === 'r' || piece === 'n') {
      const from = await page.locator('#puzzle-board [data-square="a7"]').boundingBox();
      const to = await page.locator('#puzzle-board [data-square="a8"]').boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
      await page.mouse.up();
    } else {
      await page.locator('#puzzle-board [data-square="a7"]').click();
      await page.locator('#puzzle-board [data-square="a8"]').click();
    }
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
  const bank = JSON.parse(await readFile('public/data/puzzles.json', 'utf8')).puzzles;
  for (const [index, id] of ['09pUi', '09trG', '03SEl'].entries()) {
    const puzzle = bank.find((p) => p.id === id);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('evala-language', 'cs');
      localStorage.setItem(
        'evala-display:guest',
        JSON.stringify({ onboardingComplete: true, autoNext: false }),
      );
    });
    await page.route('**/data/puzzles.json', (route) =>
      route.fulfill({ json: { puzzles: [puzzle] } }),
    );
    await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/puzzles`);
    if (index === 0) await page.locator('#fullscreen-puzzle').click();
    for (let ply = 1; ply < puzzle.moves.length; ply += 2) {
      const move = puzzle.moves[ply];
      const from = page.locator(`#puzzle-board [data-square="${move.slice(0, 2)}"]`);
      const to = page.locator(`#puzzle-board [data-square="${move.slice(2, 4)}"]`);
      await from.tap();
      await to.tap();
      if (move.length === 5) {
        await page.locator('#puzzle-promotion[open]').waitFor();
        await page.locator(`#puzzle-promotion [data-piece="${move[4]}"]`).tap();
      }
      await page.waitForFunction(() =>
        ['Správný tah', 'Správně'].includes(document.querySelector('#puzzle-status').textContent),
      );
    }
    assert.equal(await page.locator('#puzzle-status').textContent(), 'Správně');
    assert.equal(await page.locator('#puzzle-promotion').isVisible(), false);
    await context.close();
  }
  console.log(
    'PASS real black-pawn promotion puzzles, opponent underpromotion, touch and fullscreen',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
