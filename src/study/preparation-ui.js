import { account } from './account.js';
import { language } from './i18n.js';
import { parsePgnCollection } from './game.js';
import { parsePgnTree, treePath, exportPgnTree } from '../core/pgn-tree.js';
import {
  openingRows,
  localOpeningRows,
  tablebasePosition,
  tablebaseResult,
  opponentReport,
} from '../core/preparation.js';
import { importUsername } from './import.js';
import { preparationJson, connectExplorer, resumeExplorer } from './preparation-api.js';

const t = (cs, en) => (language() === 'en' ? en : cs);
const owner = () => `${account.user?.id || 'guest'}:${account.user?.generation || ''}`;
const button = (id, text) =>
  `<button type="button" class="quiet-button" id="${id}">${text}</button>`;
const select = (id, label, options) =>
  `<label>${label}<select id="${id}">${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></label>`;
const speeds = () => [
  ['all', t('Všechna tempa', 'All time controls')],
  ['blitz', 'Blitz'],
  ['rapid', 'Rapid'],
  ['classical', t('Klasika', 'Classical')],
  ['bullet', 'Bullet'],
];

export function createPreparation(context) {
  const tab = document.createElement('button'),
    root = document.createElement('section');
  tab.type = 'button';
  tab.id = 'analysis-preparation-tab';
  tab.dataset.analysisTab = 'preparation';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', 'preparation-panel');
  tab.setAttribute('aria-selected', 'false');
  tab.tabIndex = -1;
  tab.onclick = () => context.tab('preparation');
  tab.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-analysis-tab]')],
      index = tabs.indexOf(tab);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    context.tab(tabs[next].dataset.analysisTab);
    tabs[next].focus();
  };
  document.querySelector('.analysis-tabs').append(tab);
  root.id = 'preparation-panel';
  root.dataset.panelSection = 'preparation';
  root.dataset.i18nIgnore = '';
  root.className = 'preparation';
  document.querySelector('.analysis-panel').append(root);
  let fen,
    game,
    pgn,
    tree,
    token = null,
    bookJob,
    tableJob,
    opponentJob,
    opponentGames = [],
    opponentName = '';
  let identity = owner(),
    locale,
    connectionMessage = '';
  const cache = new Map();
  const $ = (s) => root.querySelector(s);
  const status = (s, text) => {
    $(s).textContent = text;
  };
  const message = (error) =>
    error.name === 'AbortError'
      ? t(
          'Požadavek přerušen nebo vypršel čas. Zkus to znovu.',
          'Request cancelled or timed out. Try again.',
        )
      : error.message;
  const busy = () => {
    if (context.busy())
      throw Error(t('Počkej na dokončení analýzy.', 'Wait for the analysis to finish.'));
  };
  async function cached(url, signal, auth) {
    const saved = cache.get(url);
    if (saved && Date.now() - saved.at < 300_000) return saved.value;
    const value = await preparationJson(url, { signal, token: auth });
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(url, { at: Date.now(), value });
    return value;
  }
  const category = (value) =>
    ({
      win: t('Výhra', 'Win'),
      loss: t('Prohra', 'Loss'),
      draw: t('Remíza', 'Draw'),
      'cursed-win': t('Výhra bez pravidla 50 tahů', 'Win without the 50-move rule'),
      'blessed-loss': t('Remíza díky pravidlu 50 tahů', 'Draw under the 50-move rule'),
      'maybe-win': t('Možná výhra', 'Possible win'),
      'maybe-loss': t('Možná prohra', 'Possible loss'),
      'syzygy-win': t('Výhra podle Syzygy', 'Syzygy win'),
      'syzygy-loss': t('Prohra podle Syzygy', 'Syzygy loss'),
      unknown: t('Neznámý výsledek', 'Unknown result'),
    })[value];
  function moveButtons(selector, rows, tablebase = false) {
    const out = $(selector);
    out.replaceChildren();
    for (const row of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preparation-move';
      const title = document.createElement('strong'),
        detail = document.createElement('span');
      title.textContent = row.san;
      detail.textContent = tablebase
        ? category(row.category)
        : `${row.total.toLocaleString()} · ${Math.round((row.white / row.total) * 100)} / ${Math.round((row.draws / row.total) * 100)} / ${Math.round((row.black / row.total) * 100)} %`;
      b.append(title, detail);
      b.onclick = () => {
        try {
          busy();
          context.playMove(row.uci);
        } catch (e) {
          status('#prep-position-status', message(e));
        }
      };
      out.append(b);
    }
  }
  async function loadBook() {
    bookJob?.abort();
    const job = (bookJob = new AbortController()),
      at = fen,
      who = owner();
    $('#prep-book-load').disabled = true;
    status('#prep-book-status', t('Načítám…', 'Loading…'));
    try {
      const source = $('#prep-book-source').value,
        speed = $('#prep-book-speed').value;
      let rows;
      if (source === 'local') rows = localOpeningRows(at, context.library(), speed);
      else {
        if (!token)
          throw Error(
            t(
              'Nejdřív připoj Lichess. Přihlášení do Evaly zůstává stejné.',
              'Connect Lichess first. Your Evala login stays the same.',
            ),
          );
        const masters = source === 'masters';
        const url = new URL(
          masters ? 'https://explorer.lichess.org/masters' : 'https://explorer.lichess.org/lichess',
        );
        const query = new URLSearchParams({ fen: at, moves: '12', topGames: '0' });
        if (!masters) {
          query.set('variant', 'standard');
          query.set('ratings', $('#prep-book-rating').value);
          query.set('speeds', speed === 'all' ? 'bullet,blitz,rapid,classical' : speed);
          query.set('recentGames', '0');
        }
        url.search = query;
        rows = openingRows(at, await cached(url.href, job.signal, token));
      }
      if (job.signal.aborted || at !== fen || who !== owner()) return;
      moveButtons('#prep-book-results', rows);
      status(
        '#prep-book-status',
        rows.length
          ? t(
              'Partie · bílý / remíza / černý. Malý vzorek není doporučení enginu.',
              'Games · white / draw / black. A small sample is not an engine recommendation.',
            )
          : t('Pro tuto pozici nejsou partie.', 'No games for this position.'),
      );
    } catch (e) {
      if (job === bookJob && at === fen && who === owner()) status('#prep-book-status', message(e));
    } finally {
      if (job === bookJob) $('#prep-book-load').disabled = false;
    }
  }
  async function loadTablebase() {
    tableJob?.abort();
    const job = (tableJob = new AbortController()),
      at = fen,
      who = owner();
    $('#prep-table-load').disabled = true;
    status('#prep-table-status', t('Ověřuji…', 'Checking…'));
    try {
      if (!tablebasePosition(at))
        throw Error(
          t('Nejvýše 7 kamenů a žádné právo rošády.', 'At most 7 pieces and no castling rights.'),
        );
      const result = tablebaseResult(
        at,
        await cached(
          'https://tablebase.lichess.ovh/standard?' + new URLSearchParams({ fen: at }),
          job.signal,
        ),
      );
      if (job.signal.aborted || at !== fen || who !== owner()) return;
      moveButtons('#prep-table-results', result.moves, true);
      status(
        '#prep-table-status',
        `${category(result.category)} · ${t('na tahu', 'side to move')}. ` +
          (result.dtz === null ? '' : `DTZ ${Math.abs(result.dtz)}. `) +
          (result.dtm === null ? '' : `DTM ${Math.abs(result.dtm)}. `) +
          t(
            'Vzdálenosti jsou v půltazích. DTZ je do braní nebo tahu pěšcem, DTM do matu. Pravidlo 50 tahů je zohledněno.',
            'Distances are half-moves. DTZ is to a capture or pawn move; DTM is to mate. The 50-move rule is included.',
          ),
      );
    } catch (e) {
      if (job === tableJob && at === fen && who === owner())
        status('#prep-table-status', message(e));
    } finally {
      if (job === tableJob) $('#prep-table-load').disabled = !tablebasePosition(fen);
    }
  }
  function renderOpponent() {
    const report = opponentReport(opponentGames, opponentName, {
      side: $('#prep-opponent-side').value,
      speed: $('#prep-opponent-speed').value,
    });
    status(
      '#prep-opponent-status',
      `${report.total} ${t('partií ve vzorku. Frekvence není hodnocení kvality; pod 10 partií ber výsledky s rezervou.', 'games in this sample. Frequency is not move quality; fewer than 10 games is a small sample.')}`,
    );
    const out = $('#prep-opponent-results');
    out.replaceChildren();
    for (const row of report.rows.slice(0, 20)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preparation-move';
      const title = document.createElement('strong'),
        detail = document.createElement('span');
      title.textContent = row.line;
      detail.textContent = `${row.color === 'w' ? t('Bílý', 'White') : t('Černý', 'Black')} · ${row.total} · ${row.wins}/${row.draws}/${row.losses} ${t('V/R/P', 'W/D/L')}`;
      b.append(title, detail);
      b.onclick = async () => {
        try {
          busy();
          await context.importGame(row.pgn);
        } catch (e) {
          status('#prep-opponent-status', message(e));
        }
      };
      out.append(b);
    }
  }
  async function loadOpponent(event) {
    event.preventDefault();
    opponentJob?.abort();
    const job = (opponentJob = new AbortController()),
      who = owner();
    const name = $('#prep-opponent-name').value.trim(),
      platform = $('#prep-opponent-platform').value;
    $('#prep-opponent-load').disabled = true;
    status(
      '#prep-opponent-status',
      t('Načítám dokončené veřejné partie…', 'Loading completed public games…'),
    );
    const timeout = setTimeout(() => job.abort(), 30_000);
    try {
      const text = await importUsername(name, platform, { limit: 100, signal: job.signal });
      if (job.signal.aborted || who !== owner()) return;
      const parsed = parsePgnCollection(text);
      opponentGames = parsed.games;
      opponentName = name;
      renderOpponent();
      if (parsed.errors.length)
        status(
          '#prep-opponent-status',
          $('#prep-opponent-status').textContent +
            ` ${parsed.errors.length} ${t('neplatných partií přeskočeno.', 'invalid games skipped.')}`,
        );
    } catch (e) {
      if (job === opponentJob && who === owner()) status('#prep-opponent-status', message(e));
    } finally {
      clearTimeout(timeout);
      if (job === opponentJob) $('#prep-opponent-load').disabled = false;
    }
  }
  function renderTree() {
    const out = $('#prep-pgn-tree');
    out.replaceChildren();
    tree = game ? parsePgnTree(game.pgn) : null;
    $('#prep-repertoire-add').disabled = !game;
    if (!tree) {
      status(
        '#prep-pgn-status',
        t(
          'Importuj PGN s variantami nebo vyber partii.',
          'Import a PGN with variations or select a game.',
        ),
      );
      return;
    }
    const leaves = tree.nodes.filter((n) => n.id && !n.children.length);
    status(
      '#prep-pgn-status',
      `${leaves.length} ${t('variant. Kliknutím otevřeš pokračování na desce.', 'lines. Click a continuation to view it on the board.')}`,
    );
    for (const node of leaves.slice(0, 128)) {
      const path = treePath(tree, node.id),
        sans = [];
      for (let cursor = node; cursor.parent !== null; cursor = tree.nodes[cursor.parent])
        sans.unshift(cursor.san);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preparation-line';
      b.textContent =
        sans.length <= 18
          ? sans.join(' ')
          : [...sans.slice(0, 14), '…', ...sans.slice(-4)].join(' ');
      b.title = sans.join(' ');
      b.onclick = () => {
        try {
          busy();
          context.openLine(path);
          $('#prep-node-note').value = node.comments.join('\n');
          $('#prep-note-save').dataset.node = node.id;
          $('#prep-note-save').disabled = false;
        } catch (e) {
          status('#prep-pgn-status', message(e));
        }
      };
      out.append(b);
    }
    if (leaves.length > 128)
      status(
        '#prep-pgn-status',
        t(
          'Zobrazeno prvních 128 variant. Export zachovává celý strom.',
          'Showing the first 128 lines. Export retains the entire tree.',
        ),
      );
  }
  function mount() {
    locale = language();
    tab.textContent = t('Příprava', 'Preparation');
    root.innerHTML = `<p id="prep-position-status" role="status"></p><details open><summary>${t('Databáze zahájení', 'Opening explorer')}</summary>
      <div class="preparation-controls">${select('prep-book-source', t('Zdroj', 'Source'), [
        ['local', t('Moje knihovna', 'My library')],
        ['lichess', 'Lichess'],
        ['masters', t('Mistrovské partie', 'Master games')],
      ])}
      ${select('prep-book-rating', t('Rating hráčů Lichess', 'Lichess player ratings'), [
        ['1600,1800,2000,2200,2500', '1600+'],
        ['2000,2200,2500', '2000+'],
        ['2200,2500', '2200+'],
        ['2500', '2500+'],
        ['0,1000,1200,1400,1600,1800,2000,2200,2500', t('Všechny', 'All')],
      ])}
      ${select('prep-book-speed', t('Tempo', 'Time control'), speeds())}</div><div class="setup-actions">${button('prep-book-load', t('Najít pokračování', 'Find continuations'))}${button('prep-lichess', token ? t('Odpojit Lichess', 'Disconnect Lichess') : t('Připojit Lichess', 'Connect Lichess'))}</div>
      <p class="hint">${t('Lichess dostane aktuální pozici jen po kliknutí. Připojení platí do obnovení stránky; token se neukládá.', 'Lichess receives the current position only when requested. Connection lasts until page reload; the token is not saved.')}</p><p id="prep-book-status" role="status"></p><div id="prep-book-results"></div></details>
      <details><summary>${t('Přesné koncovky · 7 kamenů', 'Exact endgames · 7 pieces')}</summary><p class="hint">${t('Včetně králů. Ověření odešle pozici do veřejných Syzygy tabulek Lichessu.', 'Kings count as pieces. Checking sends the position to the public Lichess Syzygy tablebases.')}</p>${button('prep-table-load', t('Ověřit pozici', 'Check position'))}<p id="prep-table-status" role="status"></p><div id="prep-table-results"></div></details>
      <details><summary>${t('Příprava na soupeře', 'Opponent preparation')}</summary><form id="prep-opponent-form"><label>${t('Uživatelské jméno', 'Username')}<input id="prep-opponent-name" required pattern="[A-Za-z0-9_-]{2,40}" maxlength="40" autocomplete="off"></label><div class="preparation-controls">${select(
        'prep-opponent-platform',
        t('Odkud', 'Platform'),
        [
          ['chesscom', 'Chess.com'],
          ['lichess', 'Lichess'],
        ],
      )}${select('prep-opponent-side', t('Soupeř hraje', 'Opponent plays'), [
        ['all', t('Obě barvy', 'Both sides')],
        ['w', t('Bílými', 'White')],
        ['b', t('Černými', 'Black')],
      ])}${select('prep-opponent-speed', t('Tempo', 'Time control'), speeds())}</div><button id="prep-opponent-load" class="quiet-button">${t('Načíst posledních 100 partií', 'Load latest 100 games')}</button></form><p id="prep-opponent-status" role="status"></p><div id="prep-opponent-results"></div></details>
      <details><summary>${t('PGN a repertoár', 'PGN and repertoire')}</summary><p id="prep-pgn-status" role="status"></p><div id="prep-pgn-tree"></div><label>${t('Poznámka k vybrané variantě', 'Note on the selected line')}<textarea id="prep-node-note" rows="3" maxlength="1200"></textarea></label>${button('prep-note-save', t('Uložit poznámku', 'Save note'))}<div class="preparation-controls">${select(
        'prep-repertoire-side',
        t('Procvičovat', 'Practise'),
        [
          ['w', t('Bílými', 'White')],
          ['b', t('Černými', 'Black')],
        ],
      )}${select('prep-repertoire-plies', t('Délka varianty', 'Line length'), [
        ['40', t('20 tahů', '20 moves')],
        ['80', t('40 tahů', '40 moves')],
        ['20', t('10 tahů', '10 moves')],
      ])}</div>${button('prep-repertoire-add', t('Přidat všechny varianty do repertoáru', 'Add all lines to repertoire'))}<p class="hint">${t('Zvolená délka omezuje procvičování; původní PGN zůstane celé. Limit repertoáru: 128 variant.', 'The selected length limits practice; the original PGN stays complete. Repertoire limit: 128 lines.')}</p></details>`;
    $('#prep-book-source').onchange = () => {
      const source = $('#prep-book-source').value;
      $('#prep-book-rating').disabled = source !== 'lichess';
      $('#prep-book-speed').disabled = source === 'masters';
      bookJob?.abort();
      $('#prep-book-results').replaceChildren();
      status('#prep-book-status', connectionMessage);
    };
    $('#prep-book-source').onchange();
    $('#prep-book-load').onclick = loadBook;
    $('#prep-table-load').onclick = loadTablebase;
    $('#prep-opponent-form').onsubmit = loadOpponent;
    $('#prep-opponent-side').onchange = $('#prep-opponent-speed').onchange = renderOpponent;
    $('#prep-lichess').onclick = async () => {
      try {
        if (token) {
          const old = token;
          token = null;
          connectionMessage = '';
          cache.clear();
          bookJob?.abort();
          mount();
          update(true);
          fetch('https://lichess.org/api/token', {
            method: 'DELETE',
            credentials: 'omit',
            headers: { Authorization: `Bearer ${old}` },
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(10_000),
          }).catch(() => {});
        } else {
          busy();
          await connectExplorer(owner());
        }
      } catch (e) {
        status('#prep-book-status', message(e));
      }
    };
    $('#prep-repertoire-add').onclick = () => {
      try {
        busy();
        const n = context.importRepertoire(game.pgn, {
          side: $('#prep-repertoire-side').value,
          plies: Number($('#prep-repertoire-plies').value),
          title: game.headers.Opening || game.headers.Event || 'PGN',
        });
        status(
          '#prep-pgn-status',
          `${n} ${t('nových variant uloženo. Najdeš je v Cvičebna → Moje studium.', 'new lines saved. Find them in Workshop → My study.')}`,
        );
      } catch (e) {
        status('#prep-pgn-status', message(e));
      }
    };
    $('#prep-note-save').disabled = true;
    $('#prep-note-save').onclick = async () => {
      const selected = game,
        who = owner();
      try {
        busy();
        const id = Number($('#prep-note-save').dataset.node);
        if (!tree?.nodes[id] || !selected) return;
        const original = selected.pgn,
          oldLearning = selected.learning,
          next = structuredClone(tree);
        const text = $('#prep-node-note').value.replace(/[{}]/g, '').trim();
        next.nodes[id].comments = text ? [text] : [];
        selected.pgn = exportPgnTree(next);
        for (let cursor = next.nodes[0]; cursor; cursor = next.nodes[cursor.children[0]]) {
          if (cursor.id !== id) continue;
          const notes = { ...oldLearning?.notes };
          notes[cursor.ply] = { ...notes[cursor.ply], text };
          selected.learning = { ...oldLearning, notes };
          break;
        }
        const saved = await context.save(selected);
        if (who !== owner()) return;
        if (saved?.status === 'error') {
          selected.pgn = original;
          selected.learning = oldLearning;
          throw saved.error;
        }
        update(true);
        status('#prep-pgn-status', t('Poznámka uložena v PGN.', 'Note saved in PGN.'));
      } catch (e) {
        if (who === owner()) status('#prep-pgn-status', message(e));
      }
    };
    if (connectionMessage) status('#prep-book-status', connectionMessage);
  }
  function update(force = false) {
    if (locale !== language()) {
      bookJob?.abort();
      tableJob?.abort();
      opponentJob?.abort();
      mount();
      force = true;
    }
    const nextFen = context.fen(),
      next = context.selected();
    if (force || nextFen !== fen) {
      fen = nextFen;
      bookJob?.abort();
      tableJob?.abort();
      $('#prep-book-results').replaceChildren();
      $('#prep-table-results').replaceChildren();
      $('#prep-book-load').disabled = false;
      $('#prep-table-load').disabled = !tablebasePosition(fen);
      status(
        '#prep-table-status',
        tablebasePosition(fen)
          ? ''
          : t(
              'Potřebuješ pozici s nejvýše 7 kameny bez práva rošády.',
              'Choose a position with at most 7 pieces and no castling rights.',
            ),
      );
      status('#prep-book-status', connectionMessage);
    }
    if (force || next !== game || next?.pgn !== pgn) {
      game = next;
      pgn = next?.pgn;
      $('#prep-note-save').disabled = true;
      try {
        renderTree();
      } catch (e) {
        tree = null;
        status('#prep-pgn-status', message(e));
      }
    }
  }
  document.addEventListener('evala:identity', () => {
    if (identity === owner()) return;
    identity = owner();
    token = null;
    cache.clear();
    bookJob?.abort();
    tableJob?.abort();
    opponentJob?.abort();
    opponentGames = [];
    opponentName = '';
    connectionMessage = '';
    mount();
    update(true);
  });
  document.addEventListener('evala:language', () => update(true));
  window.addEventListener('pagehide', () => {
    bookJob?.abort();
    tableJob?.abort();
    opponentJob?.abort();
  });
  mount();
  update(true);
  const who = owner();
  resumeExplorer(who)
    .then((value) => {
      if (!value || who !== owner()) return;
      token = value;
      connectionMessage = t(
        'Lichess připojen pro tuto stránku.',
        'Lichess connected for this page.',
      );
      mount();
      update(true);
      $('#prep-book-source').value = 'lichess';
      $('#prep-book-source').onchange();
      context.tab('preparation');
    })
    .catch((e) => {
      if (who === owner()) {
        connectionMessage = message(e);
        status('#prep-book-status', connectionMessage);
        context.tab('preparation');
      }
    });
  return { update };
}
