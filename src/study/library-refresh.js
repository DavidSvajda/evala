import { importUsername } from './import.js';
import { translate as t } from './i18n.js';
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
    return {
      username: o.lastUsername || document.querySelector('#username').value,
      platform: o.lastPlatform || document.querySelector('#platform').value || 'chesscom',
    };
  }
  async function refresh(manual = false) {
    if (controller || context.busy()) {
      if (manual) status.textContent = t('Nejprve pozastav rozbor.');
      return;
    }
    const { username, platform } = source();
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(username || '')) {
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
    let timedOut = false;
    const activeController = controller;
    const timeout = setTimeout(() => {
      timedOut = true;
      activeController.abort();
    }, 20000);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.textContent = t('Hledám nové dokončené partie…');
    const before = context.library().length;
    try {
      const pgn = await importUsername(username, platform, {
        signal: controller.signal,
        limit: 20,
      });
      if (activeOwner !== context.owner()) return;
      await context.add(pgn);
      const count = context.library().length - before;
      status.textContent = count
        ? t('Nové partie: ') + count
        : t('Žádné nové dokončené partie. Knihovna je aktuální.');
    } catch (error) {
      if (activeOwner === context.owner()) {
        if (timedOut) status.textContent = t('Načítání trvá příliš dlouho. Zkus to znovu.');
        else if (error.name !== 'AbortError') status.textContent = t(error.message);
      }
    } finally {
      clearTimeout(timeout);
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
