import { Chess } from 'chess.js';

// Rebuild from legal moves; never publish comments, clock annotations or notes.
export function publicSnapshot(game, variation) {
  const chess = new Chess(game.initialFen);
  for (const key of [
    'White',
    'Black',
    'Date',
    'Result',
    'WhiteElo',
    'BlackElo',
    'ECO',
    'Opening',
  ]) {
    if (typeof game.headers[key] === 'string')
      chess.setHeader(key, game.headers[key].slice(0, 256));
  }
  for (const move of game.moves)
    chess.move({ from: move.from, to: move.to, promotion: move.promotion || undefined });
  const snapshot = { pgn: chess.pgn({ maxWidth: 90 }) };
  if (variation !== undefined && variation !== null) {
    if (
      !Number.isInteger(variation.ply) ||
      variation.ply < 0 ||
      variation.ply > game.moves.length ||
      !Array.isArray(variation.moves) ||
      !variation.moves.length ||
      variation.moves.length > 100
    )
      throw new Error('Neplatná varianta.');
    const branch = new Chess(game.fens[variation.ply]);
    const moves = variation.moves.map((uci) => {
      if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))
        throw new Error('Neplatná varianta.');
      branch.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      return uci;
    });
    snapshot.variation = { ply: variation.ply, moves };
  }
  return snapshot;
}
