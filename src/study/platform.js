import { playMoveSound, setMoveSoundEnabled } from './audio.js';
import { gameRows } from './views/library.js';
import { miniBoard } from '../ui/chess-preview.js';
import { createAccountPanel } from './account-panel.js';
import { initializeIcons as icons } from '../ui/platform-icons.js';
import { escapeHtml as esc } from '../ui/dom.js';
import { Chess } from 'chess.js';
import { StudyBoard } from './board.js';
import { lineToSan } from './game.js';
import {
  account,
  accountRequest,
  queueAccountPreferences,
  flushAccountPreferences,
} from './account.js';
import {
  THEMES,
  trainingState,
  choosePuzzle,
  startPuzzle,
  playPuzzle,
  recordPuzzle,
  personalPuzzles,
  uciMove,
} from '../training/logic.js';
import { language, setLanguage, translate } from './i18n.js';
import { theme, setTheme } from './theme.js';
import { createLesson, nextLessonId, publicChesscomProfile } from '../training/lesson.js';

const $ = (s) => document.querySelector(s);
const PREFERENCES = {
  boardTheme: 'sage',
  pieceStyle: 'classic',
  coordinates: true,
  legalMoves: true,
  sound: true,
  soundVersion: 1,
  autoNext: false,
  skill: 'club',
  difficulty: 'normal',
  chessUsername: '',
  chessPlatform: 'chesscom',
  sidebarCollapsed: false,
  reviewBudget: 10,
  reviewPausedUntil: 0,
};
const pageNames = {
  home: 'Přehled',
  games: 'Moje partie',
  analysis: 'Rozbor',
  puzzles: 'Trénink',
  insights: 'Statistiky',
  settings: 'Nastavení',
  account: 'Můj účet',
  practice: 'Cvičebna',
};

