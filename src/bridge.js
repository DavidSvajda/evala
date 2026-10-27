// Runs in MAIN, only reads known public board/controller state; no network or moves.
const readFen = () => {
  const board = document.querySelector('wc-chess-board, chess-board');
  for (const getter of [
    () => board?.game?.getFEN?.(),
    () => board?.game?.getFen?.(),
    () => window.lichess?.analysis?.node?.fen,
    () => window.site?.analysis?.node?.fen,
    () => window.lichess?.round?.data?.game?.fen,
  ]) {
    try {
      const fen = getter();
      if (typeof fen === 'string' && fen.length < 150 && fen.split(' ').length === 6) return fen;
    } catch {
      /* Site objects can disappear during SPA navigation. */
    }
  }
  return null;
};

window.addEventListener('message', (event) => {
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    event.data?.channel !== 'evala-board' ||
    event.data.type !== 'read' ||
    typeof event.data.token !== 'string'
  )
    return;
  window.postMessage(
    {
      channel: 'evala-board',
      type: 'position',
      token: event.data.token,
      fen: readFen(),
      path: location.pathname,
    },
    location.origin,
  );
});
