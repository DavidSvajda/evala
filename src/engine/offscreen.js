import { EngineController } from './controller.js';
import { RemoteController } from './remote-controller.js';

const sessions = new Map();
function remove(tabId) {
  const session = sessions.get(tabId);
  session?.engine.dispose();
  clearTimeout(session?.expiry);
  sessions.delete(tabId);
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    message?.target !== 'evala-offscreen' ||
    !Number.isInteger(message.tabId)
  )
    return;
  const { tabId, token } = message;
  if (message.type === 'remove-tab') {
    remove(tabId);
    respond({ ok: true });
    return;
  }
  let session = sessions.get(tabId);
  const mode =
    message.settings?.backend === 'server'
      ? `server:${message.settings.serverUrl}:${message.settings.serverVersion || 0}`
      : `local:${message.settings?.engine === 'full' ? 'full' : 'lite'}`;
  if (
    session &&
    (session.token !== token || (message.type === 'analyze' && session.mode !== mode))
  ) {
    remove(tabId);
    session = null;
  }
  const emit = (data) =>
    chrome.runtime
      .sendMessage({ target: 'evala-relay', channel: 'evala-engine', tabId, token, ...data })
      .catch(() => {});
  if (!session) {
    try {
      session = {
        token,
        mode,
        engine: mode.startsWith('server:')
          ? new RemoteController(message.settings.serverUrl, message.serverToken || '', emit)
          : new EngineController(
              (variant) =>
                new Worker(
                  chrome.runtime.getURL(
                    variant === 'full'
                      ? 'engine/stockfish-19-single.js'
                      : 'engine/stockfish-19-lite-single.js',
                  ),
                ),
              emit,
            ),
      };
    } catch {
      emit({ type: 'error', id: message.id, message: 'Neplatná adresa serveru.' });
      respond({ ok: false });
      return;
    }
    sessions.set(tabId, session);
  }
  clearTimeout(session.expiry);
  session.expiry = setTimeout(() => remove(tabId), 10 * 60 * 1000);
  if (message.type === 'hello') emit({ type: 'connected' });
  if (message.type === 'analyze') session.engine.analyze(message);
  if (message.type === 'pause' || message.type === 'dispose') remove(tabId);
  respond({ ok: true });
});
window.addEventListener('pagehide', () => {
  for (const tabId of sessions.keys()) remove(tabId);
});
