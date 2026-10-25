import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

const context = await chromium.launchPersistentContext(resolve('test-results/live-profile'), {
  executablePath:
    process.env.EVALA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  viewport: { width: 1440, height: 1000 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--no-sandbox', '--enable-unsafe-extension-debugging'],
});
const page = context.pages()[0];
let failed = false;
try {
  const cdp = await context.browser().newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: resolve('dist') });
  for (const [name, url] of [
    ['lichess', 'https://lichess.org/analysis'],
    ['chesscom', 'https://www.chess.com/analysis'],
  ]) {
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /evala|engine|wasm|extension|frame/i.test(message.text()))
        messages.push(message.text().slice(0, 300));
    });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(
        () =>
          ['done', 'error'].includes(
            document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state,
          ),
        {},
        { timeout: 20000 },
      );
      if (name === 'chesscom') {
        const ok = page.getByRole('button', { name: /^ok$/i });
        if (await ok.isVisible().catch(() => false)) await ok.click();
        const reject = page.getByRole('button', { name: 'Reject All', exact: true });
        if (await reject.isVisible().catch(() => false)) await reject.click();
        const fresh = page.getByText('New Analysis', { exact: true });
        if (await fresh.isVisible().catch(() => false)) await fresh.click();
      }
      if ((await page.locator('evala-bar .rail').getAttribute('data-state')) === 'error')
        throw new Error('Engine error');
      console.log(`${name}: actual live analysis page reached Stockfish result`);
      const boardLocator = page.locator(name === 'lichess' ? 'cg-board' : 'wc-chess-board').first();
      const rect = await boardLocator.boundingBox();
      await boardLocator.click({
        position: { x: (rect.width * 4.5) / 8, y: (rect.height * 6.5) / 8 },
      });
      await boardLocator.click({
        position: { x: (rect.width * 4.5) / 8, y: (rect.height * 4.5) / 8 },
      });
      await page.waitForFunction(
        () =>
          ['loading', 'searching'].includes(
            document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state,
          ),
        {},
        { timeout: 5000 },
      );
      const [tab] = await page
        .context()
        .serviceWorkers()[0]
        .evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
      await page.waitForFunction(
        () =>
          document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state ===
          'done',
        {},
        { timeout: 15000 },
      );
      const status = await page
        .context()
        .serviceWorkers()[0]
        .evaluate(
          async (tabId) => chrome.tabs.sendMessage(tabId, { type: 'evala-status' }),
          tab.id,
        );
      if (!status.fen.includes('4P3'))
        throw new Error(`Move e2e4 was not reflected in evaluation: ${status.fen}`);
      console.log(`${name}: live e2e4 followed correctly (${status.fen})`);
    } catch (error) {
      failed = true;
      console.log(`${name}: ${error.message.split('\n')[0]}`);
    }
    const info = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      boards: [...document.querySelectorAll('cg-board,wc-chess-board,chess-board')].map((el) => ({
        tag: el.tagName,
        classes: el.className,
        pieces: el.querySelectorAll('piece,.piece').length,
        rect: {
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        },
        getFEN: typeof el.game?.getFEN,
      })),
      fenInputs: [...document.querySelectorAll('input')]
        .filter((el) => /fen/i.test(el.name + ' ' + el.className + ' ' + el.id))
        .map((el) => ({ name: el.name, value: el.value })),
      globalAnalysis: !!window.lichess?.analysis,
      globalSiteAnalysis: !!window.site?.analysis,
      status: document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail')?.dataset.state,
      score: document.querySelector('evala-bar')?.shadowRoot.querySelector('.value')?.textContent,
      detail: document.querySelector('evala-bar')?.shadowRoot.querySelector('.status-text')
        ?.textContent,
    }));
    console.log(JSON.stringify(info));
    await writeFile(`test-results/${name}-live.json`, JSON.stringify({ info, messages }, null, 2));
    await page.screenshot({ path: `test-results/${name}-live.png`, fullPage: false });
  }
} finally {
  await context.close();
}
if (failed) process.exitCode = 1;
