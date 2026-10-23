import { placementFromPieces, reconstructPosition, START_FEN, validPosition } from '../core/position.js';
import { Chess } from 'chess.js';

const names = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

export function findBoard(root = document) {
  const selector = location.hostname.includes('chess.com') ? 'wc-chess-board, chess-board, .board-layout-chessboard .board' : 'cg-board';
  return [...root.querySelectorAll(selector)].filter(board => {
    const r = board.getBoundingClientRect();
    return r.width >= 160 && r.height >= 160 && getComputedStyle(board).visibility !== 'hidden';
  }).sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
}

export function boardFlipped(board) {
  return board.classList.contains('flipped') || !!board.closest('.orientation-black, .flipped') || board.getAttribute('orientation') === 'black';
}

export function readPlacement(board) {
  const pieces = [];
  const flipped = boardFlipped(board);
  const rect = board.getBoundingClientRect();
  const elements = board.matches('cg-board') ? board.querySelectorAll('piece:not(.ghost):not(.fading)') : board.querySelectorAll('.piece:not(.ghost):not(.fading)');
  if (board.querySelector('.dragging, .animating')) return null;
  for (const el of elements) {
    let code, square;
    if (board.matches('cg-board')) {
      const type = Object.keys(names).find(name => el.classList.contains(name));
      if (!type) continue;
      code = el.classList.contains('white') ? names[type].toUpperCase() : names[type];
      const p = el.getBoundingClientRect();
      let file = Math.floor((p.left + p.width / 2 - rect.left) / (rect.width / 8));
      let rank = 7 - Math.floor((p.top + p.height / 2 - rect.top) / (rect.height / 8));
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
      if (flipped) { file = 7 - file; rank = 7 - rank; }
      square = `${'abcdefgh'[file]}${rank + 1}`;
    } else {
      const match = el.className.match(/\b([wb])([prnbqk])\b/);
      const pos = el.className.match(/\bsquare-([1-8])([1-8])\b/);
      if (!match || !pos) continue;
      code = match[1] === 'w' ? match[2].toUpperCase() : match[2];
      square = `${'abcdefgh'[Number(pos[1]) - 1]}${pos[2]}`;
    }
    pieces.push({ piece: code, square });
  }
  return placementFromPieces(pieces);
}

export function readSan(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll('[data-figurine], [data-piece]').forEach(el => {
    el.replaceWith(el.getAttribute('data-figurine') || el.getAttribute('data-piece') || '');
  });
  clone.querySelectorAll('.annotation, .glyph, .eval, .clock, .move-time, .move-number, index, glyph').forEach(el => el.remove());
  const text = clone.textContent.replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, char => ({ '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♙': '', '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N', '♟': '' })[char]);
  return text.replace(/\d+\.(\.\.)?/g, '').replace(/[!?\s]/g, '').trim();
}

export function readMoves(root = document) {
  const selectors = location.hostname.includes('chess.com')
    ? ['.vertical-move-list .node', '.move-list .node', '[data-ply].move-node', '.node[data-ply]']
    : ['.tview2 move', '.analyse__moves move', '.round__app .moves move', 'l4x kwdb'];
  for (const selector of selectors) {
    const nodes = [...root.querySelectorAll(selector)];
    if (!nodes.length) continue;
    const moves = [];
    for (const node of nodes) {
      // Branches in analysis trees are not a linear move history.
      if (node.closest('interrupt, variation, .variation')) return [];
      const san = readSan(node);
      if (!san) continue;
      if (!/^(O-O(-O)?|0-0(-0)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=?[QRBN])?)[+#]?$/.test(san)) return [];
      moves.push(san);
    }
    return moves;
  }
  return [];
}

export class PositionTracker {
  constructor() { this.last = null; }

  resolve(board, nativeFen) {
    const placement = readPlacement(board);
    if (!placement) return null;
    const direct = [nativeFen, board.getAttribute('data-fen'), board.getAttribute('fen')];
    for (const fen of direct) {
      if (validPosition(fen) && fen.split(' ')[0] === placement) {
        this.last = fen;
        return { fen, source: 'site' };
      }
    }
    const reconstructed = reconstructPosition(readMoves(), placement);
    if (reconstructed && validPosition(reconstructed)) {
      this.last = reconstructed;
      return { fen: reconstructed, source: 'moves' };
    }
    if (this.last) {
      if (this.last.split(' ')[0] === placement) return { fen: this.last, source: 'tracked' };
      const chess = new Chess(this.last);
      const matches = [];
      for (const move of chess.moves({ verbose: true })) {
        chess.move(move);
        if (chess.fen().split(' ')[0] === placement) matches.push(chess.fen());
        chess.undo();
      }
      if (matches.length === 1) { this.last = matches[0]; return { fen: this.last, source: 'tracked' }; }
    }
    if (placement === START_FEN.split(' ')[0]) { this.last = START_FEN; return { fen: START_FEN, source: 'start' }; }
    return null;
  }
}
