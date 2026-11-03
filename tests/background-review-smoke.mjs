import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ localEngineOnly: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('evala-language', 'cs');
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true }));
    localStorage.setItem(
      'evala-study-options',
      JSON.stringify({
        engine: 'lite',
        profile: 'custom',
        depth: 6,
        time: 100,
        hash: 16,
        multipv: 1,
      }),
    );
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/games`);
  await page.locator('#pgn-input').fill('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 d6 5. Nc3 Nf6 *');
  await page.locator('#import-pgn').click();
  await page.waitForFunction(() => document.querySelector('#pgn-input').value === '');
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/analysis`);
  await page.locator('#review-game').click();
  await page.evaluate(() => {
    window.testHidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.testHidden });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(
    () => document.querySelector('#review-game').textContent.includes('Znovu rozebrat'),
    null,
    { timeout: 45000, polling: 100 },
  );
  assert.ok(!(await page.locator('#review-estimate').textContent()).includes('pozastaven'));
  await page.evaluate(() => {
    window.testHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => {
    document.querySelector('#review-game').click();
    document.querySelector('#review-game').click();
  });
  await page.waitForFunction(() =>
    document.querySelector('#review-game').textContent.includes('Pokračovat v rozboru'),
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS real local review completes after hidden visibility event; returning renders and manual pause still works',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
