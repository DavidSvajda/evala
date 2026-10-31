import { renderNotation } from './views/notation.js';
import { summaryMarkup } from './views/summary.js';
import { reviewMoments, legalContinuation, judgeRetry } from './coach-review.js';
import { cleanLearning } from '../training/practice.js';
import { escapeHtml as esc } from '../ui/dom.js';
import { initLearning } from './learning-ui.js';
import {
  detectThreats,
  assessSharpness,
  analyzeImbalances,
  generateGmAdvice,
  speakGmVoice,
} from './gm-coach.js';
import { Chess } from 'chess.js';
import { StudyEngine, searchSettings } from './uci.js';
import { RemoteEngine, serverAddress, remoteReview, connectPublicServer } from './remote.js';
import { parsePgnCollection, DEMO_PGN, lineToSan, annotatedPgn } from './game.js';
import { reviewGame, summarize } from './review.js';
import {
  loadLibrary,
  saveGame,
  removeGame,
  removeGames,
  getPreferences,
  savePreferences,
  setStorageIdentity,
} from './storage.js';
import {
  account,
  initializeAccount,
  queueAccountPreferences,
  flushAccountPreferences,
  refreshAccount,
} from './account.js';
import { renderAccountIdentity } from './account-panel.js';
import { playMoveSound } from './audio.js';
import { initPlatform } from './platform.js';
import { importUsername } from './import.js';
import { StudyBoard } from './board.js';
import { analyzeLibrary, renderAnalytics } from './analytics.js';
import { PlayerReport } from './report.js';
import { START_FEN } from '../core/position.js';
import { scoreText, whitePercent } from '../core/evaluation.js';
import { brand, icons } from '../ui/icons.js';
import { moveIcon } from '../ui/move-icons.js';
import { initializeLanguage, language, translate } from './i18n.js';
import {
  readSettings as readBarSettings,
  writeSettings as writeBarSettings,
} from '../core/settings.js';

const $ = (selector) => document.querySelector(selector);
initializeLanguage();
const stroke = (path) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
$('#brand').innerHTML = brand;
$('#review-arrow').innerHTML = icons.arrow;
$('#close-settings').innerHTML = icons.close;
$('#flip-board').innerHTML = stroke('<path d="M5 7h12l-3-3M19 17H7l3 3M17 7l-3 3M7 17l3-3"/>');
$('#first-move').innerHTML = stroke('<path d="M7 5v14m10-13-7 6 7 6"/>');
$('#previous-move').innerHTML = stroke('<path d="m15 5-7 7 7 7"/>');
$('#next-move').innerHTML = stroke('<path d="m9 5 7 7-7 7"/>');
$('#last-move').innerHTML = stroke('<path d="M17 5v14M7 6l7 6-7 6"/>');
let showThreat = false,
  retryTarget = null,
  learningUI;
const blind = () => !!retryTarget || !!selected?.learning?.selfAnalysis;
const threatCache = new Map();
let library = [],
  selected = null,
  ply = 0,
  flipped = false,
  branch = null,
  promotionMove = null,
  activeView = 'review';
const hostedServer = !!document.querySelector('meta[name="evala-backend"][content="server"]');
const publicServer = !!document.querySelector('meta[name="evala-public"][content="true"]');
renderAccountIdentity();
await initializeAccount(hostedServer, renderAccountIdentity);
await setStorageIdentity(account.user);
document.body.classList.toggle('public-server', publicServer);
let options = getPreferences(hostedServer ? { backend: 'server', serverUrl: location.origin } : {}),
  job = null,
  importController = null,
  inspectController = null,
  inspectResult = null;
let reviewer = null,
  inspector = null,
  reviewerKey = '',
  inspectorKey = '',
  saveAt = 0,
  renderQueued = false;
if (account.user?.preferences.chessUsername) {
  options.lastUsername = account.user.preferences.chessUsername;
  options.lastPlatform = account.user.preferences.chessPlatform || 'chesscom';
}
let serverVerified = false;
let playerReport;
function setAnalysisTab(tab) {
  $('.analysis-panel').dataset.tab = tab;
  document.querySelectorAll('[data-analysis-tab]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.analysisTab === tab));
    button.tabIndex = button.dataset.analysisTab === tab ? 0 : -1;
  });
}
document
  .querySelectorAll('[data-analysis-tab]')
  .forEach((button) =>
    button.addEventListener('click', () => setAnalysisTab(button.dataset.analysisTab)),
  );
setAnalysisTab('summary');
document.querySelectorAll('[data-analysis-tab]').forEach((button) =>
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-analysis-tab]')],
      index = tabs.indexOf(button),
      next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  }),
);
const publicConnection = publicServer
  ? connectPublicServer(location.origin)
      .then(() => {
        serverVerified = true;
      })
      .catch((e) => {
        $('#report-status').textContent = e.message;
      })
  : Promise.resolve();
const barServerOption = document.createElement('label');
barServerOption.className = 'check-row';
barServerOption.hidden = !globalThis.chrome?.runtime?.id;
barServerOption.innerHTML =
  '<span>Použít server také pro evaluation bar</span><input id="bar-server" type="checkbox">';