export async function initPlatform(context) {
  let page = '',
    bank = [],
    loadingBank,
    preferences,
    sessionSolved = 0,
    sessionAttempted = 0,
    toastTimer;
  let current = null,
    busy = false,
    puzzleFlipped = false,
    generation = 0,
    puzzleStarted = 0,
    autoTimer,
    replayTimer,
    mode = 'rated';
  const owner = () => account.user?.id || 'guest';
  const prefKey = () => 'evala-display:' + owner();
  const trainingKey = () => 'evala-training:' + owner();
  let training;
  const { renderAccount, renderIdentity } = createAccountPanel({
    context,
    getTraining: () => training,
    prefKey,
    trainingKey,
    renderHome,
    toast,
  });
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => ($('#toast').hidden = true), 4500);
  }
  function loadState() {
    let local = {},
      localTraining;
    try {
      local = JSON.parse(localStorage.getItem(prefKey()) || '{}');
      localTraining = JSON.parse(localStorage.getItem(trainingKey()) || 'null');
    } catch {
      /* Defaults remain usable. */
    }
    preferences = {
      ...PREFERENCES,
      language: language(),
      theme: theme(),
      chessUsername: context.username() || '',
      ...local,
      ...account.user?.preferences,
    };
    if ((account.user?.preferences?.soundVersion ?? local.soundVersion) !== 1) {
      preferences.sound = true;
      preferences.soundVersion = 1;
      try {
        localStorage.setItem(prefKey(), JSON.stringify(preferences));
      } catch {
        /* Keep the in-memory setting. */
      }
      queueAccountPreferences({ sound: true, soundVersion: 1 });
    }
    training = trainingState(account.training || localTraining);
    applyPreferences();
  }
  function saveTraining(value) {
    training = trainingState(value);
    if (account.user) account.training = training;
    try {
      localStorage.setItem(trainingKey(), JSON.stringify(training));
    } catch {
      toast('Historii se nepodařilo uložit do prohlížeče.');
    }
    renderTraining();
  }
  function applyPreferences() {
    setTheme(preferences.theme);
    setMoveSoundEnabled(preferences.sound);
    document.body.dataset.sidebarCollapsed = String(preferences.sidebarCollapsed);
    $('#toggle-sidebar').setAttribute('aria-expanded', String(!preferences.sidebarCollapsed));
    $('#toggle-sidebar').title = preferences.sidebarCollapsed
      ? 'Zobrazit boční panel'
      : 'Skrýt boční panel';
    $('#toggle-sidebar').setAttribute('aria-label', $('#toggle-sidebar').title);
    $('#language-choice').value = preferences.language;
    $('#toggle-language').textContent = preferences.language === 'en' ? 'CS' : 'EN';
    setLanguage(preferences.language);
    document.body.dataset.boardTheme = preferences.boardTheme;
    document.body.dataset.pieceStyle = preferences.pieceStyle;
    document.body.dataset.coordinates = String(preferences.coordinates);
    document.body.dataset.legalMoves = String(preferences.legalMoves);
    document.body.dataset.skill = preferences.skill;
    document
      .querySelectorAll('[data-board-theme]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.boardTheme === preferences.boardTheme)),
      );
    for (const [id, key] of Object.entries({
      'piece-style': 'pieceStyle',
      'show-coordinates': 'coordinates',
      'show-legal': 'legalMoves',
      'move-sound': 'sound',
      'auto-next': 'autoNext',
      'linked-platform': 'chessPlatform',
      'linked-username': 'chessUsername',
      'experience-level': 'skill',
    })) {
      const el = $('#' + id);
      if (el.type === 'checkbox') el.checked = preferences[key];
      else el.value = preferences[key];
    }
    $('#puzzle-difficulty').value = preferences.difficulty;
    $('#review-budget').value = preferences.reviewBudget;
    $('#review-pause-status').textContent =
      preferences.reviewPausedUntil > Date.now()
        ? new Date(preferences.reviewPausedUntil).toLocaleDateString(
            language() === 'en' ? 'en-GB' : 'cs-CZ',
          )
        : '—';
  }
  function updatePreferences(patch) {
    Object.assign(preferences, patch);
    applyPreferences();
    try {
      localStorage.setItem(prefKey(), JSON.stringify(preferences));
    } catch {
      toast('Nastavení se nepodařilo uložit.');
    }
    queueAccountPreferences(patch);
  }
  const sound = playMoveSound;
  const puzzleBoard = new StudyBoard($('#puzzle-board'), {
    onMove: (move) => {
      if (busy || !current || current.state.complete) return;
      if (move.promotions.length) {
        current.promotion = move;
        $('#puzzle-promotion').hidden = false;
        $('#puzzle-promotion').showModal();
        return;
      }
      submitMove(move.from + move.to);
    },
  });
  async function getBank() {
    if (bank.length) return bank;
    loadingBank ||= fetch('data/puzzles.json', { signal: AbortSignal.timeout(20000) })
      .then((response) => {
        if (!response.ok) throw new Error('Úlohy se nepodařilo načíst.');
        return response.json();
      })
      .then((data) => {
        bank = data.puzzles;
        return bank;
      })
      .catch((e) => {
        loadingBank = null;
        throw e;
      });
    return loadingBank;
  }
  function dueCount() {
    return Object.values(training.history).filter((h) => h.dueAt <= Date.now()).length;
  }
  function ownPuzzles() {
    return personalPuzzles(context.library(), preferences.chessUsername || context.username());
  }
  function renderTraining() {
    $('#home-rating').textContent = $('#puzzle-rating').textContent = training.rating;
    $('#home-solved').textContent = training.solved;
    $('#home-streak').textContent = training.streak;
    const due = dueCount();
    $('#due-count').textContent = due || '';
    $('#nav-review-count').textContent = due || '';
    $('#home-due').textContent = due
      ? `${due} úloh čeká na opakování`
      : 'Zatím nemáš úlohy k opakování';
    $('#session-solved').textContent = sessionSolved;
    $('#session-attempted').textContent = sessionAttempted;
    $('#starting-rating').value = String(training.initialRating || 800);
    $('#starting-rating').disabled = training.attempted > 0;
  }
  function openGame(id) {
    const game = context.library().find((g) => g.id === id);
    if (game) {
      go('analysis');
      context.openGame(game);
    }
  }
  function renderHome() {
    const games = context.library();
    $('#nav-game-count').textContent = games.length || '';
    $('#welcome-title').textContent = account.user
      ? 'Přehled · ' + account.user.name.split(' ')[0]
      : 'Přehled';
    $('#today-date').textContent = new Intl.DateTimeFormat(
      language() === 'en' ? 'en-GB' : 'cs-CZ',
      { weekday: 'long', day: 'numeric', month: 'long' },
    ).format(new Date());
    $('#recent-games').innerHTML = gameRows(games.slice(0, 4), 'Zatím nemáš uložené partie');
    $('#recent-games')
      .querySelectorAll('[data-open-game]')
      .forEach((b) => (b.onclick = () => openGame(b.dataset.openGame)));
    $('#account-invite').hidden = !!account.user;
    $('#home-personal').textContent = ownPuzzles().length
      ? `${ownPuzzles().length} ověřených pozic z tvých rozborů`
      : 'Z rozebraných chyb s jasným lepším tahem';
    renderTraining();
    $('#onboarding').hidden = !!preferences?.onboardingComplete;
    $('#onboarding-rating').disabled = training.attempted > 0;
    $('#lesson-progress').textContent =
      language() === 'en'
        ? `${preferences?.lesson?.done?.length || 0}/6 positions practised. Your mistakes, related tactics and review.`
        : `${preferences?.lesson?.done?.length || 0}/6 procvičených pozic. Vlastní chyby, související taktika a opakování.`;
    renderChessProfile();
  }
  function renderChessProfile() {
    const name = preferences?.chessUsername;
    $('#chesscom-profile').replaceChildren();
    if (!name || preferences.chessPlatform !== 'chesscom') return;
    const link = document.createElement('a');
    link.href = 'https://www.chess.com/member/' + encodeURIComponent(name);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = name;
    const note = document.createElement('small');
    note.textContent =
      language() === 'en'
        ? ' Public data connection; ownership is not verified.'
        : ' Propojení veřejných dat; vlastnictví účtu není ověřené.';
    $('#chesscom-profile').append(link, note);
  }
  async function lessonPuzzle() {
    const day = new Date().toISOString().slice(0, 10);
    const available = new Set([...ownPuzzles(), ...bank].map((p) => p.id));
    if (
      preferences.lesson?.day !== day ||
      !preferences.lesson?.ids?.length ||
      preferences.lesson.ids.some((id) => !available.has(id))
    ) {
      const lesson = createLesson(bank, context.library(), preferences.chessUsername, training, {
        day,
        goal: preferences.trainingGoal,
      });
      updatePreferences({ lesson });
    }
    const id = nextLessonId(preferences.lesson);
    if (!id) return null;
    return [...ownPuzzles(), ...bank].find((p) => p.id === id) || null;
  }
  function go(next) {
    next = pageNames[next] ? next : 'home';
    if (location.hash !== '#/' + next) history.pushState(null, '', '#/' + next);
    const changed = page !== next;
    page = next;
    document.body.dataset.page = next;
    document
      .querySelectorAll('main[data-page]')
      .forEach((el) => (el.hidden = el.dataset.page !== next));
    document.querySelectorAll('[data-route]').forEach((el) => {
      if (el.dataset.route === next) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
      if (el.tagName === 'BUTTON')
        el.setAttribute('aria-pressed', String(el.dataset.route === next));
    });
    $('#page-label').textContent = pageNames[next];
    document.title = translate(pageNames[next]) + ' · Evala';
    document.dispatchEvent(new CustomEvent('evala:page', { detail: next }));
    if (next === 'home') renderHome();
    if (next === 'puzzles' && (!current || changed)) loadPuzzle();
    if (next === 'account') renderAccount();
    if (changed) {
      clearTimeout(autoTimer);
      clearTimeout(replayTimer);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  function paintPuzzle() {
    if (!current) return;
    $('#flip-puzzle').disabled = false;
    const uci = current.state.lastMove;
    puzzleBoard.interactive = !busy && !current.state.complete;
    puzzleBoard.set(current.state.fen, {
      flipped: puzzleFlipped,
      lastMove: uci ? uciMove(uci) : null,
    });
    $('#puzzle-turn').textContent = current.state.color === 'w' ? 'Bílý na tahu' : 'Černý na tahu';
    $('#puzzle-player-dot').classList.toggle('black', current.state.color === 'b');
    $('#puzzle-hint').disabled = $('#puzzle-reveal').disabled = busy || current.state.complete;
    $('#next-puzzle').hidden = !current.state.complete;
  }
  function resetPuzzlePanel() {
    $('#puzzle-status').textContent = 'Najdi nejlepší tah';
    $('#puzzle-message').textContent = 'Spočítej pokračování a zahraj tah na šachovnici.';
    $('.puzzle-feedback').dataset.state = '';
    $('#puzzle-themes').replaceChildren();
    $('#puzzle-solution').replaceChildren();
    $('#puzzle-source').hidden = true;
    $('#next-puzzle').hidden = true;
    $('#puzzle-error').textContent = '';
    $('#rating-change').textContent = '';
    $('#puzzle-promotion').close();
    $('#puzzle-promotion').hidden = true;
    $('#puzzle-time').textContent = '';
    $('#puzzle-number').textContent = '';
    $('#puzzle-level').textContent = '';
    $('#puzzle-turn').textContent = 'Načítám úlohu…';
    $('#puzzle-hint').disabled = $('#puzzle-reveal').disabled = $('#flip-puzzle').disabled = true;
    puzzleBoard.grid.replaceChildren();
    puzzleBoard.arrows.replaceChildren();
  }
  async function loadPuzzle() {
    const request = ++generation;
    clearTimeout(autoTimer);
    clearTimeout(replayTimer);
    busy = true;
    current = null;
    puzzleBoard.interactive = false;
    resetPuzzlePanel();
    $('#puzzle-status').textContent = 'Načítám úlohu…';
    document
      .querySelectorAll('[data-mode]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    try {
      await getBank();
      let puzzle,
        state,
        challengeId,
        server = false;
      const lesson = mode === 'lesson' ? await lessonPuzzle() : null;
      if (mode === 'lesson' && !lesson) {
        $('#puzzle-status').textContent = $('#puzzle-turn').textContent = 'Lekce je hotová';
        $('#puzzle-message').textContent = 'Pokračuj v taktice nebo se vrať zítra k další lekci.';
        return;
      }
      if (mode === 'lesson' && !account.user) {
        puzzle = lesson;
        state = startPuzzle(puzzle);
      } else if (mode === 'personal' && !account.user) {
        const pool = ownPuzzles();
        puzzle = pool.find((p) => !training.recent.includes(p.id)) || pool[0];
        if (puzzle) state = startPuzzle(puzzle);
      } else if (account.user) {
        const data = await accountRequest('puzzle/next', {
          method: 'POST',
          body: {
            mode: lesson?.personal ? 'personal' : mode,
            puzzleId: lesson?.id,
            theme: $('#puzzle-theme').value,
            difficulty: preferences.difficulty,
          },
        });
        if (request !== generation) return;
        saveTraining(data.training);
        if (data.puzzle) {
          puzzle = data.puzzle;
          state = puzzle.state;
          challengeId = puzzle.challengeId;
          server = true;
        }
      } else {
        puzzle = choosePuzzle(bank, training, {
          mode,
          theme: $('#puzzle-theme').value,
          difficulty: preferences.difficulty,
          reviewBudget: preferences.reviewBudget,
          reviewPausedUntil: preferences.reviewPausedUntil,
        });
        if (puzzle) state = startPuzzle(puzzle);
      }
      if (request !== generation) return;
      if (!puzzle) {
        $('#puzzle-status').textContent =
          mode === 'personal' ? 'Zatím nejsou vhodné pozice' : 'Pro dnešek stačí';
        $('#puzzle-message').textContent =
          mode === 'personal'
            ? 'Nastav svou přezdívku v Nastavení a rozeber partie. Přidáváme jen chyby, u kterých engine našel jasně lepší tah.'
            : 'Platí denní limit a případná pauza. Starší úlohy nemažeme; můžeš pokračovat v taktice nebo upravit limit v Nastavení.';
        $('#puzzle-hint').disabled = $('#puzzle-reveal').disabled = true;
        $('#puzzle-turn').textContent = 'Vyber jiný režim';
        return;
      }
      current = { puzzle, state, challengeId, server, owner: owner(), mode, initialFen: state.fen };
      puzzleStarted = Date.now();
      puzzleFlipped = state.color === 'b';
      $('#puzzle-status').textContent = 'Najdi nejlepší tah';
      $('#puzzle-number').textContent = puzzle.personal
        ? 'Z tvé partie · ' + puzzle.opponent
        : 'Úloha ' + puzzle.id;
      $('#puzzle-level').textContent = puzzle.personal
        ? 'Osobní pozice · bez kalibrovaného ratingu'
        : `Elo úlohy: ${new Intl.NumberFormat(language() === 'en' ? 'en-GB' : 'cs-CZ').format(puzzle.rating)} · ${puzzle.rating < 1000 ? 'Základní' : puzzle.rating < 1600 ? 'Střední' : puzzle.rating < 2200 ? 'Pokročilá' : 'Náročná'}`;
      $('#puzzle-subtitle').textContent =
        mode === 'personal'
          ? 'Zkus znovu rozhodující pozici ze své partie.'
          : mode === 'review'
            ? 'Vrať se k úlohám, které ti daly zabrat.'
            : mode === 'daily'
              ? 'Stejná úloha pro všechny hráče dnes.'
              : 'Taktické úlohy podle tvé úrovně.';
    } catch (error) {
      if (request === generation) {
        $('#puzzle-error').textContent = error.message;
        $('#puzzle-status').textContent = 'Úloha se nenačetla';
        $('#next-puzzle').hidden = false;
      }
    } finally {
      if (request === generation) {
        busy = false;
        paintPuzzle();
      }
    }
  }
  function gradeLocal(success) {
    if (current.state.graded) return 0;
    const puzzle = current.puzzle.personal
      ? { ...current.puzzle, rating: training.rating }
      : current.puzzle;
    const result = recordPuzzle(training, puzzle, success, {
      hinted: current.state.hinted,
      mode: current.mode,
    });
    current.state.graded = true;
    saveTraining(result.state);
    return result.delta;
  }
  function showResult(data, wasGraded) {
    const done = current.state.complete;
    if (!wasGraded && current.state.graded) {
      sessionAttempted++;
      if (done && !current.state.failed && !current.state.hinted) sessionSolved++;
    }
    $('#rating-change').textContent = data.delta ? (data.delta > 0 ? '+' : '') + data.delta : '';
    $('#rating-change').className = data.delta < 0 ? 'negative' : 'positive';
    $('#puzzle-status').textContent = done
      ? current.state.failed || current.state.hinted
        ? 'Prošlo s pomocí'
        : 'Správně'
      : data.correct === false
        ? 'Zkus to znovu'
        : data.hint
          ? 'Nápověda'
          : 'Správný tah';
    $('#puzzle-message').textContent = data.message || '';
    $('.puzzle-feedback').dataset.state = done
      ? current.state.failed || current.state.hinted
        ? 'assisted'
        : 'success'
      : data.correct === false
        ? 'incorrect'
        : '';
    if (done) {
      if (current.mode === 'lesson' && !preferences.lesson.done.includes(current.puzzle.id)) {
        updatePreferences({
          lesson: { ...preferences.lesson, done: [...preferences.lesson.done, current.puzzle.id] },
        });
        renderHome();
      }
      const themes = data.themes || current.puzzle.themes || [];
      $('#puzzle-themes').innerHTML = themes
        .filter((t) => THEMES[t])
        .slice(0, 5)
        .map((t) => `<span>${THEMES[t]}</span>`)
        .join('');
      const solution =
        data.solution || current.puzzle.continuation || current.puzzle.moves?.slice(1) || [];
      if (solution.length) {
        current.solution = solution;
        $('#puzzle-solution').innerHTML =
          `<p>${esc(lineToSan(current.initialFen, solution, 20))}</p><button id="replay-solution" class="quiet-button">Přehrát řešení</button>`;
        $('#replay-solution').onclick = () => {
          clearTimeout(replayTimer);
          const chess = new Chess(current.initialFen),
            key = generation;
          let i = 0;
          puzzleBoard.interactive = false;
          puzzleBoard.set(chess.fen(), { flipped: puzzleFlipped });
          const next = () => {
            if (key !== generation || i >= solution.length) return;
            const uci = solution[i++];
            chess.move(uciMove(uci));
            puzzleBoard.set(chess.fen(), { flipped: puzzleFlipped, lastMove: uciMove(uci) });
            replayTimer = setTimeout(next, 650);
          };
          replayTimer = setTimeout(next, 400);
        };
      }
      const source = data.source || current.puzzle.source;
      if (
        typeof source === 'string' &&
        /^https:\/\/lichess\.org\/[A-Za-z0-9]+(?:\/black)?(?:#\d+)?$/.test(source)
      ) {
        $('#puzzle-source').href = source;
        $('#puzzle-source').hidden = false;
      }
      if (preferences.autoNext) autoTimer = setTimeout(loadPuzzle, 2200);
    }
    renderTraining();
  }
  async function submitMove(uci) {
    if (!current || busy || current.state.complete) return;
    const request = generation,
      wasGraded = current.state.graded;
    busy = true;
    paintPuzzle();
    $('#puzzle-error').textContent = '';
    try {
      let data;
      if (current.server)
        data = await accountRequest('puzzle/move', {
          method: 'POST',
          body: { challengeId: current.challengeId, move: uci },
        });
      else {
        data = playPuzzle(current.puzzle, current.state, uci);
        current.state = data.state;
        data.delta =
          current.state.failed || current.state.complete
            ? gradeLocal(current.state.complete && !current.state.failed)
            : 0;
      }
      if (request !== generation || current.owner !== owner()) return;
      current.state = data.state;
      if (data.training) saveTraining(data.training);
      if (data.correct) sound();
      showResult(data, wasGraded);
    } catch (error) {
      $('#puzzle-error').textContent = error.message;
    } finally {
      if (request === generation) {
        busy = false;
        paintPuzzle();
      }
    }
  }
  async function helpPuzzle(reveal) {
    if (!current || busy || current.state.complete) return;
    const request = generation,
      wasGraded = current.state.graded;
    busy = true;
    try {
      let data;
      if (current.server)
        data = await accountRequest('puzzle/' + (reveal ? 'solution' : 'hint'), {
          method: 'POST',
          body: { challengeId: current.challengeId },
        });
      else {
        current.state.hinted = true;
        if (reveal) {
          current.state.complete = true;
          current.state.failed = true;
        }
        data = {
          state: current.state,
          delta: gradeLocal(false),
          message: reveal ? 'Řešení úlohy.' : 'Zkus zahrát označenou figurou.',
          hint: reveal ? undefined : current.puzzle.moves[current.state.index].slice(0, 2),
        };
      }
      if (request !== generation) return;
      current.state = data.state;
      if (data.training) saveTraining(data.training);
      showResult(data, wasGraded);
      busy = false;
      paintPuzzle();
      if (data.hint) {
        puzzleBoard.selected = data.hint;
        puzzleBoard.paint();
      }
    } catch (error) {
      $('#puzzle-error').textContent = error.message;
    } finally {
      if (request === generation) busy = false;
    }
  }
  $('#puzzle-promotion').onclick = (event) => {
    if (event.target.closest('[data-cancel-promotion]')) {
      $('#puzzle-promotion').close();
      return;
    }
    const piece = event.target.closest('[data-piece]')?.dataset.piece;
    if (piece && current?.promotion) {
      const move = current.promotion;
      current.promotion = null;
      $('#puzzle-promotion').close();
      $('#puzzle-promotion').hidden = true;
      submitMove(move.from + move.to + piece);
    }
  };
  $('#puzzle-promotion').addEventListener('close', () => {
    if (current) current.promotion = null;
    $('#puzzle-promotion').hidden = true;
  });
  $('#toggle-sidebar').onclick = () =>
    updatePreferences({ sidebarCollapsed: !preferences.sidebarCollapsed });
  $('#toggle-language').onclick = () =>
    updatePreferences({ language: language() === 'en' ? 'cs' : 'en' });
  $('#toggle-theme').onclick = () =>
    updatePreferences({ theme: theme() === 'dark' ? 'light' : 'dark' });
  $('#language-choice').onchange = (event) => updatePreferences({ language: event.target.value });
  document.addEventListener('evala:language', () => {
    renderHome();
    paintPuzzle();
    document.title = translate(pageNames[page] || 'Přehled') + ' · Evala';
    if (page === 'account') renderAccount();
  });
  $('#review-budget').onchange = (e) => updatePreferences({ reviewBudget: Number(e.target.value) });
  $('#pause-reviews').onclick = () =>
    updatePreferences({ reviewPausedUntil: Date.now() + 7 * 86400000 });
  $('#resume-reviews').onclick = () => updatePreferences({ reviewPausedUntil: 0 });
  document.addEventListener('evala:train-theme', (e) => {
    mode = 'rated';
    $('#puzzle-theme').value = e.detail;
    go('puzzles');
  });
  $('#next-puzzle').onclick = loadPuzzle;
  $('#puzzle-hint').onclick = () => helpPuzzle(false);
  $('#puzzle-reveal').onclick = () => helpPuzzle(true);
  $('#flip-puzzle').onclick = () => {
    puzzleFlipped = !puzzleFlipped;
    paintPuzzle();
  };
  $('#start-lesson').onclick = () => {
    mode = 'lesson';
    go('puzzles');
  };
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-start-lesson]');
    if (!button) return;
    event.preventDefault();
    await getBank();
    const id = button.dataset.startLesson,
      games = [...context.library()].sort((a, b) => Number(b.id === id) - Number(a.id === id));
    updatePreferences({
      lesson: createLesson(bank, games, preferences.chessUsername, training, {
        goal: preferences.trainingGoal,
      }),
    });
    mode = 'lesson';
    go('puzzles');
  });
  $('#skip-onboarding').onclick = () => {
    updatePreferences({ onboardingComplete: true });
    renderHome();
  };
  $('#restart-onboarding').onclick = () => {
    updatePreferences({ onboardingComplete: false });
    go('home');
  };
  $('#onboarding-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const raw = $('#onboarding-username').value.trim(),
        profile = raw ? await publicChesscomProfile(raw) : null;
      if (!training.attempted) {
        const rating = Number($('#onboarding-rating').value);
        if (account.user) {
          const data = await accountRequest('profile', {
            method: 'PATCH',
            body: { startingRating: rating },
          });
          saveTraining(data.training);
        } else saveTraining({ ...training, rating, initialRating: rating });
      }
      const patch = { onboardingComplete: true, trainingGoal: $('#onboarding-goal').value };
      if (profile)
        Object.assign(patch, { chessUsername: profile.username, chessPlatform: 'chesscom' });
      updatePreferences(patch);
      if (profile) context.setUsername(profile.username, 'chesscom');
      renderHome();
    } catch (e) {
      $('#onboarding-status').textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
  $('#connect-chesscom').onclick = async (event) => {
    event.target.disabled = true;
    try {
      const profile = await publicChesscomProfile($('#linked-username').value);
      updatePreferences({ chessUsername: profile.username, chessPlatform: 'chesscom' });
      context.setUsername(profile.username, 'chesscom');
      renderChessProfile();
      $('#preference-status').textContent = translate('Veřejný profil propojen.');
    } catch (e) {
      $('#preference-status').textContent = e.message;
    } finally {
      event.target.disabled = false;
    }
  };
  $('#import-linked-profile').onclick = () => {
    if (!preferences.chessUsername) return;
    go('games');
    $('#username').value = preferences.chessUsername;
    $('#platform').value = preferences.chessPlatform;
    $('#username-form').requestSubmit();
  };
  document.querySelectorAll('[data-mode]').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.mode;
        loadPuzzle();
      }),
  );
  document.querySelectorAll('[data-training-mode]').forEach(
    (b) =>
      (b.onclick = () => {
        mode = b.dataset.trainingMode;
        if (page === 'puzzles') loadPuzzle();
      }),
  );
  $('#puzzle-theme').onchange = loadPuzzle;
  $('#puzzle-difficulty').onchange = (event) => {
    updatePreferences({ difficulty: event.target.value });
    loadPuzzle();
  };
  document
    .querySelectorAll('[data-board-theme]')
    .forEach((b) => (b.onclick = () => updatePreferences({ boardTheme: b.dataset.boardTheme })));
  for (const [id, key] of Object.entries({
    'piece-style': 'pieceStyle',
    'show-coordinates': 'coordinates',
    'show-legal': 'legalMoves',
    'move-sound': 'sound',
    'auto-next': 'autoNext',
    'experience-level': 'skill',
  }))
    $('#' + id).onchange = (event) =>
      updatePreferences({
        [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
      });
  $('#save-chess-profile').onclick = () => {
    const username = $('#linked-username').value.trim();
    if (!/^[A-Za-z0-9_-]{0,40}$/.test(username)) {
      $('#preference-status').textContent =
        'Přezdívka může obsahovat jen písmena, čísla, pomlčku a podtržítko.';
      return;
    }
    updatePreferences({ chessUsername: username, chessPlatform: $('#linked-platform').value });
    context.setUsername(username, preferences.chessPlatform);
    $('#preference-status').textContent = 'Profil uložen.';
    renderHome();
  };
  $('#starting-rating').onchange = async (event) => {
    const rating = Number(event.target.value);
    try {
      if (account.user) {
        const data = await accountRequest('profile', {
          method: 'PATCH',
          body: { startingRating: rating },
        });
        saveTraining(data.training);
      } else saveTraining({ ...training, rating, initialRating: rating });
      toast('Výchozí úroveň byla nastavena.');
    } catch (e) {
      toast(e.message);
      renderTraining();
    }
  };
  $('#open-engine-settings').onclick = () => {
    go('analysis');
    $('#toggle-settings').click();
  };
  $('#sync-library').onclick = async (event) => {
    event.target.disabled = true;
    try {
      await context.sync();
      renderHome();
    } catch (e) {
      toast(e.message);
    } finally {
      event.target.disabled = false;
    }
  };
  document.addEventListener('evala:account-update', () => {
    context.applyAccountPreferences();
    loadState();
    renderIdentity();
    renderHome();
    if (page === 'account') renderAccount();
  });
  document.addEventListener('evala:route', (event) => go(event.detail));
  document.addEventListener('evala:library', renderHome);
  document.addEventListener('evala:sync', (event) => {
    $('#sync-status').textContent = event.detail.message;
    $('#sync-status').classList.toggle('sync-error', event.detail.error);
  });
  document.addEventListener('evala:identity', async (event) => {
    ++generation;
    clearTimeout(autoTimer);
    current = null;
    sessionSolved = 0;
    sessionAttempted = 0;
    const cycle = generation;
    renderIdentity();
    loadState();
    await context.onIdentity(event.detail);
    if (cycle !== generation) return;
    flushAccountPreferences().catch(() => {});
    loadState();
    renderIdentity();
    renderHome();
    if (page === 'account') renderAccount();
  });
  const fromUrl = () =>
    go(
      location.hash.replace(/^#\/?/, '') ||
        (new URLSearchParams(location.search).get('view') === 'review' ? 'analysis' : 'home'),
    );
  window.addEventListener('hashchange', fromUrl);
  window.addEventListener('popstate', fromUrl);
  setInterval(() => {
    if (page === 'puzzles' && current && !current.state.complete) {
      const seconds = Math.floor((Date.now() - puzzleStarted) / 1000);
      $('#puzzle-time').textContent =
        Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }
  }, 1000);
  icons();
  loadState();
  renderIdentity();
  renderHome();
  flushAccountPreferences().catch(() => {});
  miniBoard($('#preview-board'), new Chess().fen());
  getBank()
    .then(() => {
      const preview = choosePuzzle(bank, training, { mode: 'daily' }),
        start = startPuzzle(preview);
      miniBoard($('#home-board'), start.fen);
      $('#home-to-move').textContent = start.color === 'w' ? 'Bílý na tahu' : 'Černý na tahu';
      $('#home-training-count').textContent = bank.length.toLocaleString('cs-CZ') + ' úloh';
    })
    .catch((e) => toast(e.message));
  fromUrl();
  return { go, preferences: () => preferences, refresh: renderHome };
}
