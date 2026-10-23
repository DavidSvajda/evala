import { Chess } from 'chess.js';
import { mount } from './content.js';
import { validPosition } from './core/position.js';
import { icons, brand } from './ui/icons.js';

document.querySelector('.brand-mark').innerHTML = brand;
document.querySelector('.arrow').innerHTML = icons.arrow;
const names = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
const samples = {
  start: new Chess().fen(),
  white: 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  black: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1',
  mate: '7k/5K2/6Q1/8/8/8/8/8 w - - 0 1',
  stalemate: '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1',
};
const opening = ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7','Re1','b5','Bb3','d6','c3','O-O'];
let chess = new Chess(), flipped = false, ply = 0, openingMode = true;
const board = document.querySelector('cg-board');
function render() {
  board.replaceChildren();
  for (const row of chess.board()) for (const item of row) {
    if (!item) continue;
    const piece = document.createElement('piece');
    piece.className = `${item.color === 'w' ? 'white' : 'black'} ${names[item.type]}`;
    const x = 'abcdefgh'.indexOf(item.square[0]), y = 8 - Number(item.square[1]);
    piece.style.transform = `translate(${(flipped ? 7-x : x)*100}%,${(flipped ? 7-y : y)*100}%)`;
    piece.style.backgroundImage = `url('./pieces/${item.color}${item.type.toUpperCase()}.svg')`;
    board.append(piece);
  }
  document.querySelector('.board-wrap').classList.toggle('orientation-black', flipped);
  document.querySelector('.board-wrap').classList.toggle('orientation-white', !flipped);
  document.querySelector('.files').innerHTML = [...(flipped ? 'hgfedcba' : 'abcdefgh')].map(c => `<span>${c}</span>`).join('');
  document.querySelector('.ranks').innerHTML = [...(flipped ? '12345678' : '87654321')].map(c => `<span>${c}</span>`).join('');
  board.setAttribute('data-fen', chess.fen());
  document.querySelector('#fen').value = chess.fen();
  document.querySelector('#move-count').textContent = openingMode ? ply ? `Tah ${Math.ceil(ply/2)} · ${ply % 2 ? 'bílý' : 'černý'}` : 'Začátek partie' : chess.turn() === 'w' ? 'Bílý na tahu' : 'Černý na tahu';
  document.querySelector('#prev').disabled = !openingMode || ply === 0;
  document.querySelector('#next').disabled = !openingMode || ply === opening.length;
}
document.querySelector('#sample').addEventListener('change', event => {
  chess = new Chess(samples[event.target.value]); ply = 0; openingMode = event.target.value === 'start';
  document.querySelector('#fen-error').textContent = ''; render();
});
document.querySelector('#flip').addEventListener('click', () => { flipped = !flipped; render(); });
document.querySelector('#next').addEventListener('click', () => { if (openingMode && ply < opening.length) { chess.move(opening[ply++]); render(); } });
document.querySelector('#prev').addEventListener('click', () => { if (openingMode && ply > 0) { chess.undo(); ply--; render(); } });
document.querySelector('#load-fen').addEventListener('click', () => {
  const fen = document.querySelector('#fen').value.trim();
  if (!validPosition(fen)) { document.querySelector('#fen-error').textContent = 'Neplatný FEN. Zkontroluj oba krále, tah na řadě a všech šest polí.'; return; }
  document.querySelector('#fen-error').textContent = '';
  chess = new Chess(fen); ply = 0; openingMode = false; render();
});
render();
const app = await mount({ demo: true });
// Deterministic browser tests can inspect the same app used by the extension.
if (location.hostname === '127.0.0.1') window.evalaDemo = app;
