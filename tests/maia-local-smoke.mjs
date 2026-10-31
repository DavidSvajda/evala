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
          elo: 1600,
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
  await page.locator('#humanStyle').selectOption('attacking');
  await page.goto(`chrome-extension://${id}/demo.html`);
  await page.waitForFunction(
    () =>
      document
        .querySelector('evala-bar')
        ?.shadowRoot.querySelector('.stats')
        .textContent.includes('Maia 1400:'),
    {},
    { timeout: 45000 },
  );
  assert.equal(remote.length, 0);
  console.log(
    'PASS real MV3 Maia inference, legal Black move, local-only requests, attacking bar integration',
  );
} finally {
  await context.close();
}
