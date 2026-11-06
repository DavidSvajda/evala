import { Chess } from 'chess.js';
import { parsePgnTree, treePath } from '../core/pgn-tree.js';

export function repertoirePgnLines(pgn, plies = 40) {
  if (!Number.isInteger(plies) || plies < 1 || plies > 80) throw Error('Choose 1–80 half-moves.');
  const tree = parsePgnTree(pgn),
    lines = new Map();
  for (const node of tree.nodes) {
    if (!node.id || (node.children.length && node.ply < plies)) continue;
    const path = treePath(tree, node.id).slice(0, plies),
      key = path.join(' ');
    if (lines.has(key)) continue;
    if (lines.size >= 128) throw Error('PGN contains more than 128 repertoire lines.');
    const chess = new Chess(tree.nodes[0].fen);
    for (const move of path)
      chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    lines.set(key, chess.pgn());
  }
  return [...lines.values()];
}
