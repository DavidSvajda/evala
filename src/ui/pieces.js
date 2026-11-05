const styles = new Set(['merida', 'chessnut']);

export function pieceSource(piece, style = document.body.dataset.pieceStyle) {
  if (!/^[wb]$/.test(piece.color) || !/^[pnbrqk]$/.test(piece.type))
    throw new TypeError('Invalid chess piece');
  const folder = styles.has(style) ? style + '/' : '';
  return `pieces/${folder}${piece.color}${piece.type.toUpperCase()}.svg`;
}

export function createPieceImage(piece) {
  const image = document.createElement('img');
  image.dataset.chessPiece = piece.color + piece.type;
  image.src = pieceSource(piece);
  image.alt = '';
  image.draggable = false;
  return image;
}

export function applyPieceStyle(style) {
  document.body.dataset.pieceStyle = styles.has(style) || style === 'letters' ? style : 'classic';
  for (const image of document.querySelectorAll('img[data-chess-piece]')) {
    const [color, type] = image.dataset.chessPiece;
    const source = pieceSource({ color, type });
    if (image.getAttribute('src') !== source) image.src = source;
  }
  const preview = document.querySelector('#piece-preview');
  if (preview && !preview.childElementCount) {
    for (const color of ['w', 'b'])
      for (const type of 'kqrbnp') {
        const cell = document.createElement('span');
        cell.className = 'mini-square ' + (color === 'w' ? 'dark' : 'light');
        cell.append(createPieceImage({ color, type }));
        const letter = document.createElement('span');
        letter.className = 'piece-letter ' + (color === 'w' ? 'white' : 'black');
        letter.textContent = type.toUpperCase();
        cell.append(letter);
        preview.append(cell);
      }
  }
}
