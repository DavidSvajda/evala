// One disposable account, two device contexts, no engine searches or real Google sign-in.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
import { parsePgn } from '../src/study/game.js';
const directory = await mkdtemp(join(tmpdir(), 'evala-account-experience-')),
  server = createAnalysisServer({
    token: 'experience-fixture',
    publicReports: true,
    accounts: {
      store: createDocumentStore({ directory }),
      googleClientId: 'fixture.apps.googleusercontent.com',
      verifyGoogle: async (token) => JSON.parse(token),
    },
  });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`,
  browser = await chromium.launch({
    headless: true,
    ...(process.env.EVALA_BROWSER_EXECUTABLE
      ? { executablePath: process.env.EVALA_BROWSER_EXECUTABLE }
      : process.platform === 'win32'
        ? { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }
        : {}),
  }),
  desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } }),
  phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  }),
  pc = await desktop.newPage(),
  mobile = await phone.newPage(),
  errors = [];
for (const page of [pc, mobile]) page.on('pageerror', (e) => errors.push(e.message));
async function login(context) {
  const config = await (await context.request.get(base + '/api/account/config')).json(),
    response = await context.request.post(base + '/api/account/google', {
      headers: { 'X-CSRF-Token': config.challenge },
      data: {
        credential: JSON.stringify({
          sub: 'experience-user',
          email: 'fixture@example.test',
          email_verified: true,
          name: 'Fixture player',
          nonce: config.challenge,
        }),
      },
    });
  assert.ok(response.ok());
  return response.json();
}
async function saved(context, predicate) {
  for (let i = 0; i < 25; i++) {
    const state = await (await context.request.get(base + '/api/account/me')).json();
    if (predicate(state.user.preferences)) return state.user.preferences;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error('Account preferences did not reach the server');
}
try {
  const session = await login(desktop),
    headers = {
      'X-CSRF-Token': session.csrf,
      'X-Evala-Account': session.user.id,
      'X-Evala-Generation': session.user.generation,
    };
  const profile = await desktop.request.patch(base + '/api/account/profile', {
    headers,
    data: { preferences: { onboardingComplete: true, sound: false } },
  });
  assert.ok(profile.ok());
  const game = parsePgn('[White "Fixture player"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6 *');
  game.notes = 'A note shared between devices';
  const upload = await desktop.request.put(base + '/api/account/library/' + game.id, {
    headers,
    data: game,
  });
  assert.ok(upload.ok());
  await pc.addInitScript(() => {
    window.moveSoundCount = 0;
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      createOscillator() {
        window.moveSoundCount++;
        return super.createOscillator();
      }
    };
  });
  let releaseMe, releaseLibrary, meStarted, libraryStarted;
  const meGate = new Promise((r) => {
      releaseMe = r;
    }),
    libraryGate = new Promise((r) => {
      releaseLibrary = r;
    }),
    meReady = new Promise((r) => {
      meStarted = r;
    }),
    libraryReady = new Promise((r) => {
      libraryStarted = r;
    });
  await pc.route('**/api/account/me', async (route) => {
    meStarted();
    await meGate;
    await route.continue();
  });
  await pc.route('**/api/account/library', async (route) => {
    libraryStarted();
    await libraryGate;
    await route.continue();
  });
  await pc.goto(base + '/study.html#/settings', { waitUntil: 'commit' });
  await meReady;
  assert.equal(await pc.locator('#header-signin').textContent(), 'Ověřuji přihlášení…');
  releaseMe();
  await libraryReady;
  assert.equal(await pc.locator('#header-signin').textContent(), 'Můj účet');
  releaseLibrary();
  await pc.locator('#home-board img').first().waitFor({ state: 'attached' });
  assert.equal(await pc.locator('#move-sound').isChecked(), true);
  await pc.locator('[data-board-theme="walnut"]').click();
  await pc.locator('#show-coordinates').uncheck();
  await pc.locator('#language-choice').selectOption('en');
  await pc.goto(base + '/study.html#/analysis');
  await pc.locator('#toggle-settings').click();
  await pc.locator('#profile').selectOption('deep');
  await pc.locator('#study-lines').selectOption('2');
  await pc.locator('#close-settings').click();
  await pc.locator('#next-move').click();
  await pc.locator('#next-move').click();
  await pc.locator('#flip-board').click();
  assert.ok((await pc.evaluate(() => window.moveSoundCount)) >= 2);
  await saved(
    desktop,
    (p) =>
      p.study?.multipv === 2 &&
      p.lastPosition?.ply === 2 &&
      p.lastPosition.flipped &&
      p.soundVersion === 1,
  );
  await login(phone);
  await mobile.goto(base + '/study.html#/analysis');
  await mobile.locator('#home-board img').first().waitFor({ state: 'attached' });
  assert.match(
    await mobile.locator('#study-board [data-square="e5"] img').getAttribute('src'),
    /bP.svg$/,
  );
  assert.equal(await mobile.locator('#study-board .file-label').first().textContent(), 'h');
  assert.equal(await mobile.locator('#game-note').inputValue(), game.notes);
  const next = await mobile.locator('#next-move').boundingBox(),
    last = await mobile.locator('#last-move').boundingBox();
  assert.ok(next.width >= 44 && next.height >= 44 && last.x - next.x - next.width >= 70);
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  if (process.platform === 'win32') {
    await mkdir('.local-data/account-experience', { recursive: true });
    await pc.screenshot({ path: '.local-data/account-experience/desktop.png' });
    await mobile.screenshot({ path: '.local-data/account-experience/mobile.png' });
  }
  await mobile.goto(base + '/study.html#/settings');
  assert.equal(await mobile.locator('#move-sound').isChecked(), true);
  assert.equal(await mobile.locator('#show-coordinates').isChecked(), false);
  assert.equal(await mobile.evaluate(() => document.body.dataset.boardTheme), 'walnut');
  let fail = true;
  await mobile.route('**/api/account/profile', async (route) =>
    fail ? route.fulfill({ status: 503, json: { error: 'Offline fixture' } }) : route.continue(),
  );
  const failedSave = mobile.waitForResponse(
    (r) => r.url().endsWith('/api/account/profile') && r.status() === 503,
  );
  await mobile.locator('#move-sound').uncheck();
  await mobile.locator('#show-coordinates').check();
  await failedSave;
  await pc.goto(base + '/study.html#/settings');
  await pc.locator('[data-board-theme="blue"]').click();
  await saved(desktop, (p) => p.boardTheme === 'blue');
  await mobile.reload();
  await mobile.locator('#home-board img').first().waitFor({ state: 'attached' });
  assert.equal(await mobile.locator('#move-sound').isChecked(), false);
  fail = false;
  await mobile.evaluate(() => dispatchEvent(new Event('online')));
  await saved(phone, (p) => p.sound === false && p.coordinates === true && p.boardTheme === 'blue');
  await pc.evaluate(() => dispatchEvent(new Event('online')));
  await pc.waitForFunction(() => document.querySelector('#move-sound').checked === false);
  const sounds = await pc.evaluate(() => window.moveSoundCount);
  await pc.goto(base + '/study.html#/analysis');
  await pc.locator('#previous-move').click();
  assert.equal(await pc.evaluate(() => window.moveSoundCount), sounds);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: sign-in state before slow library; default sound and mute; portable settings, notes and position across devices; offline preference retry without overwriting another device; 44px separated navigation.',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
