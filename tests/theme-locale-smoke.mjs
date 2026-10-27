import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createAnalysisServer } from '../server/index.mjs';

const server = createAnalysisServer({ token: 'theme-fixture', publicReports: true });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = process.env.EVALA_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EVALA_BROWSER_EXECUTABLE ||
    (process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : undefined),
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const messages = [
  'Nejvyšší chybovost: střední hra',
  '9 chyb z 54 vyhodnocených tahů (17 %). Projdi nejhorší pozici, najdi soupeřovu hrozbu a porovnej dva vlastní tahy.',
  'V 3 chybách engine ukazuje materiální ztrátu nejméně 2 bodů v prvních dvou půltazích varianty. Před tahem zkontroluj soupeřova braní a možnost dobrat zpět.',
  '2 tahů minulo nalezený mat. V tréninkové pozici projdi všechny šachy a ověř každou obranu soupeře.',
  '5 výher z 8 partií, ve kterých jsi měl alespoň +2,0. Vyhodnocené pozice z 10 partií; částečný rozbor může výhodu přehlédnout.',
  'Sicilian Defense: 1 výher, 0 remíz, 4 proher (černými).',
  '3 chyb z 17 vyhodnocených tahů s nízkým časem po tahu (10 % základního času, nejméně 10 a nejvýše 60 sekund).',
];
try {
  await page.addInitScript(() =>
    localStorage.setItem(
      'evala-display:guest',
      JSON.stringify({ onboardingComplete: true, soundVersion: 1 }),
    ),
  );
  await page.goto(base + '/study.html#/home');
  await page.locator('#toggle-theme').waitFor();
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(245, 244, 238)',
  );
  await page.evaluate((messages) => {
    const section = document.createElement('section');
    section.id = 'translation-fixture';
    for (const text of messages) {
      const p = document.createElement('p');
      p.textContent = text;
      section.append(p);
    }
    document.body.append(section);
  }, messages);
  await page.locator('#toggle-language').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#translation-fixture p').textContent === 'Most mistakes: middlegame',
  );
  const english = await page.locator('#translation-fixture').innerText();
  assert.ok(!/[ěščřžýáíéůúďťň]/i.test(english), english);
  assert.match(english, /Sicilian Defense: 1 wins, 0 draws, 4 losses as Black/);
  await page.locator('#toggle-language').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#translation-fixture p').textContent ===
      'Nejvyšší chybovost: střední hra',
  );
  assert.deepEqual(await page.locator('#translation-fixture p').allTextContents(), messages);
  await page.locator('#toggle-language').click();
  await page.locator('#toggle-language').click();
  assert.deepEqual(await page.locator('#translation-fixture p').allTextContents(), messages);
  await page.locator('#translation-fixture').evaluate((el) => el.remove());
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/parchment-light.png', fullPage: true });
  await page.locator('#toggle-theme').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    'rgb(27, 33, 29)',
  );
  await page.screenshot({ path: 'test-results/parchment-dark.png', fullPage: true });
  await page.reload();
  await page.locator('#toggle-theme').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.goto(base + '/study.html#/settings');
  await page.screenshot({ path: 'test-results/parchment-dark-settings.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, {
    timeout: 2000,
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/parchment-dark-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: unchanged parchment default, persistent dark mode, mobile header and CS↔EN round trips for all six insight categories; no engine calculation',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
