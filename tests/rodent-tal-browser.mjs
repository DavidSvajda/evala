import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { Chess } from 'chess.js';
import { createServer } from '../scripts/serve.mjs';

const server = createServer(4186);
await new Promise((resolve) => server.on('listening', resolve));
const executablePath =
  process.env.EVALA_BROWSER ||
  process.env.EVALA_BROWSER_EXECUTABLE ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4186/demo.html');
  const result = await page.evaluate(async () => {
    const worker = new Worker('/engine/rodent-tal-worker.js');
    const lines = [];
    worker.onmessage = ({ data }) => lines.push(String(data));
    const waitFor = async (pattern, timeout = 30000) => {
      const start = Date.now();
      while (!lines.some((line) => pattern.test(line))) {
        if (Date.now() - start > timeout) throw new Error(`Rodent timeout: ${lines.slice(-6)}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    worker.postMessage('uci');
    await waitFor(/^uciok$/, 45000);
    worker.postMessage('isready');
    await waitFor(/^readyok$/);
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    worker.postMessage(`position fen ${fen}`);
    worker.postMessage('go depth 30 movetime 3000');
    await waitFor(/^bestmove /);
    worker.terminate();
    return { lines, fen };
  });
  assert.ok(result.lines.some((line) => line.includes('Rodent V 1.2.03')));
  assert.ok(
    result.lines.some((line) =>
      line.includes('Loaded NNUE network: nets/rodent_4kb_768hl_tal_aggressive.bin'),
    ),
  );
  const info = result.lines.filter((line) => /^info depth \d+ .* score (cp|mate) /.test(line));
  assert.ok(info.length, 'Tal network must return a scored position');
  const bestmove = result.lines.find((line) => line.startsWith('bestmove ')).split(' ')[1];
  const chess = new Chess(result.fen);
  assert.ok(
    chess
      .moves({ verbose: true })
      .some((move) => `${move.from}${move.to}${move.promotion || ''}` === bestmove),
  );
  console.log(`Rodent Tal: ${info.at(-1).match(/depth \d+/)[0]}, bestmove ${bestmove}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
