import { importUsername } from './import.js';
import { translate as t } from './i18n.js';
import { linkedUsername } from '../core/chess-profiles.js';
export function createLibraryRefresh(context) {
  const button = document.querySelector('#refresh-games'),
    toggle = document.querySelector('#auto-refresh-games'),
    status = document.querySelector('#library-refresh-status');
  let controller = null,
    lastCheck = 0;
  toggle.checked = context.options().autoRefreshGames !== false;
  toggle.onchange = () => {
    context.options().autoRefreshGames = toggle.checked;
    context.saveOptions();
  };
  function source() {
    const o = context.options();
    const profiles = context.profiles?.() || {};
    const linked = ['lichess', 'chesscom']
      .map((platform) => ({ platform, username: linkedUsername(profiles, platform) }))
      .filter(({ username }) => username);
    if (linked.length) return linked;
    return [
      {
        username: o.lastUsername || document.querySelector('#username').value,
        platform: o.lastPlatform || document.querySelector('#platform').value || 'chesscom',
      },
    ].filter(({ username }) => /^[A-Za-z0-9_-]{2,40}$/.test(username || ''));
  }
  async function refresh(manual = false) {
    if (controller || context.busy()) {
      if (manual) status.textContent = t('Nejprve pozastav rozbor.');
      return;
    }
    const sources = source();
    if (!sources.length) {
      if (manual) status.textContent = t('Nejdřív zadej šachovou přezdívku v importu.');
      return;
    }
    if (
      !manual &&
      (toggle.checked === false ||
        Date.now() - lastCheck < 60000 ||
        new URLSearchParams(location.search).has('share'))
    )
      return;
    const activeOwner = context.owner();
    lastCheck = Date.now();
    controller = new AbortController();
    const activeController = controller;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = t('Hledám nové dokončené partie…');
    const before = context.library().length;
    const errors = [];
    try {
      for (const { username, platform } of sources) {
        try {
          const pgn = await importUsername(username, platform, {
            signal: activeController.signal,
            limit: 20,
          });
          if (activeOwner !== context.owner() || activeController.signal.aborted) return;
          await context.add(pgn, activeController.signal);
        } catch (error) {
          if (activeOwner !== context.owner() || activeController.signal.aborted) return;
          const name = platform === 'lichess' ? 'Lichess' : 'Chess.com';
          errors.push(
            `${name} · ${t(error.name === 'TimeoutError' ? 'Načítání trvá příliš dlouho. Zkus to znovu.' : error.message)}`,
          );
        }
      }
      if (activeOwner !== context.owner() || activeController.signal.aborted) return;
      const count = context.library().length - before;
      status.textContent =
        [count ? t('Nové partie: ') + count : '', ...errors].filter(Boolean).join(' · ') ||
        t('Žádné nové dokončené partie. Knihovna je aktuální.');
    } finally {
      controller = null;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
  button.onclick = () => void refresh(true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      context.render();
      void refresh();
    }
  });
  document.addEventListener('evala:identity', () => {
    controller?.abort();
    lastCheck = 0;
  });
  window.addEventListener('pagehide', () => controller?.abort());
  window.addEventListener('online', () => void refresh());
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') void refresh();
  return { refresh };
}
