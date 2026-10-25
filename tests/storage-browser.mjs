// One isolated browser check for deletion/recreation and late-response races.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
import { parsePgn } from '../src/study/game.js';
const root = await mkdtemp(join(tmpdir(), 'evala-storage-browser-'));
await build({
  stdin: {
    contents:
      "export {account,accountRequest} from './src/study/account.js';export * from './src/study/storage.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  globalName: 'EvalaFixture',
  outfile: join(root, 'fixture.js'),
});
await writeFile(
  join(root, 'study.html'),
  '<!doctype html><html><head><script src="fixture.js" defer></script></head><body></body></html>',
);
const server = createAnalysisServer({ root, token: 'storage-fixture' });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
    headless: true,
    ...(process.env.EVALA_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EVALA_BROWSER_EXECUTABLE }
      : process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
        : {}),
  }),
  page = await browser.newPage();
let delay = false,
  started,
  release;
const gate = new Promise((r) => (release = r)),
  ready = new Promise((r) => (started = r)),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/account/library', async (route) => {
  if (delay) {
    started();
    await gate;
  }
  await route.fulfill({ json: { games: [] } });
});
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html`);
  await page.waitForFunction(() => window.EvalaFixture);
  const game = parsePgn('1. e4 e5 *');
  game.analysis = { complete: false, positions: [], moves: [] };
  await page.evaluate(async (game) => {
    const f = window.EvalaFixture;
    await f.setStorageIdentity(null);
    await f.saveGame({ ...game });
    f.account.user = { id: 'fixture-alice', generation: 'old' };
    await f.setStorageIdentity(f.account.user);
    window.oldGame = { ...game };
    await f.saveGame(window.oldGame);
    localStorage.setItem('evala-display:fixture-alice', '{"chessUsername":"private"}');
  }, game);
  assert.equal(
    await page.evaluate(async () => (await window.EvalaFixture.loadLibrary()).length),
    1,
  );
  await page.evaluate(async () => {
    const f = window.EvalaFixture;
    f.account.user = { id: 'fixture-alice', generation: 'new' };
    await f.setStorageIdentity(f.account.user);
    await f.saveGame(window.oldGame);
  });
  assert.equal(
    await page.evaluate(async () => (await window.EvalaFixture.loadLibrary()).length),
    0,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem('evala-display:fixture-alice')),
    null,
  );
  delay = true;
  await page.evaluate(() => {
    window.lateResult = window.EvalaFixture.accountRequest('library').then(
      () => false,
      (e) => e.name === 'AbortError',
    );
  });
  await ready;
  await page.evaluate(async () => {
    window.EvalaFixture.account.user = { id: 'fixture-bob', generation: 'bob' };
    await window.EvalaFixture.setStorageIdentity(window.EvalaFixture.account.user);
  });
  release();
  assert.equal(await page.evaluate(() => window.lateResult), true);
  await page.evaluate(async () => {
    window.EvalaFixture.account.user = null;
    await window.EvalaFixture.setStorageIdentity(null);
  });
  assert.equal(
    await page.evaluate(async () => (await window.EvalaFixture.loadLibrary()).length),
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: recreated account clears pending data/preferences, stale saves and late responses are rejected, guest data is preserved.',
  );
} finally {
  release();
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
