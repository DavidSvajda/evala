import { ownColor, positionKey } from './practice.js';
import { errorReason, phaseOf } from '../core/game-analytics.js';

export const FOCUS = {
  mate: { cs: 'Najít matové pokračování', en: 'Find mating continuations', theme: 'mate' },
  king: {
    cs: 'Rozpoznat hrozby proti králi',
    en: 'Recognise threats to the king',
    theme: 'defensiveMove',
  },
  material: {
    cs: 'Zkontrolovat ztrátu materiálu',
    en: 'Check for material losses',
    theme: 'hangingPiece',
  },
  opening: { cs: 'Rozhodování v zahájení', en: 'Opening decisions', theme: 'opening' },
  middlegame: { cs: 'Rozhodování ve střední hře', en: 'Middlegame decisions', theme: 'middlegame' },
  endgame: { cs: 'Rozhodování v koncovce', en: 'Endgame decisions', theme: 'endgame' },
};
export function localDay(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
// Evidence describes engine-observed consequences, never a player's mental cause.
export function trainingJourney(games, username, training = {}, now = Date.now()) {
  const own = games.filter((g) => ownColor(g, username || ''));
  const reviewed = own.filter((g) => g.analysis?.complete);
  const groups = new Map();
  let decisions = 0;
  for (const game of reviewed) {
    const color = ownColor(game, username),
      seen = new Set();
    for (const [ply, move] of game.moves.entries()) {
      const before = game.analysis.positions?.[ply],
        after = game.analysis.positions?.[ply + 1],
        mark = game.analysis.moves?.[ply];
      if (
        move.color !== color ||
        !Number.isFinite(mark?.loss) ||
        ![before, after].every((p) => p && (p.terminal || p.depth >= 12))
      )
        continue;
      const key = positionKey(move.fenBefore);
      if (seen.has(key)) continue;
      seen.add(key);
      decisions++;
      if (mark.loss < 10) continue;
      const reason = errorReason(move, before, after);
      const focusKey = reason === 'other' ? phaseOf(move.fenBefore) : reason;
      const group = groups.get(focusKey) || {
        key: focusKey,
        examples: [],
        gameIds: new Set(),
        loss: 0,
      };
      group.examples.push({
        gameId: game.id,
        ply,
        san: move.san,
        fen: move.fenBefore,
        loss: mark.loss,
        opponent: game.headers[color === 'w' ? 'Black' : 'White'] || '',
      });
      group.gameIds.add(game.id);
      group.loss += Math.min(100, mark.loss);
      groups.set(focusKey, group);
    }
  }
  const priorities = [...groups.values()]
    .map((g) => ({
      ...g,
      games: g.gameIds.size,
      count: g.examples.length,
      recurring: g.gameIds.size >= 2 && g.examples.length >= 3,
      examples: g.examples.sort((a, b) => b.loss - a.loss),
    }))
    .sort((a, b) => b.games - a.games || b.count - a.count || b.loss - a.loss);
  return {
    imported: own.length,
    reviewed: reviewed.length,
    decisions,
    priorities,
    nextReview: own.find((g) => !g.analysis?.complete)?.id,
    due: Object.values(training.history || {}).filter(
      (h) => Number.isFinite(h.dueAt) && h.dueAt <= now,
    ).length,
  };
}