$('#server-fields').append(barServerOption);
if (globalThis.chrome?.runtime?.id) {
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent =
    'Pro bar se token uchová v paměti rozšíření do restartu prohlížeče. Potom spojení ověř znovu.';
  $('#server-fields').append(note);
  readBarSettings().then(
    (saved) =>
      ($('#bar-server').checked =
        saved.backend === 'server' && saved.serverUrl === options.serverUrl),
  );
}
async function configureBarServer(enabled) {
  if (enabled && !serverVerified) throw new Error('Nejdřív ověř spojení se serverem.');
  const response = await chrome.runtime.sendMessage(
    enabled
      ? {
          target: 'evala-server-config',
          origin: serverAddress(options.serverUrl),
          token: $('#server-token').value,
        }
      : { target: 'evala-server-config', clear: true },
  );
  if (response?.error) throw new Error(response.error);
  const saved = await readBarSettings();
  await writeBarSettings({
    ...saved,
    backend: enabled ? 'server' : 'local',
    serverUrl: enabled ? serverAddress(options.serverUrl) : '',
    serverVersion: Date.now(),
  });
}
$('#bar-server').addEventListener('change', async (event) => {
  try {
    await configureBarServer(event.target.checked);
    $('#server-status').textContent = event.target.checked
      ? 'Server je zapnutý i pro evaluation bar.'
      : 'Evaluation bar opět počítá lokálně.';
  } catch (e) {
    event.target.checked = !event.target.checked;
    $('#server-status').textContent = e.message;
  }
});
const board = new StudyBoard($('#study-board'), { onMove: makeBoardMove });
const focusBoard = () => $('#study-board').focus({ preventScroll: true });
const profiles = {
  quick: { time: 300, depth: 14, hash: 32 },
  balanced: { time: 750, depth: 18, hash: 64 },
  deep: { time: 2000, depth: 22, hash: 128 },
};
const settingsFields = {
  'engine-choice': 'engine',
  profile: 'profile',
  'study-depth': 'depth',
  'study-time': 'time',
  'study-lines': 'multipv',
  'study-hash': 'hash',
  'study-arrows': 'arrows',
  backend: 'backend',
  'server-url': 'serverUrl',
};
function error(message = '') {
  $('#app-error').textContent = message;
}
function queueRender() {
  if (!renderQueued) {
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderPosition();
    });
  }
}
function activeFen() {
  return branch ? branch.fens[branch.index] : selected?.fens[ply] || START_FEN;
}
function currentResult() {
  const fen = activeFen();
  return inspectResult?.fen === fen
    ? inspectResult.result
    : branch
      ? null
      : selected?.analysis?.positions?.[ply] || null;
}
function settings() {
  return {
    ...options,
    ...searchSettings(options),
    engine: options.backend === 'server' ? 'full' : options.engine,
    serverUrl: options.serverUrl,
    backend: options.backend,
  };
}
function engineKey() {
  return JSON.stringify([
    options.backend,
    options.backend === 'server' ? options.serverUrl : options.engine,
    $('#server-token').value,
  ]);
}
function engine(role) {
  const key = engineKey();
  let value = role === 'review' ? reviewer : inspector,
    last = role === 'review' ? reviewerKey : inspectorKey;
  if (!value || key !== last) {
    value?.dispose();
    value =
      options.backend === 'server'
        ? new RemoteEngine(options.serverUrl, $('#server-token').value)
        : new StudyEngine(
            () =>
              new Worker(
                new URL(
                  `engine/stockfish-19-${options.engine === 'lite' ? 'lite-' : ''}single.js`,
                  location.href,
                ),
              ),
          );
    if (role === 'review') {
      reviewer = value;
      reviewerKey = key;
    } else {
      inspector = value;
      inspectorKey = key;
    }
  }
  return value;
}
function syncSettings() {
  for (const [id, key] of Object.entries(settingsFields)) {
    const el = $('#' + id);
    if (el.type === 'checkbox') el.checked = !!options[key];
    else el.value = options[key];
  }
  $('#server-fields').hidden = options.backend !== 'server';
  $('#engine-choice').disabled = options.backend === 'server';
  $('#engine-badge').textContent =
    `Stockfish 19 · ${options.backend === 'server' ? 'server Full NNUE' : options.engine === 'lite' ? 'Lite' : 'Full NNUE'}`;
}
for (const [id, key] of Object.entries(settingsFields))
  $('#' + id).addEventListener('change', () => {
    const el = $('#' + id);
    options[key] =
      el.type === 'checkbox'
        ? el.checked
        : ['depth', 'time', 'multipv', 'hash'].includes(key)
          ? Number(el.value)
          : el.value;
    if (key === 'serverUrl') serverVerified = false;
    if (key === 'profile' && profiles[options.profile])
      Object.assign(options, profiles[options.profile]);
    else if (['time', 'depth', 'hash'].includes(key)) options.profile = 'custom';
    options = { ...options, ...searchSettings(options) };
    if (job) job.controller.abort();
    inspectController?.abort();
    inspectResult = null;
    try {
      savePreferences(options);
    } catch {
      error('Nastavení se nepodařilo uložit. Pro tuto kartu zůstane aktivní.');
    }
    syncSettings();
    renderPosition();
    renderReview();
  });
