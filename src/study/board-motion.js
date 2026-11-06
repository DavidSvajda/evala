// Temporary visual pieces keep the board's legal position and hit targets immediate.
export function createBoardMotion(grid) {
  const active = new Map();
  let interrupted = new Map();
  function beforePaint() {
    const bounds = grid.getBoundingClientRect();
    interrupted = new Map(
      [...active].map(([square, value]) => {
        const rect = value.image.getBoundingClientRect();
        return [square, { x: rect.left - bounds.left, y: rect.top - bounds.top }];
      }),
    );
  }
  let previous = new Map(),
    orientation;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function clear() {
    for (const { image, animation } of active.values()) {
      animation.cancel();
      image.remove();
    }
    active.clear();
    grid
      .querySelectorAll('.motion-destination')
      .forEach((el) => el.classList.remove('motion-destination'));
  }
  reduced.addEventListener('change', clear);
  function paint(flipped, skip = false) {
    const motion = document.body.dataset.boardMotion || 'smooth';
    const current = new Map(
      [...grid.querySelectorAll('[data-piece]')].map((el) => [el.dataset.square, el.dataset.piece]),
    );
    const removed = [...previous].filter(([square, piece]) => current.get(square) !== piece);
    const added = [...current].filter(([square, piece]) => previous.get(square) !== piece);
    const changed = removed.length || added.length;
    const bounds = grid.getBoundingClientRect(),
      size = bounds.width / 8;
    const position = (square) => {
      const file = square.charCodeAt(0) - 97,
        rank = Number(square[1]) - 1;
      return { x: (flipped ? 7 - file : file) * size, y: (flipped ? rank : 7 - rank) * size };
    };
    if (changed || orientation !== flipped || reduced.matches || motion === 'none' || skip) {
      if (orientation !== flipped || reduced.matches || motion === 'none' || skip) clear();
      else {
        for (const [square, value] of active) {
          if (current.get(square) === value.piece) continue;
          value.animation.cancel();
          value.image.remove();
          active.delete(square);
          grid.querySelector(`[data-square="${square}"]`)?.classList.remove('motion-destination');
        }
      }
      if (
        !skip &&
        motion !== 'none' &&
        !reduced.matches &&
        orientation === flipped &&
        removed.length <= 3 &&
        added.length <= 3 &&
        size > 0
      ) {
        for (const [to, piece] of added) {
          const candidates = removed.filter(([, old]) => old === piece);
          // A promotion changes the piece type while keeping its colour.
          const promotion = removed.filter(([, old]) => old[0] === piece[0]);
          const from =
            candidates.length === 1
              ? candidates[0][0]
              : promotion.length === 1 && added.filter(([, p]) => p[0] === piece[0]).length === 1
                ? promotion[0][0]
                : null;
          if (!from) continue;
          const target = grid.querySelector(`[data-square="${to}"]`);
          const image = document.createElement('div');
          image.className = 'square board-motion-piece';
          image.setAttribute('aria-hidden', 'true');
          for (const child of target.querySelectorAll('img,.piece-letter'))
            image.append(child.cloneNode(true));
          const start = interrupted.get(from) || position(from),
            end = position(to);
          Object.assign(image.style, {
            left: end.x + 'px',
            top: end.y + 'px',
            width: size + 'px',
            height: size + 'px',
          });
          grid.append(image);
          const animation = image.animate(
            [
              { transform: `translate(${start.x - end.x}px,${start.y - end.y}px)` },
              { transform: 'translate(0,0)' },
            ],
            {
              duration: Math.min(
                motion === 'quick' ? 150 : 280,
                (motion === 'quick' ? 90 : 180) +
                  (Math.hypot(start.x - end.x, start.y - end.y) / size) *
                    (motion === 'quick' ? 9 : 18),
              ),
              easing: 'cubic-bezier(0.2, 0.75, 0.2, 1)',
            },
          );
          const entry = { image, animation, piece };
          active.set(to, entry);
          animation.onfinish = () => {
            image.remove();
            if (active.get(to) !== entry) return;
            active.delete(to);
            grid.querySelector(`[data-square="${to}"]`)?.classList.remove('motion-destination');
          };
        }
      }
    } else {
      // Selection and engine feedback repaint without restarting an in-flight move.
      for (const { image } of active.values()) if (image.parentElement !== grid) grid.append(image);
    }
    for (const square of active.keys())
      grid.querySelector(`[data-square="${square}"]`)?.classList.add('motion-destination');
    previous = current;
    orientation = flipped;
  }
  return { paint, beforePaint };
}
