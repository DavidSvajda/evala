import { analysisPage } from './core/analysis-page.js';
import { findBoard, readPlacement } from './adapters/board.js';

// Read the selected analysis board's logical position in the page's JS world.
const readFen = () => {
  const page = analysisPage(location.href);
  if (!page) return { allowed: false, fen: null };
  const board = findBoard();
  let allowed = page === 'board';
  let fen, placement;
  try {
    if (board?.matches('cg-board')) {
      const analysis = window.site?.analysis ?? window.lichess?.analysis;
      if (analysis?.chessground?.state?.dom?.elements?.board === board) {
        const game = analysis.data?.game;
        if (game?.variant?.key && game.variant.key !== 'standard')
          return { allowed: false, fen: null };
        allowed ||= Number.isInteger(game?.status?.id) && game.status.id >= 30;
        if (allowed) fen = analysis.node?.fen;
      }
      if (allowed && !fen) placement = readPlacement(board, true);
    } else if (board) {
      const game = board.game;
      allowed ||= ['1-0', '0-1', '1/2-1/2'].includes(game?.getResult?.());
      if (allowed) fen = game?.getFEN?.() ?? game?.getFen?.();
    }
  } catch {
    // A site can replace its board/controller during navigation.
  }
  return {
    allowed,
    placement,
    fen:
      typeof fen === 'string' && fen.length < 150 && fen.trim().split(/\s+/).length === 6
        ? fen.trim().replace(/\s+/g, ' ')
        : null,
  };
};

window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== 'evala-board' ||
    event.data.type !== 'read' ||
    typeof event.data.token !== 'string' ||
    !Number.isSafeInteger(event.data.boardRevision)
  )
    return;
  window.postMessage(
    {
      channel: 'evala-board',
      type: 'position',
      token: event.data.token,
      boardRevision: event.data.boardRevision,
      ...readFen(),
      path: location.pathname,
    },
    location.origin,
  );
});