$('#server-token').value = sessionStorage.getItem('evala-server-token') || '';
$('#server-token').addEventListener('change', () => {
  serverVerified = false;
  sessionStorage.setItem('evala-server-token', $('#server-token').value);
});
$('#test-server').addEventListener('click', async () => {
  try {
    const base = serverAddress($('#server-url').value);
    options.serverUrl = base;
    if (globalThis.chrome?.runtime?.id && chrome.permissions) {
      const u = new URL(base);
      const allowed = await chrome.permissions.request({
        origins: [u.protocol + '//' + u.hostname + '/*'],
      });
      if (!allowed) throw new Error('Prohlížeč nepovolil přístup k tomuto serveru.');
    }
    $('#server-status').textContent = 'Ověřuji spojení…';
    const response = await fetch(base + '/api/health', {
      headers: $('#server-token').value
        ? { Authorization: 'Bearer ' + $('#server-token').value }
        : {},
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok)
      throw new Error(
        `Server odmítl spojení (${response.status}). Zkontroluj token a povolený origin.`,
      );
    const info = await response.json();
    if (!info.ok) throw new Error('Server nemá podporované rozhraní Evala.');
    serverVerified = true;
    $('#server-status').textContent =
      `Připojeno · ${info.engine} · ${info.slots} výpočetní slot(y)`;
    savePreferences(options);
    if ($('#bar-server').checked && globalThis.chrome?.runtime?.id) await configureBarServer(true);
  } catch (e) {
    $('#server-status').textContent = e.message;
  }
});
function setView(view) {
  activeView = view;
  document.dispatchEvent(
    new CustomEvent('evala:route', { detail: view === 'analytics' ? 'insights' : 'analysis' }),
  );
  $('#view-review').setAttribute('aria-pressed', String(view === 'review'));
  $('#view-analytics').setAttribute('aria-pressed', String(view === 'analytics'));
  if (view === 'analytics') {
    if (!$('#insight-username').value)
      $('#insight-username').value = options.lastUsername || $('#username').value;
    updateAnalytics();
  } else focusBoard();
}
function updateAnalytics() {
  const username = $('#insight-username').value;
  const ids = playerReport?.games.length
    ? [...playerReport.checked]
    : options.reportUser === username
      ? options.reportIds
      : null;
  const games = ids ? library.filter((game) => ids.includes(game.id)) : library;
  const report = analyzeLibrary(games, {
    username,
    color: $('#insight-color').value,
    time: $('#insight-time').value,
    result: $('#insight-result').value,
  });
  $('#insights-form').hidden = !report.matched;
  renderAnalytics($('#analytics-content'), report, (moment) => {
    const game = library.find((g) => g.id === moment.gameId);
    if (game) {
      setView('review');
      selectGame(game);
      navigate(moment.ply);
    }
  });
}
$('#view-review').addEventListener('click', () => setView('review'));
$('#view-analytics').addEventListener('click', () => setView('analytics'));
$('#insights-form').addEventListener('submit', (event) => {
  event.preventDefault();
  updateAnalytics();
});
for (const id of ['insight-color', 'insight-time', 'insight-result'])
  $('#' + id).addEventListener('change', updateAnalytics);
$('#toggle-settings').addEventListener('click', () => {
  setView('review');
  $('#study-settings').hidden = !$('#study-settings').hidden;
  $('#toggle-settings').setAttribute('aria-expanded', String(!$('#study-settings').hidden));
});
$('#close-settings').addEventListener('click', () => {
  $('#study-settings').hidden = true;
  $('#toggle-settings').setAttribute('aria-expanded', 'false');
  $('#toggle-settings').focus({ preventScroll: true });
});
$('#toggle-library').addEventListener('click', () => {
  document.dispatchEvent(new CustomEvent('evala:route', { detail: 'games' }));
  $('#import-panel').open = true;
  $('#username').focus();
});

async function store(game, options) {
  try {
    await saveGame(game, options);
  } catch (e) {
    error(e.message);
  }
}
const librarySelection = new Set();
let bulkDeleting = false;
function visibleLibrary() {
  const query = $('#library-search').value.trim().toLowerCase(),
    filter = $('#library-filter').value;
  const result = library.filter(
    (game) =>
      (!query || Object.values(game.headers).join(' ').toLowerCase().includes(query)) &&
      (filter === 'all' ||
        (filter === 'analyzed' && game.analysis?.complete) ||
        (filter === 'pending' && !game.analysis?.complete)),
  );
  const sort = $('#library-sort').value;
  const stamp = (g) =>
    [g.headers.UTCDate, g.headers.Date]
      .map((v) =>
        /^\d{4}\.\d{2}\.\d{2}$/.test(v || '') ? Date.parse(v.replaceAll('.', '-')) : NaN,
      )
      .find(Number.isFinite) ||
    g.createdAt ||
    0;
  return result.sort((a, b) =>
    sort === 'longest'
      ? b.moves.length - a.moves.length
      : sort === 'shortest'
        ? a.moves.length - b.moves.length
        : sort === 'oldest'
          ? stamp(a) - stamp(b)
          : stamp(b) - stamp(a),
  );
}
function renderLibrary() {
  $('#library-count').textContent = library.length;
  const fragment = document.createDocumentFragment();
  for (const id of librarySelection)
    if (!library.some((g) => g.id === id)) librarySelection.delete(id);
  const visible = visibleLibrary();
  for (const game of visible) {
    const button = document.createElement('button');
    button.className = 'game-item';
    button.setAttribute('aria-current', String(selected?.id === game.id));
    button.innerHTML = `<span class="game-result">${esc(game.headers.Result || '*')}</span><span class="recent-players"><strong>${esc(game.headers.White || 'Bílý')} <span>–</span> ${esc(game.headers.Black || 'Černý')}</strong><small>${esc(game.headers.Opening || game.headers.ECO || 'Standardní šachy')} · ${Math.ceil(game.moves.length / 2)} tahů</small></span><span class="game-date">${esc(game.headers.Date?.includes('?') ? '' : game.headers.Date || '')}</span><span class="game-state ${game.analysis?.complete ? 'game-analysed complete' : ''}">${game.analysis?.complete ? 'Rozebráno' : game.analysis ? 'Částečný rozbor' : 'Bez rozboru'}</span><span>→</span>`;
    button.addEventListener('click', () => {
      setView('review');
      selectGame(game);
    });
    const row = document.createElement('div');
    row.className = 'library-select-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = librarySelection.has(game.id);
    check.disabled = bulkDeleting;
    check.setAttribute(
      'aria-label',
      `${language() === 'en' ? 'Select' : 'Vybrat'} ${game.headers.White} – ${game.headers.Black}`,
    );
    check.onchange = () => {
      if (check.checked) librarySelection.add(game.id);
      else librarySelection.delete(game.id);
      renderLibrarySelection();
    };
    row.append(check, button);
    fragment.append(row);
  }
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<h3>${library.length ? 'Žádné odpovídající partie' : 'Knihovna je zatím prázdná'}</h3><p>${library.length ? 'Změň hledání nebo filtr.' : 'Načti partie podle přezdívky nebo vlož vlastní PGN.'}</p>`;
    fragment.append(empty);
  }
  $('#game-list').replaceChildren(fragment);
  renderLibrarySelection();
  document.dispatchEvent(new CustomEvent('evala:library'));
}
$('#library-search').addEventListener('input', renderLibrary);
$('#library-filter').addEventListener('change', renderLibrary);
$('#library-sort').addEventListener('change', renderLibrary);
function renderLibrarySelection() {
  $('#library-delete-selected').disabled = !librarySelection.size || bulkDeleting;
  $('#library-delete-all').disabled = !library.length || bulkDeleting;
  $('#library-selection-status').textContent =
    language() === 'en'
      ? `${librarySelection.size} selected · ${visibleLibrary().length} shown`
      : `${librarySelection.size} vybráno · ${visibleLibrary().length} zobrazeno`;
}
$('#library-select-visible').onclick = () => {
  visibleLibrary().forEach((g) => librarySelection.add(g.id));
  renderLibrary();
};
$('#library-clear-selection').onclick = () => {
  librarySelection.clear();
  renderLibrary();
};
async function bulkDelete(all) {
  if (bulkDeleting) return;
  if (job || playerReport?.running) {
    error(
      language() === 'en'
        ? 'Pause the analysis before deleting games.'
        : 'Před mazáním pozastav rozbor.',
    );
    return;
  }
  const ids = all ? library.map((g) => g.id) : [...librarySelection];
  if (!ids.length) return;
  const en = language() === 'en';
  if (
    !window.confirm(
      en
        ? `Delete ${ids.length} games${all ? ' — your entire library' : ''}, including their analyses and notes?${account.user ? ' They will also be removed from your account.' : ''} This cannot be undone.`
        : `Smazat ${ids.length} partií${all ? ' — celou knihovnu' : ''} včetně rozborů a poznámek?${account.user ? ' Smažou se i z tvého účtu.' : ''} Tuto akci nelze vrátit.`,
    )
  )
    return;
  const identity = account.user?.id || 'guest';
  bulkDeleting = true;
  $('.library').inert = true;
  try {
    await removeGames(ids);
    if ((account.user?.id || 'guest') !== identity) return;
    inspectController?.abort();
    inspectResult = null;
    library = library.filter((g) => !ids.includes(g.id));
    librarySelection.clear();
    if (selected && ids.includes(selected.id)) {
      selected = library[0] || null;
      branch = null;
      retryTarget = null;
      ply = 0;
    }
    renderLibrary();
    renderAll();
  } catch (e) {
    error(e.message);
  } finally {
    bulkDeleting = false;
    $('.library').inert = false;
    renderLibrary();
  }
}
$('#library-delete-selected').onclick = () => bulkDelete(false);
$('#library-delete-all').onclick = () => bulkDelete(true);
document.addEventListener('evala:language', renderLibrary);
function selectGame(game) {
  inspectController?.abort();
  inspectResult = null;
  selected = game;
  ply = 0;
  branch = null;
  promotionMove = null;
  $('#promotion').hidden = true;
  sessionStorage.setItem('evala-current-game', game.id);
  rememberPosition();
  error();
  renderLibrary();
  renderAll();
  $('.workspace').classList.remove('library-open');
  if (activeView === 'review') focusBoard();
}
async function addPgn(text) {
  const { games, errors } = parsePgnCollection(text);
  let added = 0;
  for (const game of [...games].reverse()) {
    const existing = library.find(
      (g) =>
        g.id === game.id &&
        g.initialFen === game.initialFen &&
        g.moves.map((m) => m.uci).join(' ') === game.moves.map((m) => m.uci).join(' '),
    );
    if (existing) continue;
    if (library.length >= 200)
      throw new Error('Knihovna má limit 200 partií. Exportuj starší partie a uvolni místo.');
    library.unshift(game);
    await store(game);
    added++;
  }
  $('#import-status').textContent =
    `${added} nových partií${errors.length ? ' · ' + errors.join(' ') : games.length > added ? ' · duplicity přeskočeny' : ''}`;
  const first = library.find((g) => g.id === games[0].id);
  if (first) selectGame(first);
  else renderLibrary();
  $('#import-panel').open = false;
  return games;
}
$('#import-pgn').addEventListener('click', async () => {
  try {
    await addPgn($('#pgn-input').value);
    $('#pgn-input').value = '';
  } catch (e) {
    $('#import-status').textContent = e.message;
  }
});
$('#pgn-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Soubor je větší než 2 MB.');
    await addPgn(await file.text());
  } catch (e) {
    $('#import-status').textContent = e.message;
  }
  event.target.value = '';
});
$('#demo-game').addEventListener('click', () => addPgn(DEMO_PGN).catch((e) => error(e.message)));
const suggestedUser = new URLSearchParams(location.search).get('username');
$('#username').value =
  options.lastUsername || (/^[A-Za-z0-9_-]{2,40}$/.test(suggestedUser || '') ? suggestedUser : '');
$('#platform').value = options.lastPlatform || 'chesscom';
$('#username-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (importController) {
    importController.abort();
    return;
  }
  importController = new AbortController();
  $('#import-username').textContent = 'Zrušit import';
  $('#import-status').textContent = 'Načítám veřejné dokončené partie…';
  try {
    const username = $('#username').value,
      platform = $('#platform').value;
    const pgn = await importUsername(username, platform, {
      signal: importController.signal,
      onProgress: (text) => ($('#import-status').textContent = text),
    });
    await addPgn(pgn);
    options.lastUsername = username;
    options.lastPlatform = platform;
    savePreferences(options);
  } catch (e) {
    $('#import-status').textContent = e.name === 'AbortError' ? 'Import byl zrušen.' : e.message;
  } finally {
    importController = null;
    $('#import-username').textContent = 'Načíst posledních 20';
  }
});

function renderReview() {
  const running = !!job && job.game.id === selected?.id;
  $('#review-game').disabled = !selected || blind() || (!!job && !running) || playerReport?.running;
  $('#review-game').classList.toggle('running', !!running);
  $('#review-game').innerHTML =
    `${running ? 'Pozastavit rozbor' : selected?.analysis?.complete ? 'Znovu rozebrat' : selected?.analysis ? 'Pokračovat v rozboru' : 'Rozebrat partii'}<span>${running ? icons.pause : icons.arrow}</span>`;
  $('#review-state').textContent = running
    ? 'Probíhá'
    : selected?.analysis?.complete
      ? 'Uloženo'
      : selected?.analysis
        ? 'Částečný rozbor'
        : 'Připraveno';
  if (!running) $('#review-progress').hidden = true;
  if (selected) {
    const positions = selected.fens.length,
      seconds = Math.ceil((positions * options.time) / 1000);
    $('#review-estimate').textContent = selected.analysis?.complete
      ? `${selected.moves.length} vyhodnocených tahů · ${selected.analysis.engine === 'lite' ? 'Lite' : 'Full NNUE'}`
      : `${positions} pozic · přibližně ${seconds < 60 ? seconds + ' s' : Math.ceil(seconds / 60) + ' min'} + ověření kritických tahů`;
  }
}
$('#review-game').addEventListener('click', async () => {
  if (job) {
    job.controller.abort();
    return;
  }
  if (!selected || blind()) return;
  if (options.backend === 'server')
    try {
      serverAddress(options.serverUrl);
    } catch (e) {
      error(e.message);
      $('#study-settings').hidden = false;
      return;
    }
  const game = selected;
  if (game.analysis?.complete) game.analysis = null;
  const controller = new AbortController();
  job = { controller, game };
  error();
  renderReview();
  const visibility = () => {
    if (document.hidden && options.backend === 'local') controller.abort();
  };
  document.addEventListener('visibilitychange', visibility);
  try {
    $('#review-progress').hidden = false;
    $('#progress-text').textContent =
      options.backend === 'server'
        ? 'Připojuji server…'
        : options.engine === 'full'
          ? 'Načítám plný engine (~100 MB)…'
          : 'Načítám Lite engine…';
    let lastReviewPaint = 0;
    const onUpdate = ({ phase, index, total, elapsed, processed }) => {
      if (selected?.id === game.id) {
        $('#review-progress').hidden = false;
        $('#progress').value =
          phase === 'queued'
            ? 0
            : phase === 'positions'
              ? (index / total) * 85
              : phase === 'refine'
                ? 85 + (index / Math.max(1, total)) * 10
                : phase === 'done'
                  ? 100
                  : 97;
        const remaining =
          phase === 'positions' && processed > 1
            ? ` · zbývá přibližně ${Math.ceil(((game.fens.length - index) * elapsed) / processed / 1000)} s`
            : '';
        $('#progress-text').textContent =
          phase === 'queued'
            ? language() === 'en'
              ? 'Waiting for an available engine…'
              : 'Čekám na volný engine…'
            : phase === 'positions'
              ? `Pozice ${index}/${total}${remaining}`
              : phase === 'refine'
                ? `Ověřuji kritické momenty ${index}/${total}`
                : phase === 'brilliant'
                  ? 'Ověřuji oběti a brilantní kandidáty…'
                  : 'Rozbor dokončen';
        // Progress numbers stay live; rebuilding the board, notation and graph
        // for every fast engine result needlessly blocks the browser thread.
        const now = performance.now();
        if (!lastReviewPaint || now - lastReviewPaint >= 180 || phase === 'done') {
          lastReviewPaint = now;
          renderPosition();
          renderMoves();
          renderSummary();
          renderGraph();
        }
      }
      if (performance.now() - saveAt > 1500) {
        saveAt = performance.now();
        store(game);
      }
    };
    if (options.backend === 'server') {
      if (publicServer) await publicConnection;
      await remoteReview(options.serverUrl, $('#server-token').value, game, {
        profile: options.profile === 'quick' ? 'quick' : 'balanced',
        signal: controller.signal,
        onUpdate,
      });
      renderAll();
    } else
      await reviewGame(game, engine('review'), settings(), { signal: controller.signal, onUpdate });
    await store(game);
    renderLibrary();
  } catch (e) {
    await store(game);
    if (e.name === 'AbortError') {
      if (selected?.id === game.id)
        $('#review-estimate').textContent =
          'Rozbor pozastaven. Hotové pozice zůstaly uložené; pokračuj stejným profilem.';
    } else error(e.message);
  } finally {
    job = null;
    document.removeEventListener('visibilitychange', visibility);
    renderReview();
    renderLibrary();
    if (activeView === 'review') focusBoard();
  }
});

function renderPosition() {
  learningUI?.refresh();
  const fen = activeFen(),
    result = blind() ? null : currentResult(),
    last = branch ? branch.moves[branch.index - 1] : selected?.moves[ply - 1];
  const mark = !blind() && !branch && ply ? selected?.analysis?.moves?.[ply - 1] : null;
  board.set(fen, {
    flipped,
    lastMove: last,
    mark,
    arrow: options.arrows && !retryTarget ? result?.lines?.[0]?.pv?.[0] : null,
    threatArrow: showThreat && !blind() ? coachThreat(fen)?.uci : null,
  });
  $('.study-eval').classList.toggle('flipped', flipped);
  $('.eval-white').style.transform = `scaleY(${whitePercent(result) / 100})`;
  $('.eval-score').textContent = scoreText(result);
  $('.eval-depth').textContent = result?.depth ? 'd' + result.depth : '';
  $('.study-eval').setAttribute(
    'aria-valuenow',
    String(
      result?.kind === 'mate'
        ? Math.sign(result.value) * 10
        : Math.max(-10, Math.min(10, (result?.value || 0) / 100)),
    ),
  );
  $('.study-eval').setAttribute('aria-valuetext', scoreText(result) + ' z pohledu bílého');
  $('#game-title').textContent = selected
    ? `${selected.headers.White || 'Bílý'} — ${selected.headers.Black || 'Černý'}`
    : 'Vyber partii';
  $('#game-subtitle').textContent = selected
    ? `${selected.headers.Result || '*'} · ${selected.headers.Event || 'Importovaná partie'}${selected.headers.Date && !selected.headers.Date.includes('?') ? ' · ' + selected.headers.Date : ''}`
    : 'Vyber partii v knihovně nebo importuj PGN.';
  if (document.activeElement !== $('#game-note')) $('#game-note').value = selected?.notes || '';
  $('#game-note').disabled = !selected;
  $('#position-label').textContent = branch
    ? `Vlastní varianta · ${branch.index}/${branch.moves.length}`
    : ply
      ? `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${selected.moves[ply - 1].san}`
      : 'Výchozí pozice';
  $('#return-game').hidden = !branch;
  $('#save-variation').hidden = !branch;
  $('#first-move').disabled = branch ? branch.index === 0 : ply === 0;
  $('#previous-move').disabled = $('#first-move').disabled;
  $('#last-move').disabled = branch
    ? branch.index === branch.moves.length
    : !selected || ply === selected.moves.length;
  $('#next-move').disabled = $('#last-move').disabled;
  $('#analyze-position').disabled = !selected || blind();
  $('#export-pgn').disabled = !selected;
  $('#delete-game').disabled = !selected || job?.game.id === selected?.id;
  $('#move-classification').innerHTML = mark
    ? `<span class="classification ${esc(mark.kind)}">${moveIcon(mark.kind)}<span>${esc(last?.san)} · ${esc(mark.label)}</span></span>`
    : '';
  $('#board-feedback').innerHTML = mark
    ? `<span class="classification ${esc(mark.kind)}">${moveIcon(mark.kind)}<span>${esc(last?.san)} · ${esc(mark.label)}</span></span>`
    : `<span>${branch ? 'Vlastní varianta' : ply ? 'Tah bez rozboru' : 'Výchozí pozice'}</span>`;
  $('#move-explanation').textContent = branch
    ? 'Zkoušíš vlastní pokračování. Tlačítkem Prozkoumat pozici spustíš nový výpočet.'
    : mark
      ? `${mark.note}${
          mark.proof?.captures?.length
            ? ' ' +
              (language() === 'en' ? 'After accepting the sacrifice: ' : 'Po přijetí oběti: ') +
              mark.proof.captures
                .map((p) => p.continuation)
                .filter(Boolean)
                .join(' | ')
            : ''
        }`
      : ply
        ? 'Tento tah zatím nemá hodnocení. Spusť rozbor partie.'
        : 'Vyber tah nebo spusť rozbor celé partie.';
  renderCoach(fen, result, last, mark);
  renderCoachJourney();
  renderLines(result, fen);
}
function coachThreat(fen) {
  const key = language() + ':' + fen;
  if (!threatCache.has(key)) {
    if (threatCache.size >= 100) threatCache.delete(threatCache.keys().next().value);
    threatCache.set(key, detectThreats(fen, { lang: language() }));
  }
  return threatCache.get(key);
}
function renderCoach(fen, result, last, mark) {
  const card = $('#gm-coach-card');
  card.hidden = !mark || !last || !!retryTarget;
  if (card.hidden) return;
  const before = selected?.analysis?.positions?.[ply - 1],
    best = before?.lines?.[0]?.pv?.[0];
  const bestSan = best ? lineToSan(selected.fens[ply - 1], [best], 1) : '';
  $('#gm-coach-text').textContent = generateGmAdvice(last, mark, last.fenBefore, fen, {
    lang: language(),
    bestSan,
    before,
    after: result,
  });
  $('#gm-retry-btn').hidden =
    !!branch ||
    !best ||
    best === last.uci ||
    !['inaccuracy', 'mistake', 'blunder', 'miss'].includes(mark.kind);
  $('#coach-best').disabled = !legalContinuation(last.fenBefore, before?.lines?.[0]?.pv).length;
  $('#coach-reply').disabled = !legalContinuation(fen, result?.lines?.[0]?.pv).length;
  $('#gm-voice-btn').disabled = !globalThis.speechSynthesis;
  const sharpness = assessSharpness(result?.lines, { lang: language() });
  $('#position-sharpness').hidden = sharpness.type === 'normal';
  $('#position-sharpness').className = 'sharpness-chip ' + sharpness.type;
  $('#position-sharpness').textContent = sharpness.label;
  $('#position-sharpness').title = sharpness.detail;
  const threat = coachThreat(fen);
  $('#threat-radar-card').hidden = !threat;
  if (threat) {
    $('#threat-text').textContent = threat.desc;
    $('#threat-toggle').textContent = translate(showThreat ? 'Skrýt hrozbu' : 'Ukázat hrozbu');
    $('#threat-toggle').setAttribute('aria-pressed', String(showThreat));
  }
  const fragment = document.createDocumentFragment();
  for (const text of analyzeImbalances(fen, { lang: language() })) {
    const chip = document.createElement('span');
    chip.className = 'imbalance-chip';
    chip.textContent = text;
    fragment.append(chip);
  }
  $('#imbalances-list').replaceChildren(fragment);
}
function renderCoachJourney() {
  const en = language() === 'en',
    moments = blind() ? [] : reviewMoments(selected, $('#coach-color').value);
  const index = moments.findIndex((m) => m.ply === ply);
  $('#coach-progress').textContent = blind()
    ? en
      ? 'Find your move on the board. Engine hints are hidden.'
      : 'Najdi vlastní tah na šachovnici. Nápověda enginu je skrytá.'
    : !selected?.analysis?.complete
      ? en
        ? 'Finish the game review to explore its key decisions.'
        : 'Dokonči rozbor partie a projdi její důležitá rozhodnutí.'
      : !moments.length
        ? en
          ? 'No key mistakes or exceptional moves found. You can still explore every move in Notation.'
          : 'Nenalezeny klíčové chyby ani výjimečné tahy. Všechny tahy můžeš projít v záložce Tahy.'
        : branch
          ? en
            ? 'Exploring a variation. Use the board arrows, then return to the game.'
            : 'Procházíš variantu. Použij šipky u šachovnice a pak se vrať do partie.'
          : index < 0
            ? en
              ? `${moments.length} key decisions to explore.`
              : `${moments.length} důležitých rozhodnutí k rozboru.`
            : en
              ? `Decision ${index + 1} of ${moments.length}`
              : `Rozhodnutí ${index + 1} z ${moments.length}`;
  $('#coach-previous').disabled = !moments.length || !!retryTarget;
  $('#coach-next').disabled = !moments.length || !!retryTarget;
  $('#retry-cancel').hidden = !retryTarget;
}
function coachStep(direction) {
  const moments = reviewMoments(selected, $('#coach-color').value);
  const next =
    direction > 0
      ? moments.find((m) => m.ply > ply) || moments[0]
      : [...moments].reverse().find((m) => m.ply < ply) || moments.at(-1);
  if (next) navigate(next.ply);
}
$('#coach-color').addEventListener('change', renderCoachJourney);
$('#coach-next').addEventListener('click', () => coachStep(1));
$('#coach-previous').addEventListener('click', () => coachStep(-1));
$('#coach-best').addEventListener('click', () => {
  const pv = selected?.analysis?.positions?.[ply - 1]?.lines?.[0]?.pv;
  if (!pv || branch || !ply) return;
  navigate(ply - 1);
  startBranch(pv);
});
$('#coach-reply').addEventListener('click', () => {
  const pv = currentResult()?.lines?.[0]?.pv;
  if (pv) startBranch(pv);
});
$('#retry-cancel').addEventListener('click', () => navigate(retryTarget?.returnPly ?? ply));
function renderLines(result, fen) {
  const lines = result?.lines || [];
  $('#lines-state').textContent = result?.depth
    ? `d${result.depth} · ${(result.time / 1000).toFixed(1)} s`
    : '—';
  const fragment = document.createDocumentFragment();
  if (!lines.length) {
    const p = document.createElement('p');
    p.className = 'panel-empty';
    p.textContent = result?.terminal
      ? 'Konec pozice: ' + (result.kind === 'mate' ? 'mat.' : 'remíza.')
      : 'Pro tuto pozici zatím nejsou varianty. Spusť rozbor nebo prozkoumej pozici.';
    fragment.append(p);
  }
  for (const line of lines) {
    const button = document.createElement('button');
    button.className = 'engine-line';
    button.title = 'Kliknutím přehraješ tuto variantu';
    button.innerHTML = `<span class="line-head"><strong>${esc(scoreText(line))}</strong><span>Hloubka ${esc(line.depth)}</span><em>Přehrát variantu</em></span><span class="line-san">${esc(lineToSan(fen, line.pv, 14))}</span>`;
    button.addEventListener('click', () => startBranch(line.pv));
    fragment.append(button);
  }
  $('#engine-lines').replaceChildren(fragment);
}
function renderMoves() {
  renderNotation($('#move-list'), {
    selected,
    ply,
    branch,
    requestedFilter: $('#move-filter').value,
    conceal: blind(),
    navigate,
  });
}
function renderSummary() {
  const available = !!selected?.analysis?.moves?.some(Boolean);
  $('#review-summary-empty').hidden = available;
  if (!available) {
    $('#summary').hidden = true;
    return;
  }
  const summary = summarize(selected);
  $('#summary').hidden = false;
  $('#summary').innerHTML = summaryMarkup(selected, summary);
  $('#start-guided-review')?.addEventListener('click', () => {
    setAnalysisTab('coach');
    navigate(0);
    coachStep(1);
  });
  $('#summary')
    .querySelectorAll('[data-jump-kind]')
    .forEach(
      (button) =>
        (button.onclick = () => {
          const indices = selected.analysis.moves
            .map((mark, i) =>
              mark?.kind === button.dataset.jumpKind &&
              selected.moves[i].color === button.dataset.color
                ? i + 1
                : null,
            )
            .filter(Boolean);
          const index = indices.find((i) => i > ply) || indices[0];
          if (index) {
            $('#move-filter').value = 'all';
            renderMoves();
            setAnalysisTab('moves');
            navigate(index);
            focusBoard();
          }
        }),
    );
}
function renderGraph() {
  const positions = selected?.analysis?.positions;
  if (!positions?.some(Boolean)) {
    $('#eval-graph').innerHTML =
      '<p class="empty-graph">Po rozboru tu uvidíš zvraty a rozhodující momenty.</p>';
    return;
  }
  const width = 600,
    max = Math.max(1, selected.fens.length - 1),
    point = (score, i) => [
      (i / max) * width,
      score.kind === 'mate' ? (score.value > 0 ? 8 : 118) : 63 - Math.tanh(score.value / 500) * 55,
    ];
  let path = '';
  for (let i = 0; i < positions.length; i++) {
    const score = positions[i];
    if (!score) continue;
    const [x, y] = point(score, i);
    path += (path ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  $('#eval-graph').innerHTML =
    `<span class="graph-label graph-label-white">Bílý +</span><span class="graph-label graph-label-black">Černý −</span><svg viewBox="0 0 600 126" preserveAspectRatio="none" role="img" aria-label="Graf hodnocení. Kliknutím přejdeš na tah."><path d="M0 63H600" stroke="var(--muted)" stroke-width="1"/><path d="M0 20H600M0 106H600" stroke="var(--line)" stroke-width="1"/><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><path class="graph-cursor" d="M${(ply / max) * 600} 0V126"/></svg>`;
  $('#eval-graph svg').addEventListener('click', (event) => {
    const r = event.currentTarget.getBoundingClientRect();
    navigate(Math.max(0, Math.min(max, Math.round(((event.clientX - r.left) / r.width) * max))));
  });
}
function renderAll() {
  renderPosition();
  renderMoves();
  renderSummary();
  renderGraph();
  renderReview();
}
function highlightMove(scroll = false) {
  const list = $('#move-list');
  for (const button of list.querySelectorAll('[data-ply]'))
    button.setAttribute('aria-current', String(!branch && Number(button.dataset.ply) === ply));
  const current = list.querySelector('[aria-current="true"]');
  if (scroll && current) {
    const item = current.getBoundingClientRect(),
      bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
  }
}
function rememberPosition() {
  if (selected && !branch)
    queueAccountPreferences({ lastPosition: { gameId: selected.id, ply, flipped } });
}
function navigate(index) {
  const previous = activeFen();
  retryTarget = null;
  $('#retry-feedback').textContent = '';
  showThreat = false;
  inspectController?.abort();
  inspectResult = null;
  branch = null;
  promotionMove = null;
  $('#promotion').hidden = true;
  ply = Math.max(0, Math.min(selected?.moves.length || 0, index));
  renderPosition();
  highlightMove(true);
  renderGraph();
  if (activeFen() !== previous) playMoveSound();
  rememberPosition();
}
function step(amount) {
  if (branch) {
    const previous = branch.index;
    inspectController?.abort();
    inspectResult = null;
    branch.index = Math.max(0, Math.min(branch.moves.length, branch.index + amount));
    renderPosition();
    highlightMove();
    if (branch.index !== previous) playMoveSound();
  } else navigate(ply + amount);
}
$('#previous-move').addEventListener('click', () => step(-1));
$('#next-move').addEventListener('click', () => step(1));
$('#first-move').addEventListener('click', () =>
  branch ? step(-branch.moves.length) : navigate(0),
);
$('#last-move').addEventListener('click', () =>
  branch ? step(branch.moves.length) : navigate(selected?.moves.length || 0),
);
$('#return-game').addEventListener('click', () => navigate(ply));
$('#save-variation').addEventListener('click', async () => {
  if (!selected || !branch) return;
  const game = selected,
    moves = branch.moves.map((m) => m.uci);
  const data = cleanLearning(game.learning, game.moves);
  if (!data.variations.some((v) => v.ply === ply && v.moves.join(' ') === moves.join(' '))) {
    if (data.variations.length >= 20) {
      error(
        language() === 'en'
          ? 'This game already has 20 saved variations. Delete one in My notes.'
          : 'Partie již má 20 uložených variant. Některou smaž v poznámkách.',
      );
      return;
    }
    data.variations.push({ ply, moves });
  }
  game.learning = cleanLearning(data, game.moves);
  try {
    await saveGame(game, { syncPartial: true });
    if (selected === game) {
      learningUI?.invalidate();
      $('#save-variation').textContent =
        language() === 'en' ? 'Variation saved' : 'Varianta uložena';
    }
  } catch (e) {
    error(e.message);
  }
});
$('#flip-board').addEventListener('click', () => {
  flipped = !flipped;
  renderPosition();
  rememberPosition();
});
$('#move-filter').addEventListener('change', () => {
  renderMoves();
  focusBoard();
});
$('#gm-voice-btn').addEventListener('click', () =>
  speakGmVoice($('#gm-coach-text').textContent, { lang: language() }),
);
$('#threat-toggle').addEventListener('click', () => {
  showThreat = !showThreat;
  renderPosition();
});
$('#gm-retry-btn').addEventListener('click', () => {
  if (!selected || branch || !ply) return;
  const index = ply - 1,
    bestUci = selected.analysis?.positions?.[index]?.lines?.[0]?.pv?.[0];
  if (!bestUci) return;
  navigate(index);
  retryTarget = {
    fen: activeFen(),
    bestUci,
    position: selected.analysis.positions[index],
    returnPly: index + 1,
  };
  setAnalysisTab('coach');
  renderPosition();
  $('#retry-feedback').textContent = translate('Zahraj lepší tah na šachovnici.');
  $('#retry-feedback').dataset.state = '';
  focusBoard();
});
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape') {
      if (!$('#study-settings').hidden) $('#close-settings').click();
      else if (branch) navigate(ply);
      return;
    }
    if (
      document.body.dataset.page !== 'analysis' ||
      activeView !== 'review' ||
      !selected ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.target.closest('input,textarea,[contenteditable="true"]') ||
      event.target.closest('#study-settings') ||
      event.target.closest('[role=tablist]')
    )
      return;
    if (event.target.closest('select') && !['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home') branch ? step(-branch.moves.length) : navigate(0);
      else if (event.key === 'End')
        branch ? step(branch.moves.length) : navigate(selected.moves.length);
      else step(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
    }
  },
  true,
);
function startBranch(pv) {
  inspectController?.abort();
  inspectResult = null;
  const fen = activeFen(),
    chess = new Chess(fen),
    moves = [],
    fens = [fen];
  for (const uci of pv) {
    try {
      const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      moves.push({ from: m.from, to: m.to, san: m.san, uci });
      fens.push(chess.fen());
    } catch {
      break;
    }
  }
  if (!moves.length) return;
  branch = { fens, moves, index: 1 };
  renderPosition();
  renderMoves();
}
function makeBoardMove(move) {
  if (!selected) return;
  if (move.promotions.length) {
    promotionMove = move;
    $('#promotion').hidden = false;
    $('#promotion button').focus();
    return;
  }
  commitBoardMove(move);
}
function commitBoardMove(move, promotion) {
  inspectController?.abort();
  inspectResult = null;
  const chess = new Chess(activeFen());
  let m;
  try {
    m = chess.move({ from: move.from, to: move.to, promotion });
  } catch {
    return;
  }
  if (retryTarget && retryTarget.fen === activeFen()) {
    const playedUci = m.from + m.to + (m.promotion || '');
    const judgement = judgeRetry(activeFen(), playedUci, retryTarget.position);
    if (!['best', 'sound'].includes(judgement)) {
      $('#retry-feedback').textContent = translate(
        judgement === 'unknown'
          ? 'Tento tah není mezi ověřenými variantami. Zkus jiný, nebo se vrať a prozkoumej ho enginem.'
          : 'Tato varianta ztrácí více hodnocení. Zkus jiný tah.',
      );
      $('#retry-feedback').dataset.state = judgement === 'unknown' ? '' : 'incorrect';
      queueRender();
      return;
    }
    $('#retry-feedback').textContent = translate(
      judgement === 'sound'
        ? 'Dobré řešení. Ověřená alternativa zachovává hodnocení pozice.'
        : 'Správně. Našel jsi doporučený tah.',
    );
    $('#retry-feedback').dataset.state = 'success';
    retryTarget = null;
  }
  if (!branch) branch = { fens: [activeFen()], moves: [], index: 0 };
  branch.fens = branch.fens.slice(0, branch.index + 1);
  branch.moves = branch.moves.slice(0, branch.index);
  branch.moves.push({
    from: m.from,
    to: m.to,
    san: m.san,
    uci: m.from + m.to + (m.promotion || ''),
  });
  branch.fens.push(chess.fen());
  branch.index++;
  $('#promotion').hidden = true;
  promotionMove = null;
  renderPosition();
  renderMoves();
  playMoveSound();
  inspectPosition();
}
$('#promotion').addEventListener('click', (event) => {
  const type = event.target.dataset.promotion;
  if (type && promotionMove) commitBoardMove(promotionMove, type);
});
async function inspectPosition() {
  if (!selected || blind()) return;
  inspectController?.abort();
  const controller = new AbortController();
  inspectController = controller;
  const fen = activeFen();
  $('#inspect-status').textContent = 'Počítám pokračování…';
  error();
  try {
    if (publicServer) await publicConnection;
    const history = branch
      ? undefined
      : { initialFen: selected.initialFen, moves: selected.moves.slice(0, ply).map((m) => m.uci) };
    const result = await engine('inspect').search(
      { fen, history, settings: { ...settings(), time: Math.max(1500, options.time) } },
      {
        signal: controller.signal,
        onInfo: (result) => {
          if (!controller.signal.aborted && fen === activeFen()) {
            inspectResult = { fen, result };
            queueRender();
          }
        },
      },
    );
    if (!controller.signal.aborted && fen === activeFen()) {
      inspectResult = { fen, result };
      renderPosition();
      $('#inspect-status').textContent =
        `Hotovo · hloubka ${result.depth} · ${new Intl.NumberFormat('cs-CZ', { notation: 'compact' }).format(result.nps || 0)} uzlů/s`;
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      error(e.message);
      $('#inspect-status').textContent = 'Výpočet se nepodařilo dokončit.';
    }
  }
}
$('#analyze-position').addEventListener('click', inspectPosition);
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#export-pgn').addEventListener('click', () => {
  if (selected)
    download(annotatedPgn(selected), `evala-${selected.id}.pgn`, 'application/x-chess-pgn');
});
$('#game-note').addEventListener('change', async () => {
  if (selected) {
    selected.notes = $('#game-note').value;
    await store(selected, { syncPartial: true });
  }
});
$('#copy-fen').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(activeFen());
    $('#copy-fen').textContent = 'Zkopírováno';
    setTimeout(() => ($('#copy-fen').textContent = 'FEN'), 1500);
  } catch {
    error('FEN se nepodařilo zkopírovat. Povol přístup ke schránce.');
  }
});
$('#next-critical').addEventListener('click', () => {
  const indices = (selected?.analysis?.moves || [])
    .map((mark, i) =>
      mark && ['mistake', 'blunder', 'miss', 'great', 'brilliant'].includes(mark.kind)
        ? i + 1
        : null,
    )
    .filter(Boolean);
  if (indices.length) {
    $('#move-filter').value = 'all';
    renderMoves();
    navigate(indices.find((i) => i > ply) || indices[0]);
  }
});
$('#delete-game').addEventListener('click', async () => {
  if (!selected || job?.game.id === selected.id) return;
  const id = selected.id;
  try {
    await removeGame(id);
    library = library.filter((g) => g.id !== id);
    selected = null;
    branch = null;
    ply = 0;
    if (library[0]) selectGame(library[0]);
    else {
      renderLibrary();
      renderAll();
    }
  } catch (e) {
    error(e.message);
  }
});

playerReport = new PlayerReport({
  library: () => library,
  addPgn,
  save: store,
  engine: () => engine('review'),
  settings: () => ({ ...settings(), publicServer, token: $('#server-token').value }),
  onChange: () => {
    if (playerReport.games.length) {
      options.reportIds = [...playerReport.checked];
      options.reportUser = $('#insight-username').value;
      savePreferences(options);
    }
    renderLibrary();
    renderReview();
    if (activeView === 'analytics') updateAnalytics();
  },
  onPlayer: (username, platform) => {
    options.lastUsername = username;
    options.lastPlatform = platform;
    options.reportIds = [...playerReport.checked];
    options.reportUser = username;
    savePreferences(options);
    $('#insight-username').value = username;
    $('#username').value = username;
    updateAnalytics();
  },
  onOpen: (game) => {
    if (game) {
      setView('review');
      selectGame(game);
    }
  },
});
$('#report-profile').addEventListener('change', (event) => {
  options.reportProfile = event.target.value;
  savePreferences(options);
  playerReport.updateCount();
});
$('#report-count').addEventListener('change', (event) => {
  options.reportCount = Number(event.target.value);
  savePreferences(options);
});
$('#report-profile').value = options.reportProfile || 'quick';
$('#report-count').value = String(options.reportCount || 20);
$('#report-username').value = options.lastUsername || $('#username').value;
$('#report-platform').value = options.lastPlatform || 'chesscom';
syncSettings();
if (publicServer) {
  $('#server-token').value = '';
  $('#server-fields').hidden = true;
} else if (hostedServer && options.backend === 'server' && !$('#server-token').value) {
  $('#study-settings').hidden = false;
  $('#server-status').textContent = 'Pro serverový rozbor zadej svůj API token a ověř spojení.';
}
try {
  library = await loadLibrary();
  const resume = account.user?.preferences?.lastPosition;
  selected =
    library.find((g) => g.id === resume?.gameId) ||
    library.find((g) => g.id === sessionStorage.getItem('evala-current-game')) ||
    library[0] ||
    null;
  if (resume?.gameId === selected?.id) {
    ply = Math.min(resume.ply, selected.moves.length);
    flipped = resume.flipped;
  }
} catch (e) {
  error(e.message);
}
if (options.reportUser === $('#report-username').value) playerReport.restore(options.reportIds);
renderLibrary();
renderAll();
document.addEventListener('evala:language', () => {
  renderAll();
  if (activeView === 'analytics') updateAnalytics();
});
document.addEventListener('evala:page', (event) => {
  activeView = event.detail === 'insights' ? 'analytics' : 'review';
  if (activeView === 'analytics') {
    if (!$('#insight-username').value)
      $('#insight-username').value = options.lastUsername || $('#report-username').value;
    updateAnalytics();
  }
});
let reloadSequence = 0;
const reloadLibrary = async ({ resume = false } = {}) => {
  const sequence = ++reloadSequence,
    owner = account.user?.id || 'guest',
    generation = account.user?.generation,
    id = selected?.id,
    previousPly = ply,
    next = await loadLibrary();
  if (
    sequence !== reloadSequence ||
    owner !== (account.user?.id || 'guest') ||
    generation !== account.user?.generation
  )
    return;
  library = next;
  const position = resume ? account.user?.preferences?.lastPosition : null;
  selected =
    library.find((g) => g.id === position?.gameId) ||
    library.find((g) => g.id === id) ||
    library[0] ||
    null;
  branch = null;
  retryTarget = null;
  ply = Math.min(
    position && position.gameId === selected?.id
      ? position.ply
      : selected?.id === id
        ? previousPly
        : 0,
    selected?.moves.length || 0,
  );
  if (position && position.gameId === selected?.id) flipped = position.flipped;
  renderLibrary();
  renderAll();
};
learningUI = initLearning({
  importGame: async (pgn) => {
    await addPgn(pgn);
    setView('review');
  },
  selected: () => selected,
  ply: () => ply,
  library: () => library,
  username: () => $('#insight-username').value || options.lastUsername || '',
  busy: () => !!job || !!playerReport?.running,
  cancel: () => {
    inspectController?.abort();
    inspectResult = null;
  },
  render: renderAll,
  navigate,
  save: (game) => saveGame(game, { syncPartial: true }),
  playLine: (index, line) => {
    navigate(index);
    startBranch(line);
  },
  openGame: (game, index) => {
    setView('review');
    selectGame(game);
    navigate(index);
  },
  search: async (fen, signal) => {
    inspectController?.abort();
    if (publicServer) await publicConnection;
    return engine('inspect').search(
      { fen, settings: { ...settings(), time: 1200, depth: 18, multipv: 2 } },
      { signal },
    );
  },
});
await initPlatform({
  library: () => library,
  username: () => options.lastUsername || '',
  openGame: (game, ply) => {
    selectGame(game);
    if (Number.isInteger(ply)) navigate(ply);
    focusBoard();
  },
  busy: () => !!job || !!playerReport?.running,
  reload: reloadLibrary,
  applyAccountPreferences: () => {
    options = getPreferences(hostedServer ? { backend: 'server', serverUrl: location.origin } : {});
    $('#report-profile').value = options.reportProfile || 'quick';
    $('#report-count').value = String(options.reportCount || 20);
    syncSettings();
    renderPosition();
  },
  sync: async () => {
    const active = account.user;
    if (hostedServer) await refreshAccount();
    if (active?.id !== account.user?.id || active?.generation !== account.user?.generation) return;
    await flushAccountPreferences();
    for (const game of library.filter((g) => g._syncPending))
      await saveGame(game, { syncPartial: true });
    await reloadLibrary({ resume: true });
  },
  setUsername: (name, platform) => {
    options.lastUsername = name;
    options.lastPlatform = platform;
    options.reportIds = null;
    options.reportUser = name;
    for (const id of ['username', 'report-username', 'insight-username']) $('#' + id).value = name;
    $('#platform').value = $('#report-platform').value = platform;
    savePreferences(options);
    updateAnalytics();
  },
  onIdentity: async (user) => {
    job?.controller.abort();
    playerReport.controller?.abort();
    inspectController?.abort();
    importController?.abort();
    await setStorageIdentity(user);
    if (user?.id !== account.user?.id || user?.generation !== account.user?.generation) return;
    options = getPreferences(hostedServer ? { backend: 'server', serverUrl: location.origin } : {});
    const prefs = user?.preferences;
    if (prefs?.chessUsername) {
      options.lastUsername = prefs.chessUsername;
      options.lastPlatform = prefs.chessPlatform || 'chesscom';
    }
    for (const id of ['username', 'report-username', 'insight-username'])
      $('#' + id).value = options.lastUsername || '';
    $('#platform').value = $('#report-platform').value = options.lastPlatform || 'chesscom';
    playerReport.games = [];
    playerReport.checked.clear();
    playerReport.render();
    $('.player-setup').classList.remove('report-complete');
    $('#report-complete-bar').hidden = true;
    syncSettings();
    $('#report-profile').value = options.reportProfile || 'quick';
    $('#report-count').value = String(options.reportCount || 20);
    await reloadLibrary({ resume: true });
    updateAnalytics();
  },
});
let lastAccountRefresh = Date.now();
const resumeAccount = async (force = false) => {
  if (
    !hostedServer ||
    document.hidden ||
    job ||
    playerReport?.running ||
    (!force && Date.now() - lastAccountRefresh < 60000)
  )
    return;
  lastAccountRefresh = Date.now();
  try {
    await flushAccountPreferences();
  } catch {
    /* Retry after verifying the session. */
  }
  try {
    await refreshAccount();
    await flushAccountPreferences();
  } catch {
    renderAccountIdentity();
  }
};
window.addEventListener('online', () => resumeAccount(true));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) resumeAccount(true);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resumeAccount();
  else flushAccountPreferences({ keepalive: true }).catch(() => {});
});
window.addEventListener('pagehide', () => {
  flushAccountPreferences({ keepalive: true }).catch(() => {});
  playerReport.controller?.abort();
  job?.controller.abort();
  inspectController?.abort();
  importController?.abort();
  reviewer?.dispose();
  inspector?.dispose();
});
