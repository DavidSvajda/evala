import { EngineController } from './controller.js';

const token = location.hash.slice(1);
let parentOrigin = null;
const allowed = (origin) =>
  /^https:\/\/([a-z0-9-]+\.)?chess\.com$/.test(origin) ||
  origin === 'https://lichess.org' ||
  origin === location.origin;
const send = (message) => {
  if (parentOrigin)
    parent.postMessage({ channel: 'evala-engine', token, ...message }, parentOrigin);
};
const engine = new EngineController(
  (variant) =>
    new Worker(
      new URL(
        variant === 'full'
          ? './engine/stockfish-19-single.js'
          : './engine/stockfish-19-lite-single.js',
        location.href,
      ),
    ),
  send,
);

window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    !allowed(event.origin) ||
    event.data?.channel !== 'evala-engine' ||
    event.data.token !== token ||
    token.length < 20
  )
    return;
  if (parentOrigin && parentOrigin !== event.origin) return;
  parentOrigin = event.origin;
  if (event.data.type === 'hello') send({ type: 'connected' });
  if (event.data.type === 'analyze') engine.analyze(event.data);
  if (event.data.type === 'pause') engine.pause();
  if (event.data.type === 'dispose') engine.dispose();
});
window.addEventListener('pagehide', () => engine.dispose());
