import { parsePgn } from './game.js';
import { publicSnapshot } from './share-snapshot.js';
import { translate as t, language } from './i18n.js';
const $ = (s) => document.querySelector(s);
const idPattern = /^[A-Za-z0-9_-]{22}$/;
const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const text = (selector, value) => {
  $(selector).textContent = t(value);
};
export function createSharing(context) {
  let loading = false,
    busy = false,
    source = null,
    sequence = 0,
    lastGame = null;
  const ownerKey = () => 'evala-shares:' + context.owner();
  function records() {
    try {
      const list = JSON.parse(localStorage.getItem(ownerKey()) || '[]');
      return Array.isArray(list)
        ? list.filter((r) => idPattern.test(r.id) && typeof r.token === 'string')
        : [];
    } catch {
      return [];
    }
  }
  function saveRecords(list) {
    if (list.length > 100) throw new Error(t('Nejprve zruš některý ze starších odkazů.'));
    localStorage.setItem(ownerKey(), JSON.stringify(list));
  }
  function snapshotKey(variation) {
    return (
      context.game().id +
      '|' +
      (variation ? variation.ply + ':' + variation.moves.join('.') : 'main')
    );
  }
  function currentVariation() {
    const b = context.branch();
    return b ? { ply: context.ply(), moves: b.moves.map((m) => m.uci) } : undefined;
  }
  function link(id, ply = 0, step) {
    const url = new URL('/', location.origin);
    url.searchParams.set('share', id);
    url.searchParams.set('lang', language());
    url.searchParams.set('ply', String(ply));
    if (step !== undefined) url.searchParams.set('step', String(step));
    url.hash = '/analysis';
    return url.href;
  }
  async function request(path, options) {
    const response = await fetch('/api/shares' + path, {
      ...options,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || t('Sdílení se nepodařilo. Zkus to znovu.'));
    return body;
  }
  function showStatus(value) {
    text('#share-status', value);
  }
  function sync() {
    const game = context.game(),
      b = context.branch();
    $('[data-share-mode="game"]').disabled = !game || busy || !context.enabled;
    $('[data-share-mode="position"]').disabled = !game || busy || !context.enabled;
    $('[data-share-mode="variation"]').disabled =
      !game || !b?.moves.length || busy || !context.enabled;
    $('#share-unavailable').hidden = context.enabled;
    if (!loading && source && game?.id !== source.gameId) source = null;
    $('#shared-game-banner').hidden = !source;
    $('#save-shared-game').disabled = !game || context.library().some((g) => g.id === game.id);
    if (game && !context.library().some((g) => g.id === game.id)) $('#delete-game').disabled = true;
    if (loading || document.body.dataset.page !== 'analysis' || !game) return;
    const url = new URL(location.href);
    for (const key of ['game', 'share', 'ply', 'line', 'step', 'main'])
      url.searchParams.delete(key);
    url.searchParams.set(source ? 'share' : 'game', source ? source.id : game.id);
    url.searchParams.set('ply', String(context.ply()));
    if (b?.moves.length) {
      url.searchParams.set('line', b.moves.map((m) => m.uci).join('.'));
      url.searchParams.set('step', String(b.index));
    }
    if (source?.variation && !b) url.searchParams.set('main', '1');
    url.hash = '/analysis';
    if (url.href !== location.href) {
      const push = lastGame && lastGame !== game.id;
      history[push ? 'pushState' : 'replaceState'](null, '', url);
    }
    lastGame = game.id;
  }
  function renderLinks() {
    const root = $('#share-links');
    root.replaceChildren();
    for (const record of records().filter((r) => r.gameId === context.game()?.id)) {
      const row = document.createElement('div');
      row.className = 'share-link-row';
      const label = document.createElement('a');
      label.href = link(record.id);
      label.textContent = t(record.variant ? 'Varianta' : 'Partie');
      label.target = '_blank';
      label.rel = 'noopener noreferrer';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = t('Zrušit odkaz');
      button.onclick = async () => {
        button.disabled = true;
        try {
          await request('/' + record.id, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + record.token },
          });
          saveRecords(records().filter((r) => r.id !== record.id));
          if ($('#share-url').value.includes('share=' + record.id)) {
            $('#share-output').hidden = true;
            $('#share-url').value = '';
          }
          showStatus('Odkaz zrušen.');
          renderLinks();
        } catch (e) {
          showStatus(e.message);
          button.disabled = false;
        }
      };
      row.append(label, button);
      root.append(row);
    }
  }
  async function publish(mode) {
    if (busy || !context.game()) return;
    const game = context.game(),
      anchor = context.ply(),
      step = context.branch()?.index,
      owner = ownerKey();
    busy = true;
    sync();
    showStatus('Připravuji odkaz…');
    try {
      const variation = mode === 'game' ? undefined : currentVariation();
      const key = snapshotKey(variation);
      let record = records().find((r) => r.key === key);
      if (!record) {
        // Check local persistence before publishing, so revocation is not lost.
        const list = records();
        saveRecords(list);
        const data = await request('', {
          method: 'POST',
          body: JSON.stringify(publicSnapshot(game, variation)),
        });
        record = {
          id: data.id,
          token: data.deleteToken,
          key,
          gameId: game.id,
          variant: !!variation,
        };
        if (owner !== ownerKey()) {
          await request('/' + record.id, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + record.token },
          });
          throw new Error(t('Účet se změnil. Zkus sdílení znovu.'));
        }
        try {
          saveRecords([...list, record]);
        } catch (e) {
          await request('/' + record.id, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + record.token },
          });
          throw e;
        }
      }
      const url = link(record.id, mode === 'game' ? 0 : anchor, variation ? step : undefined);
      $('#share-url').value = url;
      $('#share-output').hidden = false;
      renderLinks();
      try {
        await navigator.clipboard.writeText(url);
        showStatus('Odkaz zkopírován.');
      } catch {
        $('#share-url').select();
        showStatus('Odkaz je připravený ke zkopírování.');
      }
    } catch (e) {
      showStatus(e.message);
    } finally {
      busy = false;
      sync();
    }
  }
  async function openUrl() {
    if (location.hash && location.hash !== '#/analysis') return;
    const url = new URL(location.href),
      share = url.searchParams.get('share'),
      gameId = url.searchParams.get('game');
    if (!share && !gameId) {
      sync();
      return;
    }
    const ticket = ++sequence;
    loading = true;
    try {
      let game, variation;
      if (share) {
        if (!idPattern.test(share)) throw new Error(t('Neplatný odkaz na partii.'));
        const snapshot = await request('/' + share);
        if (ticket !== sequence) return;
        game = parsePgn(snapshot.pgn);
        variation = snapshot.variation;
        // Never overwrite an existing private game's notes or analysis.
        game =
          context
            .library()
            .find(
              (g) =>
                g.id === game.id &&
                g.initialFen === game.initialFen &&
                g.moves.map((m) => m.uci).join(' ') === game.moves.map((m) => m.uci).join(' '),
            ) || game;
        source = { id: share, gameId: game.id, variation: !!variation };
        if (url.searchParams.get('main') === '1') variation = undefined;
      } else {
        source = null;
        game = context.library().find((g) => g.id === gameId);
        if (!game)
          throw new Error(
            t('Partie je uložená v jiném prohlížeči. Požádej autora o odkaz přes Sdílet.'),
          );
      }
      if (ticket !== sequence) return;
      const rawPly = url.searchParams.get('ply'),
        ply =
          rawPly !== null && /^\d{1,3}$/.test(rawPly)
            ? Math.min(game.moves.length, Number(rawPly))
            : 0;
      const line = url.searchParams.get('line');
      if (line) {
        const moves = line.split('.');
        if (moves.length > 100 || moves.some((m) => !uciPattern.test(m)))
          throw new Error(t('Neplatná varianta.'));
        variation = { ply, moves };
      }
      if (variation) publicSnapshot(game, variation);
      $('#save-shared-game').hidden = false;
      text('#shared-game-message', 'Sdílená kopie. Rozbor běží na tvém zařízení.');
      context.open(game, variation ? variation.ply : ply, variation, url.searchParams.get('step'));
      lastGame = game.id;
    } catch (e) {
      source = null;
      context.clear();
      $('#shared-game-banner').hidden = false;
      text('#shared-game-message', e.message);
      $('#save-shared-game').hidden = true;
    } finally {
      if (ticket === sequence) {
        loading = false;
        sync();
        if (!context.game()) $('#shared-game-banner').hidden = false;
      }
    }
  }
  for (const button of document.querySelectorAll('[data-share-mode]'))
    button.onclick = () => publish(button.dataset.shareMode);
  function placePanel() {
    if (!$('#share-menu').open) return;
    const r = $('#share-menu > summary').getBoundingClientRect(),
      panel = $('.share-panel');
    panel.style.left =
      Math.max(12, Math.min(innerWidth - panel.offsetWidth - 12, r.right - panel.offsetWidth)) +
      'px';
    panel.style.top =
      Math.max(12, Math.min(innerHeight - panel.offsetHeight - 12, r.bottom + 8)) + 'px';
  }
  $('#share-menu').addEventListener('toggle', () => {
    if ($('#share-menu').open) {
      sync();
      renderLinks();
      placePanel();
    }
  });
  window.addEventListener('resize', placePanel);
  document.addEventListener('scroll', placePanel, { passive: true, capture: true });
  document.addEventListener('pointerdown', (event) => {
    if (!$('#share-menu').contains(event.target)) $('#share-menu').open = false;
  });
  $('#share-menu').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('#share-menu').open = false;
      event.stopPropagation();
    }
  });
  $('#copy-share-url').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('#share-url').value);
      showStatus('Odkaz zkopírován.');
    } catch {
      $('#share-url').select();
      showStatus('Odkaz je připravený ke zkopírování.');
    }
  };
  $('#save-shared-game').onclick = async () => {
    try {
      await context.save(context.game().pgn);
      sync();
      text('#shared-game-message', 'Kopie je uložená v tvé knihovně.');
    } catch (e) {
      text('#shared-game-message', e.message);
    }
  };
  window.addEventListener('popstate', () => void openUrl());
  document.addEventListener('evala:page', () => sync());
  return { sync, openUrl };
}
