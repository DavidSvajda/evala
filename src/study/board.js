import { Chess } from 'chess.js';
import { moveIcon } from '../ui/move-icons.js';
import { language } from './i18n.js';
import { fitBoard } from './board-fit.js';
const names = { p: 'pěšec', n: 'jezdec', b: 'střelec', r: 'věž', q: 'dáma', k: 'král' };
const englishNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export class StudyBoard {
  constructor(element, { onMove } = {}) {
    this.element = element;
    this.onMove = onMove;
    this.flipped = false;
    this.selected = null;
    this.interactive = true;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-label', 'Interaktivní analytická šachovnice');
    this.grid = document.createElement('div');
    this.grid.className = 'square-grid';
    element.append(this.grid);
    fitBoard(element);
    this.arrows = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrows.setAttribute('viewBox', '0 0 800 800');
    this.arrows.classList.add('board-arrows');
    this.arrows.setAttribute('aria-hidden', 'true');
    element.append(this.arrows);
    this.grid.addEventListener('click', (event) => {
      if (this.suppressClick) return;
      const button = event.target.closest('[data-square]');
      if (button) this.click(button.dataset.square);
    });
    this.drawings = new Set();
    this.grid.addEventListener('pointerdown', (event) => this.startGesture(event));
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.addEventListener('dragstart', (event) => event.preventDefault());
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.cancelGesture?.();
        this.drawings.clear();
        this.paintArrow();
      }
    });
  }
  squareAt(event) {
    const bounds = this.grid.getBoundingClientRect(),
      x = Math.floor(((event.clientX - bounds.left) / bounds.width) * 8),
      y = Math.floor(((event.clientY - bounds.top) / bounds.height) * 8);
    if (x < 0 || y < 0 || x > 7 || y > 7) return null;
    return 'abcdefgh'[this.flipped ? 7 - x : x] + (this.flipped ? y + 1 : 8 - y);
  }
  startGesture(event) {
    if (![0, 2].includes(event.button) || event.isPrimary === false || this.cancelGesture) return;
    const square = this.squareAt(event),
      piece = square && this.chess?.get(square),
      drawing = event.button === 2;
    if (!square || !this.chess) return;
    if (!drawing) {
      this.drawings.clear();
      this.paintArrow();
      if (!this.interactive || piece?.color !== this.chess.turn()) return;
    } else event.preventDefault();
    const controller = new AbortController(),
      start = { x: event.clientX, y: event.clientY, fen: this.chess.fen() },
      width = this.grid.getBoundingClientRect().width / 8,
      pointer = event.pointerId;
    let ghost;
    const cleanup = () => {
      controller.abort();
      ghost?.remove();
      this.dragSquare = null;
      this.grid.classList.remove('board-dragging');
      this.grid.querySelector('.drag-source')?.classList.remove('drag-source');
      this.previewDrawing = null;
      this.cancelGesture = null;
      if (this.grid.hasPointerCapture(pointer)) this.grid.releasePointerCapture(pointer);
      this.paintArrow();
    };
    const cancel = () => {
      if (ghost) {
        this.selected = null;
        this.paint();
      }
      cleanup();
    };
    this.cancelGesture = cancel;
    const move = (e) => {
      if (e.pointerId !== pointer) return;
      if (drawing) {
        const to = this.squareAt(e);
        this.previewDrawing = to ? square + to : null;
        this.paintArrow();
        return;
      }
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 7) return;
      if (!ghost) {
        this.grid.setPointerCapture(pointer);
        ghost = document.createElement('img');
        ghost.className = 'piece-drag-ghost';
        ghost.src = `pieces/${piece.color}${piece.type.toUpperCase()}.svg`;
        ghost.alt = '';
        ghost.draggable = false;
        ghost.style.width = ghost.style.height = width + 'px';
        document.body.append(ghost);
        this.dragSquare = square;
        this.selected = square;
        this.paint();
        this.grid.classList.add('board-dragging');
        this.grid.querySelector(`[data-square="${square}"]`)?.classList.add('drag-source');
      }
      e.preventDefault();
      ghost.style.left = e.clientX - width / 2 + 'px';
      ghost.style.top = e.clientY - width / 2 + 'px';
    };
    const end = (e) => {
      if (e.pointerId !== pointer || e.button !== event.button) return;
      const target = this.squareAt(e),
        dragged = !!ghost;
      cleanup();
      if (drawing || dragged) {
        this.suppressClick = true;
        setTimeout(() => (this.suppressClick = false), 0);
      }
      if (drawing) {
        if (target) {
          const annotation = square + target;
          if (this.drawings.has(annotation)) this.drawings.delete(annotation);
          else this.drawings.add(annotation);
          this.paintArrow();
        }
      } else if (dragged) {
        this.selected = square;
        if (target && this.interactive && this.chess.fen() === start.fen) this.click(target);
        else {
          this.selected = null;
          this.paint();
        }
      }
    };
    const listen = (type, handler) =>
      window.addEventListener(type, handler, { signal: controller.signal });
    listen('pointermove', move);
    listen('pointerup', end);
    listen('pointercancel', (e) => {
      if (e.pointerId === pointer) cancel();
    });
    listen('blur', cancel);
    listen('keydown', (e) => {
      if (e.key === 'Escape') cancel();
    });
    if (drawing) this.grid.setPointerCapture(pointer);
  }

  set(
    fen,
    { lastMove = null, arrow = null, threatArrow = null, mark = null, flipped = this.flipped } = {},
  ) {
    const changed = this.chess?.fen() !== fen;
    if (changed || this.flipped !== flipped) this.cancelGesture?.();
    if (changed) this.drawings.clear();
    this.chess = new Chess(fen);
    this.flipped = flipped;
    this.lastMove = lastMove;
    this.arrow = arrow;
    this.threatArrow = threatArrow;
    this.mark = mark;
    this.selected = this.dragSquare || null;
    this.paint();
  }
  paint() {
    const en = language() === 'en';
    this.element.setAttribute(
      'aria-label',
      en ? 'Interactive chessboard' : 'Interaktivní analytická šachovnice',
    );
    this.element.setAttribute(
      'aria-description',
      en
        ? 'Click or drag pieces to move. Right-drag to draw arrows; right-click to mark a square. Repeat to remove, or left-click to clear.'
        : 'Figurky přesouvej kliknutím nebo tažením. Pravým tlačítkem táhni šipky, pravým kliknutím označ pole. Opakováním značku odebereš, levým kliknutím vše smažeš.',
    );
    const legal = this.selected ? this.chess.moves({ square: this.selected, verbose: true }) : [];
    const fragment = document.createDocumentFragment();
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const file = this.flipped ? 7 - x : x,
          rank = this.flipped ? y : 7 - y,
          square = 'abcdefgh'[file] + (rank + 1),
          piece = this.chess.get(square);
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.square = square;
        button.className = 'square ' + ((file + rank) % 2 ? 'light' : 'dark');
        if (this.dragSquare === square) button.classList.add('drag-source');
        if (this.lastMove && (this.lastMove.from === square || this.lastMove.to === square))
          button.classList.add('last-move');
        if (this.selected === square) button.classList.add('selected');
        if (legal.some((m) => m.to === square))
          button.classList.add(piece ? 'legal-capture' : 'legal');
        button.setAttribute(
          'aria-label',
          `${square}${piece ? ' ' + (en ? (piece.color === 'w' ? 'white ' : 'black ') : piece.color === 'w' ? 'bílý ' : 'černý ') + (en ? englishNames : names)[piece.type] : ''}`,
        );
        if (piece) {
          if (this.interactive && piece.color === this.chess.turn())
            button.classList.add('movable');
          const image = document.createElement('img');
          image.src = `pieces/${piece.color}${piece.type.toUpperCase()}.svg`;
          image.alt = '';
          image.draggable = false;
          button.append(image);
          const letter = document.createElement('span');
          letter.className = 'piece-letter ' + (piece.color === 'b' ? 'black' : 'white');
          letter.textContent = piece.type.toUpperCase();
          letter.setAttribute('aria-hidden', 'true');
          button.append(letter);
        }
        if (this.mark && this.lastMove?.to === square) {
          const badge = document.createElement('span');
          badge.className = 'board-mark ' + this.mark.kind;
          badge.innerHTML = moveIcon(this.mark.kind);
          badge.title = this.mark.label;
          badge.setAttribute('aria-label', this.mark.label);
          button.append(badge);
          button.classList.add('marked-square');
          button.setAttribute(
            'aria-label',
            button.getAttribute('aria-label') + ' · ' + this.mark.label,
          );
        }
        if (y === 7) {
          const label = document.createElement('span');
          label.className = 'file-label';
          label.textContent = square[0];
          button.append(label);
        }
        if (x === 7) {
          const label = document.createElement('span');
          label.className = 'rank-label';
          label.textContent = square[1];
          button.append(label);
        }
        fragment.append(button);
      }
    const focused = this.grid.contains(document.activeElement)
      ? document.activeElement.dataset.square
      : null;
    this.grid.replaceChildren(fragment);
    this.paintArrow();
    if (focused)
      this.grid.querySelector(`[data-square="${focused}"]`)?.focus({ preventScroll: true });
  }
  coords(square) {
    let x = 'abcdefgh'.indexOf(square[0]),
      y = 8 - Number(square[1]);
    if (this.flipped) {
      x = 7 - x;
      y = 7 - y;
    }
    return [x * 100 + 50, y * 100 + 50];
  }
  paintArrow() {
    this.arrows.replaceChildren();
    if (this.threatArrow && this.threatArrow.match(/^[a-h][1-8][a-h][1-8]/)) {
      this.drawArrow(this.threatArrow, '#e53935');
    }
    if (this.arrow && this.arrow.match(/^[a-h][1-8][a-h][1-8]/)) {
      this.drawArrow(this.arrow, '#c17b20');
    }
    for (const drawing of this.drawings) this.drawDrawing(drawing);
    if (this.previewDrawing) this.drawDrawing(this.previewDrawing, true);
  }
  drawDrawing(arrow, preview = false) {
    if (arrow.slice(0, 2) !== arrow.slice(2, 4)) {
      this.drawArrow(arrow, '#d98720');
    } else {
      const circle = document.createElementNS(this.arrows.namespaceURI, 'circle'),
        [x, y] = this.coords(arrow.slice(0, 2));
      for (const [key, value] of Object.entries({
        cx: x,
        cy: y,
        r: 42,
        fill: 'none',
        stroke: '#d98720',
        'stroke-width': 10,
      }))
        circle.setAttribute(key, value);
      this.arrows.append(circle);
    }
    const shape = this.arrows.lastElementChild;
    shape.classList.add('user-drawing');
    shape.setAttribute('opacity', preview ? '.5' : '.84');
  }
  drawArrow(arrow, stroke) {
    const [x1, y1] = this.coords(arrow.slice(0, 2)),
      [x2, y2] = this.coords(arrow.slice(2, 4));
    if (x1 === x2 && y1 === y2) return;
    const dx = x2 - x1,
      dy = y2 - y1,
      len = Math.hypot(dx, dy),
      ux = dx / len,
      uy = dy / len;
    const line = document.createElementNS(this.arrows.namespaceURI, 'path');
    line.setAttribute(
      'd',
      `M${x1},${y1}L${x2 - ux * 20},${y2 - uy * 20}M${x2 - ux * 40 - uy * 20},${y2 - uy * 40 + ux * 20}L${x2},${y2}L${x2 - ux * 40 + uy * 20},${y2 - uy * 40 - ux * 20}`,
    );
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', '16');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('opacity', '.84');
    this.arrows.append(line);
  }
  click(square) {
    if (!this.interactive) return;
    if (this.selected) {
      const legal = this.chess
        .moves({ square: this.selected, verbose: true })
        .filter((m) => m.to === square);
      if (legal.length) {
        this.onMove?.({
          from: this.selected,
          to: square,
          promotions: legal.map((m) => m.promotion).filter(Boolean),
        });
        this.selected = null;
        return;
      }
    }
    const piece = this.chess.get(square);
    this.selected = piece?.color === this.chess.turn() ? square : null;
    this.paint();
  }
}
