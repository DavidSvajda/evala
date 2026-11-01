// Fit the whole board and its nearby controls, using measured content rather
// than a fixed viewport subtraction. Scrolling must not resize the board.
const boards = new Set();
let scheduled = false,
  started = false,
  observer;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const element of boards) {
      if (!element.isConnected) {
        observer?.unobserve(element);
        boards.delete(element);
        continue;
      }
      if (!element.getClientRects().length) continue;
      const analysis = element.id === 'study-board';
      const wrapper = analysis
        ? element.closest('.position-workspace')
        : element.closest('.puzzle-board-area') || element.parentElement;
      const bounds = element.getBoundingClientRect();
      const footers = [
        ...wrapper.querySelectorAll(
          analysis ? '.board-caption, .board-toolbar' : '.puzzle-board-footer',
        ),
      ].filter((node) => node.getClientRects().length);
      const reserve = footers.length
        ? Math.max(0, ...footers.map((node) => node.getBoundingClientRect().bottom - bounds.bottom))
        : 64;
      const stage = analysis ? element.closest('.board-stage') : element;
      const extra = analysis ? stage.getBoundingClientRect().width - bounds.width : 0;
      const top = bounds.top + Math.max(0, window.scrollY);
      const square = Math.min(880, Math.max(160, Math.floor(innerHeight - top - reserve - 20)));
      const fit = `${square + extra}px`;
      if (wrapper.style.getPropertyValue('--board-fit') !== fit) {
        wrapper.style.setProperty('--board-fit', fit);
        schedule();
      }
    }
  });
}
export function fitBoard(element) {
  if (!['study-board', 'puzzle-board', 'practice-board', 'human-board'].includes(element.id))
    return;
  boards.add(element);
  if (!started) {
    started = true;
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    document.addEventListener('evala:page', schedule);
    document.addEventListener('evala:language', schedule);
    new MutationObserver(schedule).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-page'],
    });
    document.fonts?.ready.then(schedule);
    observer = new ResizeObserver(schedule);
    for (const node of document.querySelectorAll(
      '.app-main, .app-sidebar, .study-header, .game-heading, .board-toolbar, .board-caption, .puzzle-board-footer',
    ))
      observer.observe(node);
  }
  observer.observe(element);
  schedule();
}
