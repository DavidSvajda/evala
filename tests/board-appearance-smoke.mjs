import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';

const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/study.html`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.addInitScript(() => {
    if (!localStorage.getItem('evala-language')) localStorage.setItem('evala-language', 'en');
    if (!localStorage.getItem('evala-display:guest'))
      localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
  });
  await page.goto(base + '#/settings');
  for (const style of ['merida', 'chessnut']) {
    await page.locator('#piece-style').selectOption(style);
    await page.waitForFunction(
      (style) =>
        [...document.querySelectorAll('#piece-preview img, #preview-board img')].every(
          (img) =>
            img.src.includes('/pieces/' + style + '/') && img.complete && img.naturalWidth > 0,
        ),
      style,
    );
    assert.equal(await page.locator('#piece-preview img').count(), 12);
  }
  await page.locator('#piece-style').selectOption('letters');
  assert.equal(await page.locator('#piece-preview img').first().isVisible(), false);
  await page.locator('#piece-style').selectOption('chessnut');
  await page.locator('#board-motion').selectOption('quick');
  await page.locator('#arrow-style').selectOption('rounded');
  await page.reload();
  assert.equal(await page.locator('#piece-style').inputValue(), 'chessnut');
  assert.equal(await page.locator('#board-motion').inputValue(), 'quick');
  assert.equal(await page.locator('#arrow-style').inputValue(), 'rounded');
  for (const size of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 812, height: 375 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
  }
  await page.goto(base + '#/games');
  if (!(await page.locator('#import-panel').evaluate((el) => el.open)))
    await page.locator('#import-panel > summary').click();
  await page.locator('#pgn-input').fill('[White "Appearance"]\n[Black "Fixture"]\n\n1. e4 e5 *');
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#pgn-input').value === '');
  await page.goto(base + '#/analysis');
  const board = page.locator('#study-board');
  await board.locator('[data-square="e2"]').waitFor();
  assert.match(await board.locator('img').first().getAttribute('src'), /pieces\/chessnut\//);
  const bounds = await board.boundingBox();
  assert.ok(bounds.height > 300 && bounds.y + bounds.height < 720, 'whole board fits a laptop');
  const panel = await page.locator('.analysis-panel').boundingBox();
  assert.ok(panel.x > bounds.x + bounds.width, 'results remain beside the board');
  const from = await board.locator('[data-square="e2"]').boundingBox();
  const to = await board.locator('[data-square="e4"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  assert.equal(await board.locator('.user-drawing .rounded-board-arrow').isVisible(), true);
  assert.equal(await board.locator('.user-drawing .solid-board-arrow').isVisible(), false);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.locator('#arrow-style').selectOption('solid');
  await page.getByRole('button', { name: 'Analysis', exact: true }).click();
  assert.equal(await board.locator('.user-drawing .solid-board-arrow').isVisible(), true);
  assert.equal(await board.locator('.user-drawing .rounded-board-arrow').isVisible(), false);
  await page.locator('#toggle-language').click();
  await page.getByRole('link', { name: 'Nastavení', exact: true }).click();
  assert.equal(await page.getByText('Pohyb figurek', { exact: true }).isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS piece sets load and switch live; letters, reload persistence, both arrow styles, Czech labels and laptop/mobile layout',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
