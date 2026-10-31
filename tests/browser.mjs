import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from '../scripts/serve.mjs';

await mkdir('test-results', { recursive: true });
const server = createServer(4174);
await new Promise((done) => server.on('listening', done));
const executablePath =
  process.env.EVALA_BROWSER ||
  process.env.EVALA_BROWSER_EXECUTABLE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const external = [];
await page.route('**/*', async (route) => {
  if (!route.request().url().startsWith('http://127.0.0.1:4174/')) {
    external.push(route.request().url());
    await route.abort();
  } else await route.continue();
});
const waitDone = () =>
  page.waitForFunction(
    () =>
      window.evalaDemo?.getStatus().state === 'done' &&
      window.evalaDemo.getStatus().fen ===
        document.querySelector('cg-board').getAttribute('data-fen'),
    {},
    { timeout: 30000 },
  );
const select = async (sample) => {
  await page.locator('#sample').selectOption(sample);
  await waitDone();
};
const score = () => page.evaluate(() => window.evalaDemo.getStatus().score);
try {
  await page.goto('http://127.0.0.1:4174/demo.html');
  await waitDone();
  assert.ok((await score()).depth >= 6, 'real WASM must finish a search');
  assert.equal(external.length, 0, 'no remote resources should be requested');
  assert.equal(await page.locator('evala-bar .rail').count(), 1);
  const rail = await page.locator('evala-bar .rail').boundingBox();
  const board = await page.locator('cg-board').boundingBox();
  assert.ok(rail.x + rail.width < board.x, 'bar should sit left of board');
  assert.equal(Math.round(rail.height), Math.round(board.height));
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });

  await select('white');
  assert.ok((await score()).value > 500, 'extra white queen must score positive');
  assert.ok(
    parseFloat(
      await page
        .locator('evala-bar .white')
        .first()
        .evaluate((el) => el.style.height),
    ) > 90,
  );
  await select('black');
  assert.ok(
    (await score()).value < -500,
    'extra black queen must score negative even with Black to move',
  );
  await select('mate');
  assert.equal((await score()).kind, 'mate');
  assert.equal((await score()).value, 1);
  await select('stalemate');
  assert.equal((await score()).value, 0);
  assert.equal((await score()).terminal, true);

  await page.locator('#flip').click();
  await page.waitForFunction(() =>
    document
      .querySelector('evala-bar')
      .shadowRoot.querySelector('.rail')
      .classList.contains('flipped'),
  );
  await page.locator('evala-bar .gear').click();
  assert.equal(await page.locator('evala-bar .popover').isVisible(), true);
  await page.locator('evala-bar [data-preset=quiet]').click();
  assert.equal(await page.locator('evala-bar #depth').inputValue(), '12');
  await page.locator('evala-bar .advanced-settings summary').click();
  await page.locator('evala-bar select#side').selectOption('right');
  await page.waitForFunction(() => {
    const shadow = document.querySelector('evala-bar').shadowRoot;
    return (
      shadow.querySelector('.rail').getBoundingClientRect().left >
      document.querySelector('cg-board').getBoundingClientRect().right
    );
  });
  await page.locator('evala-bar .toggle').click();
  assert.equal(await page.evaluate(() => window.evalaDemo.getStatus().state), 'paused');
  assert.equal(await page.locator('evala-bar .value').textContent(), '—');
  await page.locator('evala-bar .toggle').click();
  await waitDone();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('evala-bar .popover').isVisible(), false);

  await page.locator('#fen').fill('this is not FEN');
  await page.locator('#load-fen').click();
  assert.match(await page.locator('#fen-error').textContent(), /Neplatný/);
  await select('start');
  for (let i = 0; i < 5; i++) await page.locator('#next').click();
  await waitDone();
  assert.match(await page.evaluate(() => window.evalaDemo.getStatus().fen), /b KQkq/);
  await page.locator('#prev').click();
  await waitDone();

  // Inspect the shipped small viewport in the same visual QA pass.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'small viewport must not overflow',
  );
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('http://127.0.0.1:4174/popup.html');
  await page.setViewportSize({ width: 358, height: 600 });
  await page.screenshot({ path: 'test-results/popup.png', fullPage: true });
  assert.equal(await page.locator('[data-preset=quiet]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, [], 'no browser JavaScript or CSP errors');
  console.log(
    'PASS: real Stockfish WASM, ±signs, mate, stalemate, alignment, orientation, presets, pause/resume, FEN, rapid navigation, storage and narrow layout.',
  );
  console.log('Screenshots: test-results/{desktop,mobile,popup}.png');
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
