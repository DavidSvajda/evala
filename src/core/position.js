import { Chess, validateFen } from 'chess.js';

export const START_FEN = new Chess().fen();

export function validPosition(fen) {
  if (typeof fen !== 'string' || fen.length > 150 || !validateFen(fen).ok) return false;
  try {
    const chess = new Chess(fen);
    const board = chess.board().flat().filter(Boolean);
    if (board.length > 32 || board.filter(p => p.type === 'p' && p.color === 'w').length > 8 || board.filter(p => p.type === 'p' && p.color === 'b').length > 8) return false;
    // The side that just moved cannot have left its own king in check.
    const fields = chess.fen().split(' ');
    fields[1] = fields[1] === 'w' ? 'b' : 'w';
    fields[3] = '-';
    if (new Chess(fields.join(' ')).isCheck()) return false;
    return true;
  } catch { return false; }
}

export function placementFromPieces(pieces) {
  const squares = new Map();
  for (const { square, piece } of pieces) {
    if (!/^[a-h][1-8]$/.test(square) || !/^[prnbqkPRNBQK]$/.test(piece) || squares.has(square)) return null;
    squares.set(square, piece);
  }
  if (!squares.size) return null;
  return Array.from({ length: 8 }, (_, row) => {
    let rank = '', empty = 0;
    for (const file of 'abcdefgh') {
      const piece = squares.get(`${file}${8 - row}`);
      if (piece) { if (empty) rank += empty; empty = 0; rank += piece; }
      else empty++;
    }
    return rank + (empty || '');
  }).join('/');
}

export function reconstructPosition(moves, placement, initialFen = START_FEN) {
  if (!placement || moves.length > 1000) return null;
  try {
    const chess = new Chess(initialFen);
    let match = chess.fen().split(' ')[0] === placement ? chess.fen() : null;
    for (const san of moves) {
      chess.move(san);
      if (chess.fen().split(' ')[0] === placement) match = chess.fen();
    }
    return match;
  } catch { return null; }
}

export function terminalScore(fen) {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return { kind: 'mate', value: chess.turn() === 'w' ? -1 : 1, terminal: true, depth: 0, nps: 0, time: 0 };
  if (chess.isDraw()) return { kind: 'cp', value: 0, terminal: true, depth: 0, nps: 0, time: 0 };
  return null;
}
