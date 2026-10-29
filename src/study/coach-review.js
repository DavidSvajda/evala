import { Chess } from 'chess.js';
import { expectedPercent } from './review.js';

// Store move indices, never translated text: changing language keeps the same lesson.
export function reviewMoments(game, color = 'all') {
  if (!game?.analysis) return [];
  return game.moves.flatMap((move, index) => {
    const mark = game.analysis.moves?.[index];
    if (!mark || (color !== 'all' && move.color !== color)) return [];
    if (!['inaccuracy', 'mistake', 'blunder', 'miss', 'great', 'brilliant'].includes(mark.kind))
      return [];
    return [{ index, ply: index + 1, move, mark }];
  });
}

export function legalContinuation(fen, pv, limit = 8) {
  const moves = [];
  try {
    const chess = new Chess(fen);
    for (const uci of (pv || []).slice(0, limit)) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push({ uci, san: move.san, captured: move.captured, mate: chess.isCheckmate() });
    }
  } catch {
    /* Stop at the last legal move of a stale engine line. */
  }
  return moves;
}

// Only judge alternatives which actually have engine evidence. An unsearched
// move is unknown, not a mistake. Scores in Evala are always White's perspective.
export function judgeRetry(fen, played, position) {
  const lines = position?.lines || [];
  const best = lines[0];
  if (!best || !legalContinuation(fen, [played]).length) return 'unknown';
  const candidate = lines.find((line) => line.pv?.[0] === played);
  if (
    !candidate ||
    ![best, candidate].every(
      (l) => l.depth >= 12 && ['cp', 'mate'].includes(l.kind) && Number.isFinite(l.value),
    )
  )
    return 'unknown';
  if (played === best.pv?.[0]) return 'best';
  if (best.kind === 'mate')
    return candidate.kind === 'mate' && Math.sign(candidate.value) === Math.sign(best.value)
      ? 'sound'
      : 'retry';
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const loss = (expectedPercent(best) - expectedPercent(candidate)) * sign;
  return loss <= 2 ? 'sound' : 'retry';
}
