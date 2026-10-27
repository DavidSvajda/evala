import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { parsePgn } from '../src/study/game.js';
import { httpError } from './http.mjs';

// Untrusted PGN parsing must never hold the HTTP event loop. Bound CPU, memory,
// concurrent workers and input size independently of the downstream move limit.
if (!isMainThread) {
  try {
    parentPort.postMessage({ game: parsePgn(workerData) });
  } catch {
    parentPort.postMessage({ error: true });
  }
}
let active = 0;
export async function parseServerPgn(pgn, { signal, timeoutMs = 3000 } = {}) {
  if (typeof pgn !== 'string' || Buffer.byteLength(pgn) > 200000)
    throw httpError(413, 'PGN je příliš velké. Limit jedné partie je 200 kB.');
  if (signal?.aborted) throw httpError(408, 'Požadavek byl přerušen.');
  if (active >= 2) throw httpError(429, 'Import je vytížený. Zkus to za chvíli.');
  active++;
  let worker;
  try {
    worker = new Worker(new URL(import.meta.url), {
      workerData: pgn,
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    return await new Promise((resolve, reject) => {
      const abort = () => reject(httpError(408, 'Požadavek byl přerušen.'));
      const timer = setTimeout(
        () =>
          reject(httpError(422, 'PGN je příliš složité. Použij export jedné partie bez variant.')),
        timeoutMs,
      );
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      signal?.addEventListener('abort', abort, { once: true });
      worker.once('message', (data) => {
        cleanup();
        if (data.game) resolve(data.game);
        else reject(httpError(400, 'Neplatná partie PGN.'));
      });
      worker.once('error', () => {
        cleanup();
        reject(httpError(422, 'PGN se nepodařilo zpracovat.'));
      });
      worker.once('exit', () => {
        cleanup();
        reject(httpError(422, 'PGN se nepodařilo zpracovat.'));
      });
    });
  } finally {
    await worker?.terminate();
    active--;
  }
}
