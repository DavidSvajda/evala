import { Chess } from 'chess.js';
import { StudyBoard } from './board.js';
import { language } from './i18n.js';
import { account } from './account.js';
import { playMoveSound } from './audio.js';

const t = (cs, en) => (language() === 'en' ? en : cs);
export function createHumanPlay(context) {
  let root,
    board,
    game,
    config,
    promotion,
    controller,
    busy = false,
    available = false,
    generation = 0;
  const storageKey = () => 'evala-human-game:' + (account.user?.id || 'guest');
  const $ = (s) => root.querySelector(s);
  function persist() {
    if (!game || !config) return;
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ pgn: game.pgn(), config }));
    } catch {
      /* PGN download remains available. */
    }
  }
  function cancel() {
    generation++;
    controller?.abort();
    controller = null;
    busy = false;
  }
  function status(text) {
    if (root?.isConnected) $('#human-status').textContent = text;
  }
  function paint() {
    if (!root?.isConnected || !game) return;
    const over =
      game.isGameOver() || config.resigned || game.history().length + config.prefix.length >= 600;
    board.interactive = !busy && !over && game.turn() === config.color;
    const last = game.history({ verbose: true }).at(-1);
    board.set(game.fen(), { flipped: config.color === 'b', lastMove: last });
    $('#human-moves').textContent = game
      .history()
      .map((m, i) => `${i % 2 ? '' : Math.floor(i / 2) + 1 + '. '}${m}`)
      .join(' ');
    $('#human-retry').hidden = busy || over || game.turn() === config.color;
    $('#human-stop').hidden = !busy;
    $('#human-save').disabled = !game.history().length || busy;
    $('#human-export').disabled = !game.history().length;
    $('#human-resign').disabled = over || busy;
    $('#human-name').textContent =
      `Maia-3 · ${config.elo} · ${config.style === 'natural' ? t('přirozený styl', 'natural style') : t('útočný hybrid', 'attacking hybrid')}`;
    if (over) {
      if (!config.resigned)
        game.setHeader(
          'Result',
          game.isCheckmate()
            ? game.turn() === 'w'
              ? '0-1'
              : '1-0'
            : game.isDraw()
              ? '1/2-1/2'
              : '*',
        );
      persist();
      status(
        game.isCheckmate()
          ? t(
              'Mat. Ulož partii a projdi ji s trenérem.',
              'Checkmate. Save the game and review it with the coach.',
            )
          : config.resigned
            ? t('Partie ukončena vzdáním.', 'Game ended by resignation.')
            : t(
                'Partie skončila. Můžeš ji otevřít v rozboru.',
                'Game ended. You can open it in Review.',
              ),
      );
    }
  }
  async function reply() {
    if (!game || busy || game.isGameOver() || config.resigned || game.turn() === config.color)
      return;
    if (context.busy()) {
      status(t('Nejprve pozastav rozbor partie.', 'Pause game analysis first.'));
      return;
    }
    controller = new AbortController();
    const signal = controller.signal,
      ticket = generation;
    busy = true;
    paint();
    status(
      t(
        'Maia přemýšlí… První tah může trvat déle.',
        'Maia is thinking… The first move may take longer.',
      ),
    );
    try {
      await fetch('/api/session', { signal, credentials: 'same-origin' });
      const response = await fetch('/api/opponent/move', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
        body: JSON.stringify({
          initialFen: config.initialFen,
          moves: [
            ...config.prefix,
            ...game.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || '')),
          ],
          elo: config.elo,
          style: config.style,
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? t(
                'Server je vytížený nebo je vyčerpaný limit. Zkus Pokračovat později.',
                'The server is busy or its allowance is exhausted. Try Continue later.',
              )
            : t('Soupeř není dostupný. Zkus Pokračovat.', 'Opponent unavailable. Try Continue.'),
        );
      const result = await response.json();
      if (signal.aborted || ticket !== generation) return;
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(result.move))
        throw new Error(t('Neplatná odpověď soupeře.', 'Invalid opponent response.'));
      game.move({
        from: result.move.slice(0, 2),
        to: result.move.slice(2, 4),
        promotion: result.move[4],
      });
      playMoveSound();
      persist();
      status(
        result.sacrifice
          ? t(
              'Tvůj tah. Soupeř nabídl materiál v propočítané variantě.',
              'Your turn. The opponent offered material in a searched line.',
            )
          : t('Tvůj tah.', 'Your turn.'),
      );
    } catch (e) {
      if (ticket === generation && !signal.aborted) status(e.message);
    } finally {
      if (ticket === generation) {
        busy = false;
        paint();
      }
    }
  }
  function move(from, to, piece) {
    if (!board.interactive) return;
    try {
      game.move({ from, to, promotion: piece });
    } catch {
      return;
    }
    playMoveSound();
    persist();
    paint();
    void reply();
  }
  function restore() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw || raw.length > 100000) return;
      const data = JSON.parse(raw),
        c = data.config;
      if (
        !c ||
        !['w', 'b'].includes(c.color) ||
        !['natural', 'attacking'].includes(c.style) ||
        !Number.isInteger(c.elo) ||
        c.elo < 800 ||
        c.elo > 2400 ||
        !Array.isArray(c.prefix) ||
        c.prefix.length > 600
      )
        return;
      const restored = new Chess();
      restored.loadPgn(data.pgn);
      config = c;
      game = restored;
    } catch {
      /* A corrupt local draft does not prevent a new game. */
    }
  }
  function newGame() {
    if (
      game?.history().length &&
      !game.isGameOver() &&
      !config.resigned &&
      !window.confirm(
        t(
          'Začít novou partii? Rozehranou partii můžeš nejprve stáhnout jako PGN.',
          'Start a new game? You can download the current game as PGN first.',
        ),
      )
    )
      return;
    cancel();
    const selected = context.selected(),
      ply = context.ply(),
      fromPosition = $('#human-start-position').value === 'selected' && selected;
    const fen = fromPosition ? selected.fens[ply] : new Chess().fen();
    game = new Chess(fen);
    config = {
      color: $('#human-color').value,
      elo: Number($('#human-elo').value),
      style: $('#human-style').value,
      initialFen: fromPosition ? selected.initialFen : fen,
      prefix: fromPosition ? selected.moves.slice(0, ply).map((m) => m.uci) : [],
      resigned: false,
    };
    for (const [key, value] of Object.entries({
      Event: 'Evala practice',
      Date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
      White: config.color === 'w' ? context.username() || 'Player' : `Maia-3 ${config.elo}`,
      Black: config.color === 'b' ? context.username() || 'Player' : `Maia-3 ${config.elo}`,
      Result: '*',
    }))
      game.setHeader(key, value);
    persist();
    paint();
    $('#human-setup').open = false;
    status(t('Tvůj tah.', 'Your turn.'));
    void reply();
  }
  function mount(element) {
    cancel();
    root = element;
    root.dataset.i18nIgnore = '';
    root.innerHTML = `<div class="practice-controls"><label>${t('Rating modelu', 'Model rating')}<select id="human-elo">${[800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400].map((v) => `<option value="${v}" ${v === 1400 ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label>${t('Styl', 'Style')}<select id="human-style"><option value="natural">${t('Přirozený', 'Natural')}</option><option value="attacking">${t('Útočný', 'Attacking')}</option></select></label><label>${t('Moje barva', 'My side')}<select id="human-color"><option value="w">${t('Bílý', 'White')}</option><option value="b">${t('Černý', 'Black')}</option></select></label><label>${t('Začít', 'Start')}<select id="human-start-position"><option value="start">${t('Základní pozice', 'Starting position')}</option><option value="selected" ${!context.selected() ? 'disabled' : ''}>${t('Aktuální pozice z rozboru', 'Current review position')}</option></select></label><button id="human-new" class="primary-button" disabled>${t('Nová partie', 'New game')}</button></div><p class="hint">${t('Maia-3 napodobuje lidské tahy podle ratingu. Číslo je vstup modelu, ne ověřené Elo soupeře. Útočný styl kombinuje kandidáty Maii s kontrolou Stockfishe; oběť není možná v každé pozici.', 'Maia-3 models human moves conditioned on rating. This is a model input, not a verified opponent Elo. Attacking style combines Maia candidates with Stockfish checks; a sacrifice is not available in every position.')}</p><p id="human-status" role="status"></p><div class="practice-layout"><div><div id="human-board" tabindex="0"></div><div class="setup-actions"><button id="human-retry" class="quiet-button" hidden>${t('Pokračovat', 'Continue')}</button><button id="human-stop" class="quiet-button" hidden>${t('Pozastavit', 'Pause')}</button><button id="human-resign" class="text-button" disabled>${t('Vzdát partii', 'Resign')}</button></div></div><aside><h2 id="human-name">Maia-3 5M</h2><p id="human-moves" class="human-moves"></p><div class="setup-actions"><button id="human-save" class="primary-button" disabled>${t('Uložit a otevřít rozbor', 'Save and open Review')}</button><button id="human-export" class="quiet-button" disabled>PGN</button></div><p class="hint">${t('Rozbor a trenér pak používají Stockfish. Rozehraná partie se průběžně ukládá v tomto prohlížeči.', 'Review and coaching then use Stockfish. Your current game is saved in this browser.')}</p><p><a href="/human-source/maia3-source.tar.gz">Maia-3 source · AGPL-3.0</a> · <a href="/human-source/maia-runtime.py">Evala adapter source</a></p></aside></div><dialog id="human-promotion" class="promotion" aria-label="${t('Proměnit pěšce na:', 'Promote pawn to:')}">${[
      ['q', 'Dáma', 'Queen'],
      ['r', 'Věž', 'Rook'],
      ['b', 'Střelec', 'Bishop'],
      ['n', 'Jezdec', 'Knight'],
    ]
      .map(([v, cs, en]) => `<button data-human-piece="${v}">${t(cs, en)}</button>`)
      .join('')}<button data-human-cancel>${t('Zrušit', 'Cancel')}</button></dialog>`;
    const setup = document.createElement('details');
    setup.id = 'human-setup';
    setup.open = true;
    const setupTitle = document.createElement('summary');
    setupTitle.textContent = t('Nová partie a nastavení', 'New game and settings');
    setup.append(setupTitle);
    const controls = $('.practice-controls'),
      explanation = controls.nextElementSibling;
    setup.append(controls, explanation);
    root.prepend(setup);
    $('#human-status').before($('#human-name'));
    board = new StudyBoard($('#human-board'), {
      onMove: (m) => {
        if (m.promotions.length) {
          promotion = m;
          $('#human-promotion').showModal();
        } else move(m.from, m.to);
      },
    });
    $('#human-promotion').onclick = (e) => {
      const piece = e.target.closest('[data-human-piece]')?.dataset.humanPiece;
      const pending = promotion;
      if (piece && pending) {
        $('#human-promotion').close();
        move(pending.from, pending.to, piece);
      } else if (e.target.closest('[data-human-cancel]')) $('#human-promotion').close();
    };
    $('#human-promotion').onclose = () => {
      promotion = null;
    };
    $('#human-new').onclick = newGame;
    $('#human-retry').onclick = () => void reply();
    $('#human-stop').onclick = () => {
      cancel();
      paint();
      status(t('Výpočet pozastaven. Zvol Pokračovat.', 'Paused. Choose Continue.'));
    };
    $('#human-resign').onclick = () => {
      config.resigned = true;
      game.setHeader('Result', config.color === 'w' ? '0-1' : '1-0');
      persist();
      paint();
    };
    $('#human-save').onclick = async () => {
      if (!game) return;
      cancel();
      try {
        await context.importGame(game.pgn());
      } catch (e) {
        status(e.message);
      }
    };
    $('#human-export').onclick = () => {
      const url = URL.createObjectURL(new Blob([game.pgn()], { type: 'application/x-chess-pgn' })),
        a = document.createElement('a');
      a.href = url;
      a.download = 'evala-maia.pgn';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (!game) restore();
    if (game) {
      $('#human-elo').value = String(config.elo);
      $('#human-style').value = config.style;
      $('#human-color').value = config.color;
      paint();
      setup.open = false;
    } else {
      board.set(new Chess().fen());
      board.interactive = false;
    }
    const ticket = generation;
    void fetch('/api/opponent/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (ticket !== generation || !root.isConnected) return;
        available = !!data?.available;
        $('#human-new').disabled = !available;
        if (!available)
          status(
            t(
              'Maia vyžaduje server s nainstalovaným modelem. Otevři hostovanou Evalu nebo nakonfiguruj vlastní server.',
              'Maia needs a server with the model installed. Open hosted Evala or configure your own server.',
            ),
          );
        else if (!game)
          status(
            t('Vyber nastavení a spusť novou partii.', 'Choose settings and start a new game.'),
          );
      })
      .catch(() => status(t('Server Maii není dostupný.', 'Maia server unavailable.')));
  }
  document.addEventListener('evala:identity', () => {
    cancel();
    game = null;
    config = null;
  });
  window.addEventListener('pagehide', cancel);
  return { mount, cancel };
}
