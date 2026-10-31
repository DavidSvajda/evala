import { Chess } from 'chess.js';
import { MaiaProcess } from './maia-process.mjs';
import { chooseHumanMove } from '../src/training/human-policy.js';
import { validPosition } from '../src/core/position.js';
import { json, readJsonBody, httpError } from './http.mjs';
import { createRateLimiter, clientAddress } from './security.mjs';

export function humanRequest(input) {
  if (
    !input ||
    !validPosition(input.initialFen) ||
    !Array.isArray(input.moves) ||
    input.moves.length > 600 ||
    !Number.isInteger(input.elo) ||
    input.elo < 800 ||
    input.elo > 2400 ||
    !['natural', 'attacking'].includes(input.style)
  )
    throw httpError(400, 'Invalid practice request.');
  const chess = new Chess(input.initialFen);
  try {
    for (const move of input.moves) {
      if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
        throw new Error();
      chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    }
  } catch {
    throw httpError(400, 'Invalid practice history.');
  }
  if (chess.isGameOver()) throw httpError(400, 'This game has ended.');
  return {
    chess,
    request: { initialFen: new Chess(input.initialFen).fen(), moves: input.moves, elo: input.elo },
    style: input.style,
  };
}
export function createHumanOpponent({ reports, isOwner, maia = new MaiaProcess() }) {
  const allowed = createRateLimiter({ limit: 40, windowMs: 60000 });
  let busy = false;
  return {
    dispose: () => maia.dispose(),
    async handle(req, res, url) {
      if (url.pathname === '/api/opponent/config' && req.method === 'GET') {
        json(res, 200, {
          available: maia.available,
          model: 'Maia-3 5M',
          ratings: [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400],
        });
        return true;
      }
      if (url.pathname !== '/api/opponent/move') return false;
      if (req.method !== 'POST') throw httpError(405, 'Use POST');
      if (!isOwner(req) && (!reports.enabled || !reports.session(req)))
        throw httpError(401, 'Open Evala and reconnect.');
      if (!maia.available) throw httpError(503, 'Maia is not installed on this server.');
      if (!allowed(clientAddress(req))) throw httpError(429, 'Too many practice moves.');
      const { chess, request, style } = humanRequest(await readJsonBody(req, { limit: 40000 }));
      if (busy) throw httpError(429, 'Maia is busy. Try again shortly.');
      busy = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      res.on('close', () => {
        if (!res.writableFinished) controller.abort();
      });
      let lease;
      try {
        lease = await reports.acquire(controller.signal);
        await reports.reserve(req, (maia.ready ? 0 : 25) + (style === 'attacking' ? 2 : 1));
        const prediction = await maia.predict(request, controller.signal);
        let analysis;
        if (style === 'attacking')
          analysis = await lease.engine.search(
            {
              fen: chess.fen(),
              history: { initialFen: request.initialFen, moves: request.moves },
              settings: { engine: 'full', time: 500, depth: 16, multipv: 5, hash: 32 },
            },
            { signal: controller.signal },
          );
        const result = chooseHumanMove(chess, prediction, analysis, style);
        if (!res.destroyed) json(res, 200, { ...result, model: 'Maia-3 5M', elo: request.elo });
      } finally {
        clearTimeout(timer);
        lease?.release();
        busy = false;
      }
      return true;
    },
  };
}
