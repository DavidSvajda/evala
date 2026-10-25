import { Chess } from 'chess.js';
export function miniBoard(root, fen) {
  const chess = new Chess(fen);
  root.replaceChildren();
  for (let rank = 8; rank >= 1; rank--)
    for (const [file, letter] of [...'abcdefgh'].entries()) {
      const cell = document.createElement('span');
      cell.className = 'mini-square ' + ((file + rank) % 2 ? 'light' : 'dark');
      const piece = chess.get(letter + rank);
      if (piece) {
        const image = document.createElement('img');
        image.src = `pieces/${piece.color}${piece.type.toUpperCase()}.svg`;
        image.alt = '';
        cell.append(image);
        const letter = document.createElement('span');
        letter.className = 'piece-letter ' + (piece.color === 'b' ? 'black' : 'white');
        letter.textContent = piece.type.toUpperCase();
        cell.append(letter);
      }
      root.append(cell);
    }
}
