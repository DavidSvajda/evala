let creating;
const offscreenUrl = chrome.runtime.getURL('offscreen.html');
async function ensureOffscreen() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });
    if (!contexts.length)
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification:
          'Run the bundled local Stockfish WebAssembly worker independently of chess website security policies.',
      });
  })();
  try {
    await creating;
  } finally {
    creating = null;
  }
}
const supported = (url) => {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' && ['www.chess.com', 'chess.com', 'lichess.org'].includes(u.hostname)
    );
  } catch {
    return false;
  }
};

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (
    message?.target === 'evala-server-config' &&
    sender.url?.startsWith(chrome.runtime.getURL('study.html'))
  ) {
    (async () => {
      if (message.clear) {
        await chrome.storage.session.remove('evala-server');
        respond({ ok: true });
        return;
      }
      const url = new URL(message.origin);
      if (
        url.origin !== message.origin ||
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
        )
      )
        throw new Error('Invalid server');
      if (typeof message.token !== 'string' || message.token.length > 4096)
        throw new Error('Invalid token');
      const allowed = await chrome.permissions.contains({
        origins: [url.protocol + '//' + url.hostname + '/*'],
      });
      if (!allowed) throw new Error('Server permission missing');
      await chrome.storage.session.set({
        'evala-server': { origin: url.origin, token: message.token },
      });
      respond({ ok: true });
    })().catch(() => respond({ error: 'Nejdřív ověř spojení a povol přístup k serveru.' }));
    return true;
  }
  if (
    message?.target === 'evala-relay' &&
    sender.url === offscreenUrl &&
    Number.isInteger(message.tabId)
  ) {
    chrome.tabs.sendMessage(message.tabId, { ...message, target: 'evala-content' }).catch(() => {});
    return;
  }
  if (
    message?.target !== 'evala-background' ||
    !sender.tab ||
    !supported(sender.url) ||
    message.channel !== 'evala-engine' ||
    typeof message.token !== 'string' ||
    message.token.length > 100
  )
    return;
  (async () => {
    await ensureOffscreen();
    const saved = (await chrome.storage.session.get('evala-server'))['evala-server'];
    const serverToken =
      message.settings?.backend === 'server' && saved?.origin === message.settings?.serverUrl
        ? saved.token
        : '';
    await chrome.runtime.sendMessage({
      ...message,
      serverToken,
      target: 'evala-offscreen',
      tabId: sender.tab.id,
    });
    respond({ ok: true });
  })().catch(() =>
    respond({ error: 'Lokální engine není dostupný. Znovu načti rozšíření a obnov stránku.' }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.runtime
    .sendMessage({ target: 'evala-offscreen', type: 'remove-tab', tabId })
    .catch(() => {});
});
