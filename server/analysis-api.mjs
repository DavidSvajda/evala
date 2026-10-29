import { Chess } from 'chess.js';
import { searchSettings } from '../src/study/uci.js';
import { validPosition } from '../src/core/position.js';
import { httpError, json, readJsonBody, sendError } from './http.mjs';
import { createRateLimiter, clientAddress } from './security.mjs';

function analysisRequest(input, owner) {
  if (!validPosition(input.fen)) throw httpError(400, 'Invalid FEN');
  const fen = new Chess(input.fen).fen();
  let history;
  if (input.history) {
    const { initialFen, moves } = input.history;
    if (!validPosition(initialFen) || !Array.isArray(moves) || moves.length > 600)
      throw httpError(400, 'Invalid history');
    const chess = new Chess(initialFen);
    try {
      for (const uci of moves) {
        if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
          throw new Error();
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      }
    } catch {
      throw httpError(400, 'Invalid history');
    }
    if (chess.fen() !== fen) throw httpError(400, 'History does not match FEN');
    history = { initialFen: new Chess(initialFen).fen(), moves };
  }
  const opts = searchSettings(input.settings);
  return {
    fen,
    history,
    settings: {
      ...opts,
      time: Math.min(opts.time, owner ? 5000 : 500),
      hash: Math.min(opts.hash, owner ? 128 : 64),
      depth: Math.min(opts.depth, owner ? 28 : 18),
      multipv: Math.min(opts.multipv, owner ? 5 : 3),
      engine: 'full',
    },
  };
}

export function createAnalysisApi({ slots, authorized, reports, publicReports }) {
  const allowed = createRateLimiter({ limit: 300, windowMs: 60000 });
  return async (req, res, url) => {
    if (url.pathname === '/api/health') {
      if (!['GET', 'HEAD'].includes(req.method)) throw httpError(405, 'Use GET or HEAD');
      if (!publicReports && !authorized(req)) throw httpError(401, 'Invalid token');
      json(res, 200, {
        ok: true,
        engine: 'Stockfish 19 Full',
        slots: slots.length,
        busy: slots.filter((s) => s.busy).length,
        publicReports,
      });
      return true;
    }
    if (url.pathname !== '/api/analyze') return false;
    if (req.method !== 'POST') throw httpError(405, 'Use POST');
    const owner = authorized(req);
    if (!owner && (!publicReports || !reports.session(req)))
      throw httpError(401, 'Invalid token or session');
    if (!allowed(clientAddress(req))) throw httpError(429, 'Too many requests');
    const controller = new AbortController();
    let slot,
      sent = false;
    const timeout = setTimeout(() => controller.abort(), 30000);
    const send = (value) => {
      if (res.writableLength > 2_000_000) {
        controller.abort();
        res.destroy();
        return;
      }
      if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(value) + '\n');
    };
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const request = analysisRequest(await readJsonBody(req), owner);
      request.cacheScope = reports.cacheScope(req);
      slot = slots.find((s) => !s.busy);
      if (!slot) {
        res.setHeader('Retry-After', '2');
        throw httpError(429, 'Engine is busy. Retry shortly.');
      }
      slot.busy = true;
      if (!owner) await reports.reserve(req, request.settings.time / 1000);
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no',
      });
      sent = true;
      let last = 0;
      const result = await slot.engine.search(request, {
        signal: controller.signal,
        onInfo: (info) => {
          if (Date.now() - last > 100) {
            last = Date.now();
            send({ type: 'info', result: info });
          }
        },
      });
      send({ type: 'done', result });
      res.end();
    } catch (error) {
      if (sent) {
        send({
          type: 'error',
          message:
            error.name === 'AbortError' ? 'Výpočet byl zrušen.' : 'Výpočet se nepodařilo dokončit.',
        });
        res.end();
      } else sendError(res, error);
    } finally {
      clearTimeout(timeout);
      if (slot) slot.busy = false;
      reports.pump();
    }
    return true;
  };
}
