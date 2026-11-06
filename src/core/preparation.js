import { Chess } from 'chess.js';
import { timeClass } from './game-analytics.js';

const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n <= 1e12 ? n : 0);
export const positionKey = (fen) => new Chess(fen).fen().split(' ').slice(0, 4).join(' ');
export function openingRows(fen, data) {
  const legal = new Map(
    new Chess(fen)
      .moves({ verbose: true })
      .map((m) => [m.from + m.to + (m.promotion || ''), m.san]),
  );
  return (Array.isArray(data?.moves) ? data.moves : [])
    .slice(0, 32)
    .filter((m) => legal.has(m.uci))
    .map((m) => ({
      uci: m.uci,
      san: legal.get(m.uci),
      white: count(m.white),
      draws: count(m.draws),
      black: count(m.black),
    }))
    .map((m) => ({ ...m, total: m.white + m.draws + m.black }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function localOpeningRows(fen, games, speed = 'all') {
  const key = positionKey(fen),
    moves = new Map();
  for (const game of games) {
    if (speed !== 'all' && timeClass(game.headers.TimeControl) !== speed) continue;
    const seen = new Set();
    if (!['1-0', '0-1', '1/2-1/2'].includes(game.headers.Result)) continue;
    for (const move of game.moves) {
      if (move.fenBefore.split(' ').slice(0, 4).join(' ') !== key || seen.has(move.uci)) continue;
      seen.add(move.uci);
      const row = moves.get(move.uci) || { uci: move.uci, white: 0, draws: 0, black: 0 };
      row[
        game.headers.Result === '1-0' ? 'white' : game.headers.Result === '0-1' ? 'black' : 'draws'
      ]++;
      moves.set(move.uci, row);
    }
  }
  return openingRows(fen, { moves: [...moves.values()] });
}

const opposite = {
  win: 'loss',
  loss: 'win',
  draw: 'draw',
  'cursed-win': 'blessed-loss',
  'blessed-loss': 'cursed-win',
  'maybe-win': 'maybe-loss',
  'maybe-loss': 'maybe-win',
  'syzygy-win': 'syzygy-loss',
  'syzygy-loss': 'syzygy-win',
  unknown: 'unknown',
};
export function tablebasePosition(fen) {
  const chess = new Chess(fen);
  return chess.board().flat().filter(Boolean).length <= 7 && chess.fen().split(' ')[2] === '-';
}
export function tablebaseResult(fen, data) {
  if (!Object.hasOwn(opposite, data?.category)) throw Error('Invalid tablebase response.');
  const legal = new Map(
    new Chess(fen)
      .moves({ verbose: true })
      .map((m) => [m.from + m.to + (m.promotion || ''), m.san]),
  );
  return {
    category: data.category,
    dtz: Number.isInteger(data.dtz) ? data.dtz : null,
    dtm: Number.isInteger(data.dtm) ? data.dtm : null,
    moves: (Array.isArray(data.moves) ? data.moves : [])
      .slice(0, 256)
      .filter((m) => legal.has(m.uci) && Object.hasOwn(opposite, m.category))
      .map((m) => ({ uci: m.uci, san: legal.get(m.uci), category: opposite[m.category] })),
  };
}

export function opponentReport(games, username, { side = 'all', speed = 'all' } = {}) {
  const rows = new Map(),
    seen = new Set();
  let total = 0;
  for (const game of games) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const name = username.toLowerCase();
    const color =
      game.headers.White?.toLowerCase() === name
        ? 'w'
        : game.headers.Black?.toLowerCase() === name
          ? 'b'
          : null;
    const result = game.headers.Result;
    if (
      !color ||
      !['1-0', '0-1', '1/2-1/2'].includes(result) ||
      (side !== 'all' && side !== color) ||
      (speed !== 'all' && timeClass(game.headers.TimeControl) !== speed)
    )
      continue;
    total++;
    const line = game.moves
        .slice(0, 8)
        .map((m) => m.san)
        .join(' '),
      key = color + ':' + line;
    const row = rows.get(key) || {
      color,
      line,
      total: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pgn: game.pgn,
    };
    row.total++;
    row[
      result === '1/2-1/2'
        ? 'draws'
        : result === (color === 'w' ? '1-0' : '0-1')
          ? 'wins'
          : 'losses'
    ]++;
    rows.set(key, row);
  }
  return { total, rows: [...rows.values()].sort((a, b) => b.total - a.total) };
}
