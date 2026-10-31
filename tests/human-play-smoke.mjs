import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { Chess } from 'chess.js';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ token: 'human-ui-fixture', publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }),
  errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true })),
  );
  await page.route('**/api/opponent/config', (route) =>
    route.fulfill({ json: { available: true } }),
  );
  await page.route('**/api/opponent/move', (route) => {
    const request = route.request().postDataJSON();
    requests.push(request);
    const chess = new Chess(request.initialFen);
    for (const uci of request.moves)
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    const options = chess.moves({ verbose: true });
    const move = options.find((m) => m.san === (chess.turn() === 'w' ? 'e4' : 'e5')) || options[0];
    return route.fulfill({
      json: {
        move: move.from + move.to + (move.promotion || ''),
        styleApplied: request.style === 'attacking',
        sacrifice: false,
      },
    });
  });
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.goto(base + '#/practice');
  await page.locator('#workshop-human-tab').click();
  await page.waitForFunction(() => !document.querySelector('#human-new').disabled);
  await page.locator('#human-new').click();
  await page.locator('#human-board [data-square="e2"]').click();
  await page.locator('#human-board [data-square="e4"]').click();
  await page.waitForFunction(() =>
    document.querySelector('#human-moves').textContent.includes('e5'),
  );
  assert.equal(requests[0].style, 'natural');
  await page.reload();
  await page.locator('#workshop-human-tab').click();
  assert.match(await page.locator('#human-moves').innerText(), /e4 e5/);
  await page.locator('#human-resign').click();
  await page.locator('#human-setup summary').click();
  await page.locator('#human-style').selectOption('attacking');
  await page.locator('#human-color').selectOption('b');
  await page.locator('#human-elo').selectOption('1800');
  await page.locator('#human-new').click();
  await page.waitForFunction(() =>
    document.querySelector('#human-moves').textContent.includes('e4'),
  );
  assert.equal(requests.at(-1).style, 'attacking');
  assert.equal(requests.at(-1).elo, 1800);
  await page.locator('#human-save').click();
  await page.waitForFunction(() => document.body.dataset.page === 'analysis');
  assert.match(await page.locator('#game-title').innerText(), /Maia-3 1800/);
  await page.goto(base + '#/practice');
  await page.locator('#workshop-human-tab').click();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/human-play-desktop.png', fullPage: true });
  await page.locator('#toggle-theme').click();
  await page.locator('#toggle-language').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/human-play-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Maia UI, both styles/sides, rating, resume, save-to-review, bilingual/mobile. Inference mocked; native Maia tested separately.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
