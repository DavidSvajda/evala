import { chromium } from 'playwright';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
const context = await chromium.launchPersistentContext(resolve('test-results/maia-profile'), {
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--enable-unsafe-extension-debugging'],
});
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', {
    path: resolve(process.env.EVALA_EXTENSION_DIR || 'dist'),
  });
  const page = await context.newPage();
  const remote = [];
  context.on('request', (r) => {
    if (/^https?:/.test(r.url())) remote.push(r.url());
  });
  await page.addInitScript(() => localStorage.setItem('evala-language', 'cs'));
  await page.goto(`chrome-extension://${id}/popup.html`);
  const result = await page.evaluate(async () => {
    const worker = new Worker(chrome.runtime.getURL('engine/maia-worker.js'), { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Local inference timeout')), 45000);
        worker.onmessage = ({ data }) => {
          clearTimeout(timer);
          data.error ? reject(new Error(data.error)) : resolve(data);
        };
        worker.onerror = (e) => reject(new Error(e.message));
        worker.postMessage({
          id: 1,
          initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          moves: ['e2e4'],
          elo: 2800,
        });
      });
    } finally {
      worker.terminate();
    }
  });
  const board = new Chess();
  board.move('e4');
  assert.ok(
    board.moves({ verbose: true }).some((m) => m.from + m.to + (m.promotion || '') === result.move),
  );
  assert.equal(remote.length, 0);
  await page.locator('#engine').selectOption('maia');
  assert.equal(await page.locator('#humanElo option').first().getAttribute('value'), '800');
  assert.equal(await page.locator('#humanElo option').last().getAttribute('value'), '2800');
  await page.locator('#humanElo').selectOption('2800');
  assert.deepEqual(
    await page.locator('#time option').evaluateAll((options) => options.map((o) => o.value)),
    ['300', '750', '1500', '3000', '5000', '7500', '10000', '15000', '30000'],
  );
  await page.locator('#humanStyle').selectOption('attacking');
  await page.goto(`chrome-extension://${id}/demo.html`);
  await page.waitForFunction(
    () =>
      document
        .querySelector('evala-bar')
        ?.shadowRoot.querySelector('.stats')
        .textContent.includes('Maia 2800:'),
    {},
    { timeout: 45000 },
  );
  assert.equal(remote.length, 0);
  assert.equal(await page.locator('evala-bar .human-arrow').isVisible(), true);
  const controls = await context.newPage();
  await controls.goto(`chrome-extension://${id}/popup.html`);
  assert.equal(await controls.locator('#humanElo').inputValue(), '2800');
  // Background tabs must keep calculating for this pause/resume check.
  await controls.locator('details.advanced-settings').evaluate((el) => (el.open = true));
  await controls.locator('[name="pauseHidden"]').uncheck();
  await controls.locator('[name="showArrows"]').uncheck();
  await page.waitForFunction(() => {
    const shadow = document.querySelector('evala-bar').shadowRoot;
    return (
      shadow.querySelector('.human-arrow').hasAttribute('hidden') &&
      !shadow.querySelector('.stats').textContent.includes('Maia 2800:') &&
      !shadow.querySelector('.rail').title.includes('Lidský návrh:')
    );
  });
  assert.equal(await page.locator('evala-bar .track').isVisible(), true);
  await controls.locator('[name="showBar"]').uncheck();
  await controls.locator('[name="showArrows"]').check();
  await page.waitForFunction(() => {
    const s = document.querySelector('evala-bar').shadowRoot;
    return (
      s.querySelector('.track').hidden && !s.querySelector('.human-arrow').hasAttribute('hidden')
    );
  });
  assert.equal(await page.locator('evala-bar .gear').isVisible(), true);
  await controls.locator('[name="enabled"]').uncheck();
  await page.waitForFunction(
    () =>
      document.querySelector('evala-bar').shadowRoot.querySelector('.rail').dataset.state ===
      'paused',
  );
  assert.equal(await page.locator('evala-bar .human-arrow').isVisible(), false);
  await controls.reload();
  assert.equal(await controls.locator('[name="enabled"]').isChecked(), false);
  assert.equal(await controls.locator('[name="showBar"]').isChecked(), false);
  assert.equal(await controls.locator('[name="showArrows"]').isChecked(), true);
  await controls.locator('.power').click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('evala-bar')
        .shadowRoot.querySelector('.stats')
        .textContent.includes('Maia 2800:'),
    {},
    { timeout: 45000 },
  );
  assert.equal(await controls.locator('[name="enabled"]').isChecked(), true);
  // With the entire bar hidden, its settings control still lets the user restore it.
  await page.locator('evala-bar .gear').click();
  await page.locator('evala-bar [name="showBar"]').check();
  await page.locator('evala-bar .close').click();
  assert.equal(await page.locator('evala-bar .track').isVisible(), true);
  assert.equal(remote.length, 0);
  console.log(
    'PASS independent bar/arrows visibility, hidden move copy, saved controls and real Maia pause/resume',
  );
  console.log(
    'PASS real MV3 Maia inference, legal Black move, local-only requests, attacking bar integration',
  );
} finally {
  await context.close();
}
