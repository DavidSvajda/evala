import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parsePgnCollection, annotatedPgn } from '../src/study/game.js';

const receipt = JSON.parse(await readFile('.local-data/deployment/deployment.json', 'utf8'));
const token = (await readFile('.local-data/deployment/api-token.txt', 'utf8')).trim();
const { games } = parsePgnCollection(await readFile('.local-data/schweits.pgn', 'utf8'));
const game = games[0];
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.EVALA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 1100 } });
  const errors = [];
  let workers = 0,
    wasm = 0,
    requests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('worker', () => workers++);
  page.on('request', (request) => {
    if (request.url().endsWith('.wasm')) wasm++;
    if (request.url().endsWith('/api/analyze')) requests++;
  });
  await page.goto(receipt.url, { timeout: 90000 });
  await page.locator('#backend').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#backend').inputValue(), 'server');
  await page.locator('#server-token').fill(token);
  await page.locator('#server-token').dispatchEvent('change');
  await page.locator('#test-server').click();
  await page.waitForFunction(
    () => document.querySelector('#server-status').textContent.startsWith('Připojeno'),
    {},
    { timeout: 60000 },
  );
  await page.locator('#close-settings').click();
  await page.locator('#pgn-input').fill(annotatedPgn(game));
  await page.locator('#import-pgn').click();
  const start = Date.now();
  await page.locator('#review-game').click();
  await page.waitForFunction(
    () => document.querySelector('#review-state').textContent === 'Uloženo',
    {},
    { timeout: 180000 },
  );
  const seconds = (Date.now() - start) / 1000;
  assert.equal(workers, 0);
  assert.equal(wasm, 0);
  assert.deepEqual(errors, []);
  assert.ok(requests >= game.moves.length);
  assert.equal(await page.locator('#eval-graph svg').count(), 1);
  assert.equal(await page.locator('.summary strong').count(), 2);
  const critical = page.locator('.move-button.blunder,.move-button.mistake');
  if (await critical.count()) await critical.first().click();
  await page.screenshot({ path: 'test-results/azure-study-desktop.png', fullPage: true });
  const benchmark = {
    plies: game.moves.length,
    seconds,
    profile: 'balanced',
    millisecondsPerPosition: 750,
    multipv: 3,
    workers,
    wasm,
    requests,
  };
  await writeFile(
    '.local-data/deployment/browser-benchmark.json',
    JSON.stringify(benchmark, null, 2),
  );
  console.log('PASS: actual Azure game review, graph, classifications, zero local workers/WASM');
  console.log(JSON.stringify(benchmark));
} finally {
  await browser.close();
}
