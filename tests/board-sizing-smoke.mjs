import { chromium } from 'playwright';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';
const server = createAnalysisServer({ publicReports: true });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const context = await chromium.launchPersistentContext(resolve('test-results/board-zoom-profile'), {
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined),
  headless: true,
  viewport: { width: 1440, height: 960 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--enable-unsafe-extension-debugging'],
});
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  const control = await context.newPage();
  await control.goto(`chrome-extension://${id}/popup.html`);
  const url = `http://127.0.0.1:${server.address().port}/study.html`;
  const opened = context.waitForEvent('page');
  const tab = await control.evaluate((url) => chrome.tabs.create({ url }), url);
  const page = await opened;
  await page.waitForLoadState();
  await page.locator('#toggle-sidebar').waitFor();
  const zoom = async (factor) => {
    await control.evaluate(({ id, factor }) => chrome.tabs.setZoom(id, factor), {
      id: tab.id,
      factor,
    });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  };

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const cases = [];
  for (const viewport of [
    { width: 1920, height: 1000 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [route, selector, footer] of [
      ['analysis', '#study-board', '.board-toolbar'],
      ['puzzles', '#puzzle-board', '.puzzle-board-footer'],
    ]) {
      await page.goto(url + '#/' + route);
      await page.locator(selector).waitFor();
      for (const factor of [0.8, 1, 1.25, 1.5]) {
        await zoom(factor);
        for (const collapsed of [false, true]) {
          if (
            (await page.evaluate(() => document.body.dataset.sidebarCollapsed === 'true')) !==
            collapsed
          )
            await page.locator('#toggle-sidebar').click();
          await page
            .waitForFunction(
              ({ selector, footer }) => {
                const b = document.querySelector(selector).getBoundingClientRect(),
                  f = document.querySelector(footer).getBoundingClientRect();
                return (
                  b.width > 120 &&
                  b.bottom <= innerHeight - 8 &&
                  f.bottom <= innerHeight - 8 &&
                  document.documentElement.scrollWidth <= innerWidth
                );
              },
              { selector, footer },
              { timeout: 4000 },
            )
            .catch(async (error) => {
              console.log(
                await page.evaluate(
                  ({ selector, footer }) => ({
                    board: document.querySelector(selector).getBoundingClientRect().toJSON(),
                    footer: document.querySelector(footer).getBoundingClientRect().toJSON(),
                    overflowing: [...document.querySelectorAll('body *')]
                      .filter(
                        (n) =>
                          n.getClientRects().length &&
                          n.getBoundingClientRect().right > innerWidth + 1,
                      )
                      .map((n) => ({
                        tag: n.tagName,
                        id: n.id,
                        cls: String(n.className).slice(0, 80),
                        right: n.getBoundingClientRect().right,
                        width: n.getBoundingClientRect().width,
                      }))
                      .slice(0, 15),
                    w: innerWidth,
                    h: innerHeight,
                    scroll: scrollY,
                    debug: document
                      .querySelector(selector)
                      .closest('.position-workspace, .puzzle-board-area').dataset.fitDebug,
                    css: document
                      .querySelector(selector)
                      .closest('.position-workspace, .puzzle-board-area')
                      .getAttribute('style'),
                    extra:
                      document.querySelector(selector).parentElement.getBoundingClientRect().width -
                      document.querySelector(selector).getBoundingClientRect().width,
                    caption: document
                      .querySelector('.board-caption')
                      .getBoundingClientRect()
                      .toJSON(),
                  }),
                  { selector, footer },
                ),
              );
              throw error;
            });
          const result = await page.locator(selector).evaluate((el) => {
            const b = el.getBoundingClientRect();
            return {
              width: Math.round(b.width),
              height: Math.round(b.height),
              bottom: Math.round(b.bottom),
              viewport: innerHeight,
            };
          });
          assert.ok(Math.abs(result.width - result.height) < 2, 'board must remain square');
          cases.push({ device: viewport.width, route, zoom: factor, collapsed, ...result });
        }
      }
      await zoom(1);
      if (viewport.width === 1920 || viewport.width === 390)
        await page.screenshot({ path: `test-results/board-fit-${viewport.width}-${route}.png` });
    }
  }
  console.log(
    'PASS',
    cases.length,
    'layouts: whole board + controls visible at 80/100/125/150% zoom, both sidebar states, desktop/laptop/tablet/phone',
  );
  console.log(JSON.stringify(cases.filter((c) => c.zoom === 1 && !c.collapsed)));
} finally {
  await context.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
