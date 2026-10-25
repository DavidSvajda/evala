// Focused board gestures in the real app; no analysis, sign-in or broad release suite.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';

const server = createAnalysisServer({ token: 'board-fixture', publicReports: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = process.env.EVALA_BASE_URL || `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EVALA_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EVALA_BROWSER_EXECUTABLE }
      : process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
        : {}),
  }),
  page = await browser.newPage({ viewport: { width: 1366, height: 900 } }),
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const square = (name) => page.locator(`#study-board [data-square="${name}"]`);
async function center(name) {
  const box = await square(name).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function drag(from, to, button = 'left') {
  const a = await center(from),
    b = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up({ button });
}
async function load(pgn) {
  await page.goto(base + '/study.html#/games');
  if (!(await page.locator('#import-panel').evaluate((el) => el.open)))
    await page.locator('#import-panel > summary').click();
  await page.locator('#pgn-input').fill(pgn);
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#pgn-input').value === '');
  await page.goto(base + '/study.html#/analysis');
  await square('a1').waitFor();
}
try {
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', '{"onboardingComplete":true}'),
  );
  await load('[White "Gesture fixture"]\n\n1. e4 e5 *');
  const drawings = page.locator('#study-board .user-drawing');
  await drag('e2', 'e4', 'right');
  assert.equal(await drawings.count(), 1);
  const originalPath = await drawings.first().getAttribute('d');
  await page.locator('#flip-board').click();
  assert.equal(await drawings.count(), 1);
  assert.notEqual(await drawings.first().getAttribute('d'), originalPath);
  await drag('e2', 'e4', 'right');
  assert.equal(await drawings.count(), 0);
  await square('e4').click({ button: 'right' });
  assert.equal(await page.locator('#study-board circle.user-drawing').count(), 1);
  await drag('e2', 'e4');
  assert.equal(await drawings.count(), 0);
  assert.match(await square('e4').locator('img').getAttribute('src'), /wP\.svg$/);
  assert.equal(await square('e2').locator('img').count(), 0);
  await square('e7').click();
  await square('e5').click();
  assert.match(await square('e5').locator('img').getAttribute('src'), /bP\.svg$/);
  await drag('e4', 'e7');
  assert.match(await square('e4').locator('img').getAttribute('src'), /wP\.svg$/);
  const a = await center('e4');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(1, 1, { steps: 4 });
  await page.mouse.up();
  assert.equal(await page.locator('.piece-drag-ghost').count(), 0);
  assert.match(await square('e4').locator('img').getAttribute('src'), /wP\.svg$/);
  await drag('a1', 'a8', 'right');
  await page.locator('#first-move').click();
  assert.equal(await drawings.count(), 0);
  await load('[SetUp "1"]\n[FEN "k7/5P2/8/8/8/8/8/7K w - - 0 1"]\n\n1. f8=Q+ Ka7 *');
  await drag('f7', 'f8');
  await page.locator('#promotion [data-promotion="q"]').click();
  assert.match(await square('f8').locator('img').getAttribute('src'), /wQ\.svg$/);
  if (process.env.EVALA_BASE_URL) {
    const version = await page.evaluate(
      async () => (await (await fetch('/manifest.json')).json()).version,
    );
    assert.equal(version, '2.2.4');
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: right-drag arrows/toggle, square marking, flipped board, drag moves, click moves, illegal/outside drops, position clearing and promotion.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
