import { chromium } from 'playwright';
import { build } from 'esbuild';
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
  const bundle = await build({
    entryPoints: ['src/study/board.js'],
    bundle: true,
    format: 'esm',
    write: false,
  });
  const page = await browser.newPage();
  await page.route('**/motion-fixture.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text }),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html`);
  await page.evaluate(async () => {
    const { StudyBoard } = await import('/motion-fixture.js');
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:360px;z-index:100';
    document.body.append(el);
    window.motionBoard = new StudyBoard(el);
    window.motionBoard.set('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
  const move = (san) =>
    page.evaluate((san) => {
      const b = window.motionBoard;
      b.chess.move(san);
      b.set(b.chess.fen());
    }, san);
  await move('e4');
  assert.equal(await page.locator('.board-motion-piece').count(), 1);
  await page.evaluate(() => {
    window.originalSquare = window.motionBoard.grid.querySelector('[data-square="a1"]');
    window.originalPiece = window.originalSquare.querySelector('img');
    window.originalAnimation = document.querySelector('.board-motion-piece');
    window.originalAnimation.getAnimations()[0].pause();
    window.motionBoard.selected = 'g1';
    window.motionBoard.set(window.motionBoard.chess.fen(), { arrow: 'g1f3' });
  });
  assert.equal(
    await page.evaluate(() => {
      const b = window.motionBoard;
      return (
        b.grid.querySelector('[data-square="a1"]') === window.originalSquare &&
        window.originalSquare.querySelector('img') === window.originalPiece &&
        b.selected === 'g1' &&
        window.originalAnimation.isConnected
      );
    }),
    true,
    'engine feedback preserves squares, images, selection and the running move',
  );
  assert.equal(await page.locator('.motion-destination').count(), 1);
  await move('e5');
  assert.equal(await page.locator('.board-motion-piece').count(), 2);
  await page.evaluate(() => window.originalAnimation.getAnimations()[0].play());
  await page.waitForFunction(() => !document.querySelector('.board-motion-piece'));
  assert.equal(await page.locator('.motion-destination').count(), 0);
  await page.evaluate(() => (document.body.dataset.boardMotion = 'none'));
  await move('Nf3');
  assert.equal(await page.locator('.board-motion-piece').count(), 0);
  await page.evaluate(() => (document.body.dataset.boardMotion = 'quick'));
  await move('Nc6');
  const quick = await page
    .locator('.board-motion-piece')
    .last()
    .evaluate((el) => el.getAnimations()[0].effect.getTiming().duration);
  assert.ok(quick <= 150);
  await page.evaluate(() => (document.body.dataset.boardMotion = 'smooth'));
  await move('Bb5');
  const smooth = await page
    .locator('.board-motion-piece')
    .last()
    .evaluate((el) => el.getAnimations()[0].effect.getTiming().duration);
  assert.ok(smooth > quick && smooth <= 280);
  for (const viewport of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.motionBoard.set('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'));
    await move('O-O');
    assert.equal(await page.locator('.board-motion-piece').count(), 2);
    const fits = await page.locator('.board-motion-piece').evaluateAll((els) =>
      els.every((el) => {
        const r = el.getBoundingClientRect();
        return r.x >= 0 && r.y >= 0 && r.right <= 361 && r.bottom <= 361;
      }),
    );
    assert.equal(fits, true);
  }
  await page.evaluate(() => window.motionBoard.set('7k/P7/8/8/8/8/8/7K w - - 0 1'));
  await move('a8=N');
  assert.equal(await page.locator('.board-motion-piece').count(), 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => !document.querySelector('.board-motion-piece'));
  await move('Kg7');
  assert.equal(await page.locator('.board-motion-piece').count(), 0);
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html#/analysis`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#study-board .square').first().waitFor();
  await page.waitForFunction(
    () => !document.querySelector('.position-workspace').style.getPropertyValue('--board-fit'),
  );
  const width = await page
    .locator('#study-board')
    .evaluate((el) => el.getBoundingClientRect().width);
  await page.evaluate(() => window.scrollTo(0, 180));
  await page.setViewportSize({ width: 390, height: 730 });
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  assert.ok(
    Math.abs(
      (await page.locator('#study-board').evaluate((el) => el.getBoundingClientRect().width)) -
        width,
    ) < 1,
    'mobile scroll and address-bar height changes must not resize the board',
  );
  console.log(
    'PASS move continuity, repaint, interruption, castling, promotion, desktop/mobile and reduced motion',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
