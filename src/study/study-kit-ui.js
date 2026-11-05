import { Chess } from 'chess.js';
import { StudyBoard } from './board.js';
import { account, queueAccountPreferences } from './account.js';
import { language } from './i18n.js';
import { escapeHtml as esc } from '../ui/dom.js';
import {
  cleanStudyKit,
  repertoireLine,
  repertoireCards,
  recordRecall,
  encodeTask,
  decodeTask,
  ENDGAME_LESSONS,
} from '../training/study-kit.js';
import { weaknessEvidence } from '../training/practice.js';
import { trainedThemeRecurrence } from '../training/study-progress.js';
import { localDay } from '../training/journey.js';
import { STUDY_KIT_BYTES } from '../training/study-kit-sync.js';

const t = (cs, en) => (language() === 'en' ? en : cs);
const identity = () => `${account.user?.id || 'guest'}:${account.user?.generation || ''}`;
const storageKey = () => 'evala-study-kit:' + (account.user?.id || 'guest');
const moveObject = (s) => ({ from: s.slice(0, 2), to: s.slice(2, 4), promotion: s[4] });
const button = (action, label, extra = '') =>
  `<button type="button" class="quiet-button" data-kit="${action}" ${extra}>${esc(label)}</button>`;

export function createStudyKit(context) {
  let root, session, controller;
  let cachedOwner, cachedSource, cachedData;
  function cancel() {
    controller?.abort();
    session = null;
  }
  function read() {
    try {
      const source =
        account.user?.preferences?.studyKit || localStorage.getItem(storageKey()) || '{}';
      if (cachedOwner !== identity() || cachedSource !== source) {
        cachedData = cleanStudyKit(typeof source === 'string' ? JSON.parse(source) : source);
        cachedSource = source;
        cachedOwner = identity();
      }
      return structuredClone(cachedData);
    } catch {
      return cleanStudyKit();
    }
  }
  function save(next) {
    const data = cleanStudyKit(next),
      json = JSON.stringify(data);
    if (new TextEncoder().encode(json).length > STUDY_KIT_BYTES)
      throw Error(
        t(
          'Studijní prostor je plný. Nejdřív exportuj a odeber starší variantu nebo úkol.',
          'Study storage is full. Export and remove an older line or exercise first.',
        ),
      );
    localStorage.setItem(storageKey(), json);
    queueAccountPreferences({ studyKit: data });
    cachedOwner = identity();
    cachedSource = account.user?.preferences?.studyKit || json;
    cachedData = data;
    return data;
  }
  function message(value) {
    const el = root?.querySelector('[data-kit-status]');
    if (el) el.textContent = value;
  }
  function recordDay() {
    const data = read();
    save({ ...data, days: [...data.days, localDay()] });
  }
  function safely(fn) {
    Promise.resolve()
      .then(fn)
      .catch((e) =>
        message(
          e.name === 'AbortError' ? t('Výpočet zastaven.', 'Calculation stopped.') : e.message,
        ),
      );
  }
  function download(pgn) {
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'evala-repertoire.pgn';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function share(task) {
    const url = new URL(location.pathname, location.origin);
    url.hash = '/practice?exercise=' + encodeTask(task);
    try {
      await navigator.clipboard.writeText(url.href);
      message(
        t(
          'Odkaz zkopírován. Obsahuje pouze toto zadání a odpověď.',
          'Link copied. It contains only this exercise and its answer.',
        ),
      );
    } catch {
      const field = document.createElement('textarea');
      field.value = url.href;
      field.readOnly = true;
      root.querySelector('[data-kit-status]').append(field);
      field.select();
    }
  }
  function mount(element) {
    cancel();
    root = element;
    root.dataset.i18nIgnore = '';
    const data = read(),
      due = repertoireCards(data, Date.now(), data.reviews),
      en = language() === 'en';
    root.innerHTML = `<div class="kit-heading"><div><h2>${t('Moje studium', 'My study')}</h2><p>${t('Vlastní varianty, základy koncovek a úkoly. Varianty a odpovědi potvrď tlačítkem Uložit; výsledky procvičování se ukládají automaticky.', 'Your lines, endgame foundations and exercises. Save lines and answers with the Save button; practice results save automatically.')}</p></div>${button('recall', t(`Procvičit repertoár · ${due.length}`, `Practise repertoire · ${due.length}`), due.length ? '' : 'disabled')}</div><p data-kit-status role="status" aria-live="polite"></p><div class="kit-session" hidden></div><div class="kit-library"><section><h3>${t('Můj repertoár', 'My repertoire')}</h3><p class="hint">${t('Jedna hlavní varianta na položku. Stejné pozice sdílejí opakování a přijímají všechny uložené alternativy.', 'One main line per entry. Transposed positions share reviews and accept every saved alternative.')}</p><div class="kit-list">${data.lines.map((l) => `<article><div><strong>${esc(l.title)}</strong><p>${l.side === 'w' ? t('Bílými', 'White') : t('Černými', 'Black')} · ${esc(l.note)}</p></div><div class="setup-actions">${button('edit', t('Upravit', 'Edit'), `data-id="${l.id}"`)}${button('export', 'PGN', `data-id="${l.id}"`)}${button('remove-line', t('Odebrat', 'Remove'), `data-id="${l.id}"`)}</div></article>`).join('') || `<p>${t('Ulož si variantu z vlastního rozboru nebo vlož PGN.', 'Save a line from your analysis or paste a PGN.')}</p>`}</div><details class="kit-editor"><summary>${t('Přidat nebo upravit variantu', 'Add or edit a line')}</summary><form id="kit-line-form"><input name="id" type="hidden"><label>${t('Název', 'Title')}<input name="title" required maxlength="80"></label><label>${t('Barva', 'Side')}<select name="side"><option value="w">${t('Bílý', 'White')}</option><option value="b">${t('Černý', 'Black')}</option></select></label><label>PGN<textarea name="pgn" required maxlength="12000" rows="4"></textarea></label><label>${t('Plán a poznámka', 'Plan and note')}<textarea name="note" maxlength="800" rows="2"></textarea></label><div class="setup-actions"><button class="primary-button">${t('Uložit variantu', 'Save line')}</button>${button('from-game', t('Vzít aktuální partii', 'Use current game'))}</div></form></details></section><section><h3>${t('Základy koncovek', 'Endgame foundations')}</h3><p class="hint">${t('Přečti myšlenku, zkus ji proti lokálnímu enginu. Krátký trénink není certifikace zvládnutí koncovky.', 'Read the idea, then try it against the local engine. A short exercise does not certify mastery.')}</p><div class="kit-lessons">${ENDGAME_LESSONS.map((l) => button('endgame', l.title[Number(en)], `data-id="${l.id}"`)).join('')}</div></section><section><h3>${t('Úkoly s trenérem', 'Coach exercises')}</h3><p class="hint">${t('Sdílej konkrétní pozici s otázkou. Příjemce může vrátit odkaz se svou odpovědí; odkaz neověřuje totožnost autora.', 'Share a position and a question. The recipient can return a link with an answer; links do not verify author identity.')}</p><div class="kit-list">${data.tasks.map((a) => `<article><div><strong>${esc(a.title)}</strong><p>${a.done ? t('Vypracováno hráčem', 'Marked complete by player') : t('K vypracování', 'To do')}</p></div>${button('task', t('Otevřít', 'Open'), `data-id="${a.id}"`)}${button('share', t('Sdílet', 'Share'), `data-id="${a.id}"`)}${button('remove-task', t('Odebrat', 'Remove'), `data-id="${a.id}"`)}</article>`).join('')}</div><details class="kit-editor"><summary>${t('Vytvořit úkol z aktuální pozice', 'Create an exercise from the current position')}</summary><form id="kit-task-form"><label>${t('Název', 'Title')}<input name="title" required maxlength="80"></label><label>FEN<input name="fen" required maxlength="120" value="${esc(context.selected()?.fens?.[context.ply()] || '')}"></label><label>${t('Otázka nebo plán k promyšlení', 'Question or plan to consider')}<textarea name="prompt" required maxlength="1200" rows="3"></textarea></label><button class="primary-button">${t('Uložit úkol', 'Save exercise')}</button></form></details></section><section id="kit-progress"></section></div>`;
    root.querySelector('#kit-line-form').onsubmit = (e) => {
      e.preventDefault();
      safely(() => {
        const f = new FormData(e.target),
          parsed = repertoireLine(f.get('pgn'), f.get('side')),
          id = f.get('id') || crypto.randomUUID();
        const old = read(),
          row = {
            id,
            title: f.get('title'),
            pgn: parsed.pgn,
            side: parsed.side,
            note: f.get('note'),
          };
        if (!old.lines.some((l) => l.id === id) && old.lines.length >= 24)
          throw Error(t('Limit je 24 variant.', 'The limit is 24 lines.'));
        save({ ...old, lines: [...old.lines.filter((l) => l.id !== id), row] });
        mount(root);
        message(t('Varianta uložena.', 'Line saved.'));
      });
    };
    root.querySelector('#kit-task-form').onsubmit = (e) => {
      e.preventDefault();
      safely(() => {
        const f = new FormData(e.target),
          selected = context.selected(),
          ply = context.ply();
        const task = cleanStudyKit({
          tasks: [
            {
              id: crypto.randomUUID(),
              title: f.get('title'),
              fen: f.get('fen'),
              prompt: f.get('prompt'),
              solution:
                selected?.fens?.[ply] === f.get('fen')
                  ? selected.analysis?.positions?.[ply]?.lines?.[0]?.pv?.slice(0, 8) || []
                  : [],
            },
          ],
        }).tasks[0];
        if (!task)
          throw Error(
            t(
              'Pozice není platná nebo už skončila.',
              'The position is invalid or the game has ended.',
            ),
          );
        const old = read();
        if (old.tasks.length >= 40)
          throw Error(t('Limit je 40 úkolů.', 'The limit is 40 exercises.'));
        save({ ...old, tasks: [...old.tasks, task] });
        mount(root);
      });
    };
    root.onclick = (e) => {
      const b = e.target.closest('[data-kit]');
      if (!b) return;
      safely(() => action(b.dataset.kit, b.dataset.id));
    };
    progress();
    incoming();
  }
  function action(name, id) {
    const data = read(),
      line = data.lines.find((l) => l.id === id),
      task = data.tasks.find((l) => l.id === id);
    if (name === 'recall') return recall();
    if (name === 'endgame') return endgame(ENDGAME_LESSONS.find((l) => l.id === id));
    if (name === 'task') return openTask(task);
    if (name === 'share') return share(task);
    if (name === 'export') return download(line.pgn);
    if (name === 'edit' || name === 'from-game') {
      const form = root.querySelector('#kit-line-form');
      form.closest('details').open = true;
      if (line) {
        for (const [k, v] of Object.entries(line))
          if (form.elements.namedItem(k)) form.elements.namedItem(k).value = v;
      }
      if (name === 'from-game') {
        const game = context.selected();
        if (!game) throw Error(t('Nejdřív otevři partii.', 'Open a game first.'));
        form.elements.namedItem('id').value = '';
        const chess = new Chess(game.initialFen);
        for (const move of game.moves.slice(0, Math.min(context.ply() || 20, 80)))
          chess.move(moveObject(move.uci));
        form.elements.namedItem('pgn').value = chess.pgn();
        const username = context.username().trim().toLowerCase();
        if (username && game.headers.Black?.toLowerCase() === username)
          form.elements.namedItem('side').value = 'b';
        else if (username && game.headers.White?.toLowerCase() === username)
          form.elements.namedItem('side').value = 'w';
        form.elements.namedItem('title').value =
          game.headers.Opening || t('Moje varianta', 'My line');
      }
      form.scrollIntoView({
        block: 'nearest',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      return;
    }
    if (name === 'remove-line' || name === 'remove-task') {
      if (!confirm(t('Odebrat tuto položku ze studia?', 'Remove this study item?'))) return;
      save({
        ...data,
        lines: name === 'remove-line' ? data.lines.filter((l) => l.id !== id) : data.lines,
        tasks: name === 'remove-task' ? data.tasks.filter((l) => l.id !== id) : data.tasks,
      });
      mount(root);
    }
  }
  function stage(title, detail) {
    cancel();
    const box = root.querySelector('.kit-session');
    box.hidden = false;
    box.innerHTML = `<div class="kit-heading"><h3>${esc(title)}</h3>${button('close', t('Zavřít cvičení', 'Close exercise'))}</div><p>${esc(detail)}</p><div class="kit-play"><div><div id="kit-board" tabindex="0"></div><div id="kit-promotion" class="setup-actions" hidden></div></div><aside><p id="kit-feedback" role="status" aria-live="polite"></p><div id="kit-session-actions"></div></aside></div>`;
    box.querySelector('[data-kit=close]').onclick = (e) => {
      e.stopPropagation();
      cancel();
      box.hidden = true;
    };
    box.scrollIntoView({
      block: 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    return box;
  }
  async function promotion(move, chess) {
    if (chess.get(move.from)?.type !== 'p' || !/[18]$/.test(move.to)) return move;
    const box = root.querySelector('#kit-promotion');
    box.hidden = false;
    box.replaceChildren();
    return new Promise((resolve) => {
      for (const [piece, cs, en] of [
        ['q', 'Dáma', 'Queen'],
        ['r', 'Věž', 'Rook'],
        ['b', 'Střelec', 'Bishop'],
        ['n', 'Jezdec', 'Knight'],
      ]) {
        const b = document.createElement('button');
        b.className = 'quiet-button';
        b.textContent = t(cs, en);
        b.onclick = (e) => {
          e.stopPropagation();
          box.hidden = true;
          resolve({ ...move, promotion: piece });
        };
        box.append(b);
      }
      box.firstElementChild.focus();
    });
  }
  function recall() {
    const data = read(),
      cards = repertoireCards(data, Date.now(), data.reviews).slice(0, 12);
    if (!cards.length) return message(t('Dnes není nic k opakování.', 'Nothing is due today.'));
    stage(
      t('Opakování repertoáru', 'Repertoire recall'),
      t(
        'Zahraj uložený tah. Jiný legální tah není automaticky špatný; tady procvičuješ paměť.',
        'Play a saved move. A different legal move is not automatically bad; this exercise checks recall.',
      ),
    );
    const board = new StudyBoard(root.querySelector('#kit-board'), {
      onMove: (m) =>
        safely(async () => {
          const active = session;
          if (!active || active.owner !== identity() || active.done || active.locked) return;
          active.locked = true;
          board.interactive = false;
          const card = active.cards[0],
            chess = new Chess(card.fen),
            selected = await promotion(m, chess);
          if (session !== active || active.cards[0] !== card) return;
          try {
            chess.move(selected);
          } catch {
            active.locked = false;
            board.interactive = true;
            return;
          }
          const correct = card.moves.includes(
            selected.from + selected.to + (selected.promotion || ''),
          );
          const next = read();
          next.reviews[card.id] = recordRecall(next.reviews[card.id], correct);
          try {
            save(next);
          } catch (error) {
            active.locked = false;
            board.interactive = true;
            throw error;
          }
          active.attempted = true;
          root.querySelector('#kit-feedback').textContent = correct
            ? t(
                'Správně. Tato pozice se vrátí později.',
                'Recalled. This position will return later.',
              )
            : t(
                'Tento tah není v uložených variantách. Zkus jiný, nebo si řešení zobraz.',
                'This move is not in your saved lines. Try another or reveal the answer.',
              );
          if (correct) {
            active.done = true;
            board.set(chess.fen(), { lastMove: selected });
          }
          active.locked = false;
          board.interactive = !correct;
        }),
    });
    session = { owner: identity(), cards, board, done: false, total: cards.length };
    board.element.setAttribute('aria-label', t('Studijní šachovnice', 'Study board'));
    drawRecall();
  }
  function drawRecall() {
    const s = session;
    if (!s?.cards.length) {
      root.querySelector('#kit-feedback').textContent = t(
        'Dnešní opakování je hotové.',
        'Today’s recall is complete.',
      );
      return;
    }
    s.done = false;
    s.locked = false;
    s.board.interactive = true;
    const c = s.cards[0];
    s.board.set(c.fen, { flipped: new Chess(c.fen).turn() === 'b' });
    root.querySelector('#kit-feedback').textContent =
      `${s.total - s.cards.length + 1}/${s.total} · ${c.titles.join(' · ')}`;
    const actions = root.querySelector('#kit-session-actions');
    actions.replaceChildren();
    const reveal = document.createElement('button');
    reveal.className = 'quiet-button';
    reveal.textContent = t('Ukázat uložené tahy', 'Show saved moves');
    reveal.onclick = () => {
      const chess = new Chess(c.fen);
      root.querySelector('#kit-feedback').textContent = c.moves
        .map((m) => {
          const move = chess.move(moveObject(m));
          chess.undo();
          return move.san;
        })
        .join(' / ');
    };
    const next = document.createElement('button');
    next.className = 'primary-button';
    next.textContent = t('Další pozice', 'Next position');
    next.onclick = () => {
      if (session !== s) return;
      if (!s.done) {
        const data = read();
        data.reviews[c.id] = recordRecall(data.reviews[c.id], false);
        save(data);
      }
      s.cards.shift();
      if (!s.cards.length) {
        if (s.attempted) recordDay();
        mount(root);
        message(
          t(
            'Opakování dokončeno. Vynechané pozice se vrátí dříve.',
            'Recall complete. Skipped positions return sooner.',
          ),
        );
      } else drawRecall();
    };
    actions.append(reveal, next);
  }
  function endgame(lesson) {
    if (!lesson) return;
    stage(lesson.title[Number(language() === 'en')], lesson.idea[Number(language() === 'en')]);
    session = { owner: identity(), chess: new Chess(lesson.fen), steps: 0, busy: false };
    const active = session;
    active.board = new StudyBoard(root.querySelector('#kit-board'), {
      onMove: (m) =>
        safely(async () => {
          if (
            session !== active ||
            active.busy ||
            active.owner !== identity() ||
            active.chess.isGameOver()
          )
            return;
          active.busy = true;
          active.board.interactive = false;
          const move = await promotion(m, active.chess);
          if (session !== active) return;
          try {
            active.chess.move(move);
          } catch {
            active.busy = false;
            active.board.interactive = true;
            return;
          }
          active.steps++;
          active.board.set(active.chess.fen(), { lastMove: move });
          if (active.chess.isGameOver()) {
            active.busy = false;
            return finishEndgame(active);
          }
          controller = new AbortController();
          root.querySelector('#kit-feedback').textContent = t(
            'Engine přemýšlí…',
            'Engine is thinking…',
          );
          try {
            const result = await context.search(active.chess.fen(), controller.signal);
            if (session !== active || active.owner !== identity()) return;
            const reply = result.lines?.[0]?.pv?.[0];
            if (!reply)
              throw Error(
                t(
                  'Odpověď enginu není k dispozici. Zkus cvičení znovu.',
                  'No engine reply is available. Restart the exercise.',
                ),
              );
            active.chess.move(moveObject(reply));
            active.board.set(active.chess.fen(), { lastMove: moveObject(reply) });
            finishEndgame(active);
          } finally {
            if (session === active) {
              active.busy = false;
              active.board.interactive = !active.chess.isGameOver() && active.steps < 12;
            }
          }
        }),
    });
    active.board.set(lesson.fen);
    active.board.element.setAttribute('aria-label', t('Studijní šachovnice', 'Study board'));
    root.querySelector('#kit-feedback').textContent = t(
      'Bílý na tahu. Procvič až 12 vlastních tahů.',
      'White to move. Practise up to 12 of your moves.',
    );
  }
  function finishEndgame(s) {
    const chess = s.chess;
    if ((s.steps >= 4 || chess.isGameOver()) && s.owner === identity()) recordDay();
    root.querySelector('#kit-feedback').textContent = chess.isCheckmate()
      ? t('Mat.', 'Checkmate.')
      : chess.isDraw()
        ? t('Remíza. Zkus vysvětlit, proč vznikla.', 'Draw. Explain why it occurred.')
        : s.steps >= 12
          ? t(
              'Krátký trénink dokončen. Vrať se k principu a zkus jiný plán.',
              'Short practice complete. Revisit the principle and try another plan.',
            )
          : t(`Tvůj tah · ${s.steps}/12`, `Your move · ${s.steps}/12`);
    s.board.interactive = !chess.isGameOver() && s.steps < 12;
  }
  function openTask(task) {
    if (!task) return;
    stage(task.title, task.prompt);
    const owner = identity(),
      board = new StudyBoard(root.querySelector('#kit-board'), {
        onMove: (m) =>
          safely(async () => {
            const active = session;
            if (!active || active.owner !== identity() || active.locked) return;
            active.locked = true;
            board.interactive = false;
            const move = await promotion(m, active.chess);
            if (session !== active) return;
            try {
              active.chess.move(move);
              board.set(active.chess.fen(), { lastMove: move });
            } catch {
              /* Illegal exploration leaves the position unchanged. */
            }
            active.locked = false;
            board.interactive = !active.chess.isGameOver();
          }),
      });
    session = { owner, chess: new Chess(task.fen) };
    board.set(task.fen, { flipped: new Chess(task.fen).turn() === 'b' });
    board.element.setAttribute('aria-label', t('Studijní šachovnice', 'Study board'));
    const actions = root.querySelector('#kit-session-actions');
    actions.innerHTML = `<label>${t('Můj plán a výpočet', 'My plan and calculation')}<textarea id="kit-answer" maxlength="1200" rows="5">${esc(task.answer)}</textarea></label><div class="setup-actions"><button id="kit-done" class="primary-button">${t('Uložit odpověď', 'Save answer')}</button><button id="kit-return" class="quiet-button">${t('Sdílet odpověď', 'Share answer')}</button><button id="kit-reset" class="quiet-button">${t('Vrátit pozici', 'Reset position')}</button></div><details><summary>${t('Varianta od autora', 'Author’s line')}</summary><p id="kit-solution"></p></details>`;
    const chess = new Chess(task.fen);
    root.querySelector('#kit-solution').textContent =
      task.solution.map((m) => chess.move(moveObject(m)).san).join(' ') ||
      t(
        'Autor nepřiložil variantu. Úkol je otevřený.',
        'No line was supplied. This is an open-ended exercise.',
      );
    const store = () => {
      if (identity() !== owner) return null;
      const data = read(),
        updated = { ...task, answer: root.querySelector('#kit-answer').value, done: true };
      save({ ...data, tasks: data.tasks.map((r) => (r.id === task.id ? updated : r)) });
      recordDay();
      message(
        t(
          'Odpověď uložena. Výsledek je vlastní hodnocení.',
          'Answer saved. Completion is self-reported.',
        ),
      );
      return updated;
    };
    root.querySelector('#kit-done').onclick = () => safely(store);
    root.querySelector('#kit-return').onclick = () =>
      safely(() => {
        const updated = store();
        if (updated) return share(updated);
      });
    root.querySelector('#kit-reset').onclick = () => {
      if (identity() !== owner) return;
      session = { owner, chess: new Chess(task.fen) };
      root.querySelector('#kit-promotion').hidden = true;
      board.interactive = true;
      board.set(task.fen);
    };
  }
  function incoming() {
    const value = new URLSearchParams(location.hash.split('?')[1] || '').get('exercise');
    if (!value) return;
    try {
      const task = decodeTask(value),
        note = document.createElement('section');
      note.className = 'kit-incoming';
      note.innerHTML = `<h3>${t('Přijatý úkol', 'Received exercise')}: ${esc(task.title)}</h3><p>${esc(task.prompt)}</p><button class="primary-button">${t('Uložit do mého studia', 'Save to my study')}</button><p class="hint">${t('Převzetí existujícího ID nahradí pouze tento úkol. Odkaz není ověření autora.', 'Importing an existing ID replaces only that exercise. The link does not verify its author.')}</p>`;
      note.querySelector('button').onclick = () =>
        safely(() => {
          const data = read();
          if (!data.tasks.some((r) => r.id === task.id) && data.tasks.length >= 40)
            throw Error(t('Limit je 40 úkolů.', 'The limit is 40 exercises.'));
          save({ ...data, tasks: [...data.tasks.filter((r) => r.id !== task.id), task] });
          const url = new URL(location.href);
          url.hash = '/practice';
          history.replaceState(null, '', url);
          mount(root);
          openTask(task);
        });
      root.prepend(note);
    } catch {
      message(t('Odkaz na úkol není platný.', 'The exercise link is invalid.'));
    }
  }
  function progress() {
    const rows = weaknessEvidence(context.library(), context.username()),
      data = read(),
      el = root.querySelector('#kit-progress');
    const reviews = Object.values(data.reviews),
      correct = reviews.reduce((n, r) => n + r.correct, 0),
      wrong = reviews.reduce((n, r) => n + r.wrong, 0);
    el.innerHTML = `<h3>${t('Co se daří přenášet do hry?', 'What carries over into your games?')}</h3><p>${t('Repertoár: vybavené tahy / pokusy', 'Repertoire: recalled moves / attempts')}: ${correct}/${correct + wrong} · ${t('vypracované úkoly', 'completed exercises')}: ${data.tasks.filter((a) => a.done).length}/${data.tasks.length}</p><p class="hint">${t('Následuje výskyt chyb podle fáze, nikoli důkaz účinku tréninku. Porovnání používá posledních a předchozích 10 rozebraných partií stejného tempa.', 'Below is error recurrence by phase, not proof of a training effect. Compare the latest and previous 10 analysed games in the same time-control category.')}</p>`;
    for (const row of rows) {
      const p = document.createElement('p');
      p.textContent =
        `${row.speed} · ${row.recentGames}/${row.priorGames} ${t('partií', 'games')}: ` +
        Object.entries(row.recent)
          .map(([phase, r]) => {
            const prev = row.prior[phase],
              name = {
                opening: t('zahájení', 'opening'),
                middlegame: t('střední hra', 'middlegame'),
                endgame: t('koncovka', 'endgame'),
              }[phase];
            return `${name} ${((100 * r.errors) / r.moves).toFixed(1)}/100${prev?.moves >= 30 && r.moves >= 30 && row.priorGames >= 5 && row.recentGames >= 5 ? ' ← ' + ((100 * prev.errors) / prev.moves).toFixed(1) : ''}`;
          })
          .join(' · ');
      el.append(p);
    }
    const today = localDay(),
      start = new Date();
    start.setDate(start.getDate() - 6);
    const activeDays = data.days.filter((d) => d >= localDay(start) && d <= today).length;
    const goal = document.createElement('label');
    goal.className = 'kit-goal';
    goal.textContent = t(
      `Posledních 7 dní: ${activeDays}/${data.weeklyGoal} tréninkových dní. Můj cíl: `,
      `Last 7 days: ${activeDays}/${data.weeklyGoal} practice days. My goal: `,
    );
    const select = document.createElement('select');
    select.setAttribute('aria-label', t('Týdenní cíl', 'Weekly goal'));
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = String(n);
      select.append(o);
    }
    select.value = String(data.weeklyGoal);
    select.onchange = () =>
      safely(() => {
        save({ ...read(), weeklyGoal: Number(select.value) });
        progress();
      });
    goal.append(select);
    el.append(goal);
    const themes = trainedThemeRecurrence(context.library(), context.username());
    if (themes.length) {
      const heading = document.createElement('h4');
      heading.textContent = t(
        'Procvičená témata v pozdějších partiích',
        'Practised themes in later games',
      );
      el.append(heading);
      for (const row of themes) {
        const label = {
          opening: t('zahájení', 'opening'),
          middlegame: t('střední hra', 'middlegame'),
          endgame: t('koncovka', 'endgame'),
        }[row.phase];
        const p = document.createElement('p');
        p.textContent = `${row.speed} · ${label}: ${row.errors} ${t('podobných chyb', 'similar errors')} / ${row.decisions} ${t('vyhodnocených rozhodnutí', 'analysed decisions')} · ${row.games} ${t('pozdějších partií', 'later games')}`;
        for (const example of row.examples) {
          const b = document.createElement('button');
          b.className = 'text-button';
          b.textContent = `${example.game.moves[example.ply - 1].san} →`;
          b.onclick = () => context.openGame(example.game, example.ply);
          p.append(' ', b);
        }
        el.append(p);
      }
    }
  }
  let previousStorage = storageKey();
  document.addEventListener('evala:identity', () => {
    cancel();
    cachedOwner = cachedSource = cachedData = undefined;
    if (previousStorage !== storageKey() && previousStorage !== 'evala-study-kit:guest') {
      try {
        localStorage.removeItem(previousStorage);
      } catch {
        /* A blocked store must not prevent logout. */
      }
    }
    previousStorage = storageKey();
  });
  document.addEventListener('evala:page', (e) => {
    if (e.detail !== 'practice') cancel();
  });
  window.addEventListener('pagehide', cancel);
  return { mount, cancel };
}
