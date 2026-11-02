import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', (e) => errors.push(e.message));
try {
  const base = `http://127.0.0.1:${server.address().port}/study.html`;
  await page.addInitScript(() =>
    localStorage.setItem('evala-display:guest', JSON.stringify({ onboardingComplete: true })),
  );
  for (const [route, button, board, footer] of [
    ['analysis', '#fullscreen-analysis', '#study-board', '.board-toolbar'],
    ['puzzles', '#fullscreen-puzzle', '#puzzle-board', '.puzzle-board-footer'],
    ['practice', '#fullscreen-practice', '#practice-board', null],
  ]) {
    await page.addInitScript(() => localStorage.setItem('evala-language', 'cs'));
    await page.goto(base + '#/' + route);
    await page.locator(button).waitFor();
    await page.locator(button).click();
    await page.waitForFunction(
      (button) =>
        !!document.fullscreenElement &&
        document.querySelector(button).getAttribute('aria-pressed') === 'true',
      button,
    );
    assert.equal(await page.locator(button).getAttribute('aria-pressed'), 'true');
    if (route === 'analysis') {
      await page.locator('#toggle-language').click();
      await page.waitForFunction(
        () => document.querySelector('#fullscreen-analysis').title === 'Exit fullscreen',
      );
    }
    if (footer)
      await page.waitForFunction(
        ({ board, footer }) => {
          const b = document.querySelector(board).getBoundingClientRect(),
            f = document.querySelector(footer).getBoundingClientRect();
          return (
            b.width > 120 &&
            b.bottom < innerHeight &&
            f.bottom < innerHeight &&
            document.documentElement.scrollWidth <= innerWidth
          );
        },
        { board, footer },
      );
    // Exiting through the browser also needs to update every route's button.
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(
      (button) =>
        !document.fullscreenElement &&
        document.querySelector(button).getAttribute('aria-pressed') === 'false',
      button,
    );
    assert.equal(await page.locator(button).getAttribute('aria-pressed'), 'false');
    await page.locator(button).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    await page.locator(button).click();
    await page.waitForFunction(() => !document.fullscreenElement);
  }
  // A permissions-policy / browser denial must remain recoverable, with no rejected promise.
  await page.goto(base + '#/analysis');
  await page.locator('#fullscreen-analysis').waitFor();
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => Promise.reject(new Error('Denied'));
  });
  await page.locator('#fullscreen-analysis').click();
  await page.waitForFunction(() =>
    document.querySelector('#app-error').textContent.includes('fullscreen'),
  );
  assert.equal(await page.locator('#fullscreen-analysis').isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS native fullscreen on analysis/puzzles/practice, viewport fit, CS/EN, browser exit and recoverable denial',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
