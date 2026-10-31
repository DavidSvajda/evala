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
  const measure = async (selector) =>
    page.locator(selector).evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      viewport: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
  for (const [route, selector] of [
    ['analysis', '#study-board'],
    ['puzzles', '#puzzle-board'],
  ]) {
    await page.goto(url + '#/' + route);
    await page.locator(selector).waitFor();
    await zoom(1);
    const normal = await measure(selector);
    await page.setViewportSize({ width: 1440, height: 600 });
    const short = await measure(selector);
    assert.ok(
      Math.abs(normal.width - short.width) < 3,
      route + ' board must not shrink with viewport height',
    );
    await page.setViewportSize({ width: 1440, height: 960 });
    const sizes = [];
    for (const factor of [0.8, 1, 1.25]) {
      await zoom(factor);
      const m = await measure(selector);
      assert.equal(m.overflow, false);
      assert.ok(m.width > 350);
      sizes.push({ zoom: factor, css: Math.round(m.width), viewport: m.viewport });
    }
    assert.ok(
      sizes[2].css * 1.25 >= sizes[1].css,
      route + ' 125% zoom must not make the displayed board smaller',
    );
    await zoom(1);
    const before = await measure(selector);
    await page.locator('#toggle-sidebar').click();
    await page.waitForFunction(() => document.body.dataset.sidebarCollapsed === 'true');
    // Wait for the existing 220 ms sidebar transition, not a polling test loop.
    await page.waitForTimeout(250);
    const collapsed = await measure(selector);
    assert.ok(collapsed.width >= before.width - 2);
    await page.locator('#toggle-sidebar').click();
    await page.waitForTimeout(250);
    console.log(route, JSON.stringify(sizes));
    if (route === 'analysis')
      await page.screenshot({ path: 'test-results/board-larger-analysis.png' });
  }
  console.log(
    'PASS real Chrome 80/100/125% zoom, height independence, sidebar expansion and no horizontal overflow',
  );
} finally {
  await context.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
