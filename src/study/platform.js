import { Chess } from 'chess.js';
import { StudyBoard } from './board.js';
import { lineToSan } from './game.js';
import { account, accountRequest, googleButton, logoutAccount, saveAccountPreferences } from './account.js';
import { migrateGuestGames,lastSyncStatus,clearAccountCache } from './storage.js';
import { THEMES, trainingState, choosePuzzle, startPuzzle, playPuzzle, recordPuzzle, personalPuzzles, uciMove } from '../training/logic.js';
import { language,setLanguage,translate } from './i18n.js';

const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const paths = {
  home:'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  games:'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5', analysis:'M4 20V4m0 16h17M7 15l4-5 4 2 5-7',
  puzzle:'M9 3h6v4a3 3 0 1 1 4 4h2v10h-7v-3a3 3 0 1 0-6 0v3H3v-7h3a3 3 0 1 0 0-6H3V3h6',
  chart:'M4 20h16M7 16V9m5 7V4m5 12v-5', settings:'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  user:'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  chevron:'m9 5 7 7-7 7', arrow:'M4 12h16m-6-6 6 6-6 6', plus:'M12 5v14M5 12h14',
  cloud:'M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10M12 21V11m-3 3 3-3 3 3',
  repeat:'M3 11a9 9 0 1 1 2 7M3 4v7h7', flip:'M5 7h13l-4-4M19 17H6l4 4M18 7l-4 4M6 17l4-4',
  check:'m5 12 4 4L19 6', close:'m6 6 12 12M18 6 6 18', book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.puzzle}"/></svg>`; }
function icons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon)); }
const PREFERENCES = { boardTheme:'sage',pieceStyle:'classic',coordinates:true,legalMoves:true,sound:false,autoNext:false,skill:'club',difficulty:'normal',chessUsername:'',chessPlatform:'chesscom',sidebarCollapsed:false };
const pageNames = { home:'Přehled', games:'Moje partie', analysis:'Rozbor', puzzles:'Trénink', insights:'Statistiky', settings:'Nastavení', account:'Můj účet' };

export async function initPlatform(context) {
  let page = '', bank = [], loadingBank, preferences, sessionSolved = 0, sessionAttempted = 0, toastTimer, preferenceTimer;
  let current = null, busy = false, puzzleFlipped = false, generation = 0, puzzleStarted = 0, autoTimer, replayTimer, mode = 'rated';
  const owner = () => account.user?.id || 'guest';
  const prefKey = () => 'evala-display:' + owner();
  const trainingKey = () => 'evala-training:' + owner();
  let training;
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
  function loadState() {
    let local = {}, localTraining;
    try { local = JSON.parse(localStorage.getItem(prefKey()) || '{}'); localTraining = JSON.parse(localStorage.getItem(trainingKey()) || 'null'); } catch { /* Defaults remain usable. */ }
    preferences = { ...PREFERENCES,language:language(), chessUsername: context.username() || '', ...local, ...account.user?.preferences };
    training = trainingState(account.training || localTraining);
    applyPreferences();
  }
  function saveTraining(value) { training = trainingState(value); if (account.user) account.training = training; try { localStorage.setItem(trainingKey(), JSON.stringify(training)); } catch { toast('Historii se nepodařilo uložit do prohlížeče.'); } renderTraining(); }
  function applyPreferences() {
    document.body.dataset.sidebarCollapsed=String(preferences.sidebarCollapsed);
    $('#toggle-sidebar').setAttribute('aria-expanded',String(!preferences.sidebarCollapsed));$('#toggle-sidebar').title=preferences.sidebarCollapsed?'Zobrazit boční panel':'Skrýt boční panel';$('#toggle-sidebar').setAttribute('aria-label',$('#toggle-sidebar').title);
    $('#language-choice').value=preferences.language;$('#toggle-language').textContent=preferences.language==='en'?'CS':'EN';setLanguage(preferences.language);
    document.body.dataset.boardTheme = preferences.boardTheme; document.body.dataset.pieceStyle = preferences.pieceStyle;
    document.body.dataset.coordinates = String(preferences.coordinates); document.body.dataset.legalMoves = String(preferences.legalMoves); document.body.dataset.skill = preferences.skill;
    document.querySelectorAll('[data-board-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.boardTheme === preferences.boardTheme)));
    for (const [id, key] of Object.entries({ 'piece-style':'pieceStyle', 'show-coordinates':'coordinates', 'show-legal':'legalMoves', 'move-sound':'sound', 'auto-next':'autoNext', 'linked-platform':'chessPlatform', 'linked-username':'chessUsername', 'experience-level':'skill' })) {
      const el = $('#' + id); if (el.type === 'checkbox') el.checked = preferences[key]; else el.value = preferences[key];
    }
    $('#puzzle-difficulty').value = preferences.difficulty;
  }
  function updatePreferences(patch) {
    Object.assign(preferences, patch); applyPreferences();
    try { localStorage.setItem(prefKey(), JSON.stringify(preferences)); } catch { toast('Nastavení se nepodařilo uložit.'); }
    clearTimeout(preferenceTimer);
    preferenceTimer = setTimeout(() => saveAccountPreferences(preferences).catch(e => toast(e.message)), 450);
  }
  function sound() {
    if (!preferences.sound) return;
    try { const audio = new (window.AudioContext || window.webkitAudioContext)(), oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.frequency.value = 440; gain.gain.setValueAtTime(.055, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .07); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .08); oscillator.onended = () => audio.close(); } catch { /* Audio is optional. */ }
  }
  function miniBoard(root, fen) {
    const chess = new Chess(fen); root.replaceChildren();
    for (let rank = 8; rank >= 1; rank--) for (const [file, letter] of [...'abcdefgh'].entries()) {
      const cell = document.createElement('span'); cell.className = 'mini-square ' + ((file + rank) % 2 ? 'light' : 'dark');
      const piece = chess.get(letter + rank);
      if (piece) { const image = document.createElement('img'); image.src = `pieces/${piece.color}${piece.type.toUpperCase()}.svg`; image.alt = ''; cell.append(image); const letter=document.createElement('span');letter.className='piece-letter '+(piece.color==='b'?'black':'white');letter.textContent=piece.type.toUpperCase();cell.append(letter); }
      root.append(cell);
    }
  }
  const puzzleBoard = new StudyBoard($('#puzzle-board'), { onMove: move => {
    if (busy || !current || current.state.complete) return;
    if (move.promotions.length) { current.promotion = move; $('#puzzle-promotion').hidden = false; return; }
    submitMove(move.from + move.to);
  } });
  async function getBank() {
    if (bank.length) return bank;
    loadingBank ||= fetch('data/puzzles.json', { signal: AbortSignal.timeout(20000) }).then(response => { if (!response.ok) throw new Error('Úlohy se nepodařilo načíst.'); return response.json(); }).then(data => { bank = data.puzzles; return bank; }).catch(e => { loadingBank = null; throw e; });
    return loadingBank;
  }
  function dueCount() { return Object.values(training.history).filter(h => h.dueAt <= Date.now()).length; }
  function ownPuzzles() { return personalPuzzles(context.library(), preferences.chessUsername || context.username()); }
  function renderTraining() {
    $('#home-rating').textContent = $('#puzzle-rating').textContent = training.rating;
    $('#home-solved').textContent = training.solved; $('#home-streak').textContent = training.streak;
    const due = dueCount(); $('#due-count').textContent = due || ''; $('#nav-review-count').textContent = due || '';
    $('#home-due').textContent = due ? `${due} úloh čeká na opakování` : 'Zatím nemáš úlohy k opakování';
    $('#session-solved').textContent = sessionSolved; $('#session-attempted').textContent = sessionAttempted;
    $('#starting-rating').value=String(training.initialRating||800);$('#starting-rating').disabled=training.attempted>0;
  }
  function gameRows(games, empty) {
    if (!games.length) return `<div class="empty-state"><span class="empty-symbol">${icon('games')}</span><h3>${empty}</h3><p>Načti veřejné partie podle přezdívky nebo importuj PGN.</p><a href="#/games" class="text-link">Importovat partii ${icon('arrow')}</a></div>`;
    return games.map(game => `<button class="recent-game" data-open-game="${esc(game.id)}"><span class="game-result">${esc(game.headers.Result || '*')}</span><span class="recent-players"><strong>${esc(game.headers.White || 'Bílý')} <span>–</span> ${esc(game.headers.Black || 'Černý')}</strong><small>${esc(game.headers.Opening || game.headers.ECO || 'Standardní šachy')} · ${Math.ceil(game.moves.length / 2)} tahů</small></span><span class="game-date">${esc(game.headers.Date?.includes('?')?'':game.headers.Date || '')}</span><span class="game-state ${game.analysis?.complete ? 'complete' : ''}">${game.analysis?.complete ? 'Rozebráno' : 'Bez rozboru'}</span><span>${icon('chevron')}</span></button>`).join('');
  }
  function openGame(id) { const game = context.library().find(g => g.id === id); if (game) { go('analysis'); context.openGame(game); } }
  function renderHome() {
    const games = context.library(); $('#nav-game-count').textContent = games.length || '';
    $('#welcome-title').textContent = account.user ? 'Přehled · ' + account.user.name.split(' ')[0] : 'Přehled';
    $('#today-date').textContent = new Intl.DateTimeFormat(language()==='en'?'en-GB':'cs-CZ', { weekday:'long',day:'numeric',month:'long' }).format(new Date());
    $('#recent-games').innerHTML = gameRows(games.slice(0, 4), 'Zatím nemáš uložené partie');
    $('#recent-games').querySelectorAll('[data-open-game]').forEach(b => b.onclick = () => openGame(b.dataset.openGame));
    $('#account-invite').hidden = !!account.user; $('#home-personal').textContent = ownPuzzles().length ? `${ownPuzzles().length} ověřených pozic z tvých rozborů` : 'Z rozebraných chyb s jasným lepším tahem';
    renderTraining();
  }
  function renderIdentity() {
    if(account.user)$('#sidebar-user').setAttribute('data-i18n-ignore','');else $('#sidebar-user').removeAttribute('data-i18n-ignore');
    $('#sync-status').textContent=account.user?(lastSyncStatus.message||'Účet připojen'):'Jen v prohlížeči';$('#sync-status').classList.toggle('sync-error',!!account.user&&lastSyncStatus.error);
    $('#sidebar-user').textContent = account.user?.name || 'Host';
    $('#sidebar-storage').textContent = account.user ? 'Osobní účet' : 'Uloženo v prohlížeči';
    $('#sidebar-avatar').removeAttribute('data-icon'); $('#sidebar-avatar').innerHTML = account.user ? esc(account.user.name.slice(0, 1).toUpperCase()) : icon('user');
    $('#header-signin').textContent = account.user ? 'Můj účet' : 'Přihlásit se';
    $('.storage-note').textContent = account.user ? 'Partie jsou uložené u tvého účtu.' : 'Uloženo v tomto prohlížeči.';
    $('#sync-library').hidden = !account.user;
  }
  async function renderAccount() {
    const root = $('#account-content'); $('#account-error').textContent = '';
    if (!account.user) {
      root.innerHTML = `<div class="account-signin"><span class="account-symbol">${icon('user')}</span><h2>Přihlásit se</h2><p>Google potvrdí tvoji identitu. Evala nedostane tvoje heslo.</p><div id="google-signin"></div><p id="google-signin-status" class="inline-status" role="status"></p><hr><h3>Co se uloží k účtu</h3><ul><li>Importované partie, rozbory a poznámky</li><li>Výsledky úloh a plán opakování</li><li>Vzhled šachovnice a šachová přezdívka</li></ul><a href="#/games">Pokračovat bez přihlášení</a></div>`;
      if (account.config?.enabled && account.config.googleClientId) await googleButton($('#google-signin'), message => $('#account-error').textContent = message);
      else $('#google-signin-status').textContent = 'Přihlášení přes Google na tomto serveru zatím není dostupné. Knihovnu i trénink můžeš používat bez účtu.';
      return;
    }
    root.innerHTML = `<section class="account-profile"><span class="profile-avatar">${esc(account.user.name.slice(0, 1))}</span><div><h2>${esc(account.user.name)}</h2><p>${esc(account.user.email)}</p><span class="provider-label">Účet Google</span></div><button id="logout-account" class="quiet-button">Odhlásit se</button></section><section class="account-library"><h2>Knihovna účtu</h2><p>${context.library().length} uložených partií. Rozbory a nastavení se načtou po přihlášení i na jiném zařízení.</p><div class="account-actions"><button id="import-guest-games" class="quiet-button">Převzít místní partie</button><button id="export-account" class="quiet-button">Exportovat moje data</button></div><p class="hint">Místní partie patří k režimu hosta v tomto prohlížeči. Do účtu se přenesou až tímto tlačítkem.</p></section><details class="danger-zone"><summary>Smazat účet a jeho data</summary><p>Partie a historie tréninku se trvale smažou. Přihlášení u Googlu se tím neruší. Pro potvrzení napiš SMAZAT.</p><form id="delete-account-form"><input aria-label="Potvrzení smazání účtu" pattern="SMAZAT" required autocomplete="off"><button type="submit" class="quiet-button">Smazat účet</button></form></details>`;
    $('#logout-account').onclick = async () => { try { if (context.busy()) throw new Error('Nejprve pozastav probíhající rozbor.'); await logoutAccount(); } catch (e) { $('#account-error').textContent = e.message; } };
    $('#import-guest-games').onclick = async event => {
      event.target.disabled = true;
      try { const count = await migrateGuestGames(); await context.reload(); renderHome();renderAccount(); toast(`Přeneseno ${count} partií.`); }
      catch (e) { $('#account-error').textContent = e.message; }
      finally { event.target.disabled = false; }
    };
    $('#export-account').onclick = () => {
      const data = { user:account.user, training, games:context.library().map(({ _storageOwner, _remoteVersion, _syncPending, ...game }) => game) };
      const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type:'application/json' })); link.href = url; link.download = 'evala-moje-data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    $('#delete-account-form').onsubmit = async event => {
      event.preventDefault(); if (event.target.querySelector('input').value !== 'SMAZAT') return;
      try { if (context.busy()) throw new Error('Nejprve pozastav probíhající rozbor.'); await accountRequest('delete', { method:'POST', body:{} }); await clearAccountCache();localStorage.removeItem(prefKey());localStorage.removeItem(trainingKey());Object.assign(account, { user:null,csrf:'',training:null }); document.dispatchEvent(new CustomEvent('evala:identity', { detail:null })); }
      catch (e) { $('#account-error').textContent = e.message; }
    };
  }
  function go(next) {
    next = pageNames[next] ? next : 'home';
    if (location.hash !== '#/' + next) history.pushState(null, '', '#/' + next);
    const changed = page !== next; page = next; document.body.dataset.page = next;
    document.querySelectorAll('main[data-page]').forEach(el => el.hidden = el.dataset.page !== next);
    document.querySelectorAll('[data-route]').forEach(el => { if (el.dataset.route === next) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(el.dataset.route === next)); });
    $('#page-label').textContent = pageNames[next]; document.title = translate(pageNames[next]) + ' · Evala';
    document.dispatchEvent(new CustomEvent('evala:page', { detail:next }));
    if (next === 'home') renderHome();
    if (next === 'puzzles' && (!current || changed)) loadPuzzle();
    if (next === 'account') renderAccount();
    if (changed) { clearTimeout(autoTimer); clearTimeout(replayTimer); window.scrollTo({ top:0,behavior:'instant' }); }
  }
  function paintPuzzle() {
    if (!current) return;
    $('#flip-puzzle').disabled=false;
    const uci = current.state.lastMove;
    puzzleBoard.interactive = !busy && !current.state.complete;
    puzzleBoard.set(current.state.fen, { flipped:puzzleFlipped, lastMove:uci ? uciMove(uci) : null });
    $('#puzzle-turn').textContent = current.state.color === 'w' ? 'Bílý na tahu' : 'Černý na tahu';
    $('#puzzle-player-dot').classList.toggle('black', current.state.color === 'b');
    $('#puzzle-hint').disabled = $('#puzzle-reveal').disabled = busy || current.state.complete;
    $('#next-puzzle').hidden = !current.state.complete;
  }
  function resetPuzzlePanel() {
    $('#puzzle-status').textContent = 'Najdi nejlepší tah'; $('#puzzle-message').textContent = 'Spočítej pokračování a zahraj tah na šachovnici.';
    $('.puzzle-feedback').dataset.state = ''; $('#puzzle-themes').replaceChildren(); $('#puzzle-solution').replaceChildren(); $('#puzzle-source').hidden = true; $('#next-puzzle').hidden = true;
    $('#puzzle-error').textContent = ''; $('#rating-change').textContent = ''; $('#puzzle-promotion').hidden = true;
    $('#puzzle-time').textContent='';$('#puzzle-number').textContent='';$('#puzzle-level').textContent='';$('#puzzle-turn').textContent='Načítám úlohu…';
    $('#puzzle-hint').disabled=$('#puzzle-reveal').disabled=$('#flip-puzzle').disabled=true;puzzleBoard.grid.replaceChildren();puzzleBoard.arrows.replaceChildren();
  }
  async function loadPuzzle() {
    const request = ++generation; clearTimeout(autoTimer); clearTimeout(replayTimer); busy = true; current = null; puzzleBoard.interactive = false;
    resetPuzzlePanel(); $('#puzzle-status').textContent = 'Načítám úlohu…';
    document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    try {
      await getBank(); let puzzle, state, challengeId, server = false;
      if (mode === 'personal'&&!account.user) {
        const pool = ownPuzzles(); puzzle = pool.find(p => !training.recent.includes(p.id)) || pool[0];
        if (puzzle) state = startPuzzle(puzzle);
      } else if (account.user) {
        const data = await accountRequest('puzzle/next', { method:'POST', body:{ mode,theme:$('#puzzle-theme').value,difficulty:preferences.difficulty } });
        if (request !== generation) return;
        saveTraining(data.training); if (data.puzzle) { puzzle = data.puzzle; state = puzzle.state; challengeId = puzzle.challengeId; server = true; }
      } else { puzzle = choosePuzzle(bank, training, { mode,theme:$('#puzzle-theme').value,difficulty:preferences.difficulty }); if (puzzle) state = startPuzzle(puzzle); }
      if (request !== generation) return;
      if (!puzzle) {
        $('#puzzle-status').textContent = mode === 'personal' ? 'Zatím nejsou vhodné pozice' : 'Opakování je hotové';
        $('#puzzle-message').textContent = mode === 'personal' ? 'Nastav svou přezdívku v Nastavení a rozeber partie. Přidáváme jen chyby, u kterých engine našel jasně lepší tah.' : 'Další úlohy se vrátí, až nastane čas je zopakovat. Mezitím můžeš pokračovat v taktice.';
        $('#puzzle-hint').disabled = $('#puzzle-reveal').disabled = true; $('#puzzle-turn').textContent = 'Vyber jiný režim'; return;
      }
      current = { puzzle,state,challengeId,server,owner:owner(),mode,initialFen:state.fen };
      puzzleStarted = Date.now(); puzzleFlipped = state.color === 'b';
      $('#puzzle-status').textContent = 'Najdi nejlepší tah';
      $('#puzzle-number').textContent = mode === 'personal' ? 'Z tvé partie · ' + puzzle.opponent : 'Úloha ' + puzzle.id;
      $('#puzzle-level').textContent=puzzle.personal?'Osobní pozice · bez kalibrovaného ratingu':`Elo úlohy: ${new Intl.NumberFormat(language()==='en'?'en-GB':'cs-CZ').format(puzzle.rating)} · ${puzzle.rating<1000?'Základní':puzzle.rating<1600?'Střední':puzzle.rating<2200?'Pokročilá':'Náročná'}`;
      $('#puzzle-subtitle').textContent = mode === 'personal' ? 'Zkus znovu rozhodující pozici ze své partie.' : mode === 'review' ? 'Vrať se k úlohám, které ti daly zabrat.' : mode === 'daily' ? 'Stejná úloha pro všechny hráče dnes.' : 'Taktické úlohy podle tvé úrovně.';
    } catch (error) { if (request === generation) { $('#puzzle-error').textContent = error.message; $('#puzzle-status').textContent = 'Úloha se nenačetla'; $('#next-puzzle').hidden = false; } }
    finally { if (request === generation) { busy = false; paintPuzzle(); } }
  }
  function gradeLocal(success) {
    if (current.state.graded) return 0;
    const puzzle = current.puzzle.personal ? { ...current.puzzle,rating:training.rating } : current.puzzle;
    const result = recordPuzzle(training, puzzle, success, { hinted:current.state.hinted,mode:current.mode });
    current.state.graded = true; saveTraining(result.state); return result.delta;
  }
  function showResult(data, wasGraded) {
    const done = current.state.complete;
    if (!wasGraded && current.state.graded) { sessionAttempted++; if (done && !current.state.failed && !current.state.hinted) sessionSolved++; }
    $('#rating-change').textContent = data.delta ? (data.delta > 0 ? '+' : '') + data.delta : '';
    $('#rating-change').className = data.delta < 0 ? 'negative' : 'positive';
    $('#puzzle-status').textContent = done ? current.state.failed || current.state.hinted ? 'Prošlo s pomocí' : 'Správně' : data.correct === false ? 'Zkus to znovu' : data.hint ? 'Nápověda' : 'Správný tah';
    $('#puzzle-message').textContent = data.message || '';
    $('.puzzle-feedback').dataset.state = done ? current.state.failed || current.state.hinted ? 'assisted' : 'success' : data.correct === false ? 'incorrect' : '';
    if (done) {
      const themes = data.themes || current.puzzle.themes || [];
      $('#puzzle-themes').innerHTML = themes.filter(t => THEMES[t]).slice(0, 5).map(t => `<span>${THEMES[t]}</span>`).join('');
      const solution = data.solution || current.puzzle.continuation || current.puzzle.moves?.slice(1) || [];
      if (solution.length) {
        current.solution = solution;
        $('#puzzle-solution').innerHTML = `<p>${esc(lineToSan(current.initialFen, solution, 20))}</p><button id="replay-solution" class="quiet-button">Přehrát řešení</button>`;
        $('#replay-solution').onclick = () => {
          clearTimeout(replayTimer); const chess = new Chess(current.initialFen), key = generation; let i = 0;
          puzzleBoard.interactive = false; puzzleBoard.set(chess.fen(), { flipped:puzzleFlipped });
          const next = () => { if (key !== generation || i >= solution.length) return; const uci = solution[i++]; chess.move(uciMove(uci)); puzzleBoard.set(chess.fen(), { flipped:puzzleFlipped,lastMove:uciMove(uci) }); replayTimer = setTimeout(next, 650); }; replayTimer = setTimeout(next, 400);
        };
      }
      const source = data.source || current.puzzle.source;
      if (typeof source === 'string' && /^https:\/\/lichess\.org\/[A-Za-z0-9]+(?:\/black)?(?:#\d+)?$/.test(source)) { $('#puzzle-source').href = source; $('#puzzle-source').hidden = false; }
      if (preferences.autoNext) autoTimer = setTimeout(loadPuzzle, 2200);
    }
    renderTraining();
  }
  async function submitMove(uci) {
    if (!current || busy || current.state.complete) return;
    const request = generation, wasGraded = current.state.graded; busy = true; paintPuzzle(); $('#puzzle-error').textContent = '';
    try {
      let data;
      if (current.server) data = await accountRequest('puzzle/move', { method:'POST',body:{ challengeId:current.challengeId,move:uci } });
      else { data = playPuzzle(current.puzzle, current.state, uci); current.state = data.state; data.delta = current.state.failed || current.state.complete ? gradeLocal(current.state.complete && !current.state.failed) : 0; }
      if (request !== generation || current.owner !== owner()) return;
      current.state = data.state; if (data.training) saveTraining(data.training);
      if (data.correct) sound(); showResult(data, wasGraded);
    } catch (error) { $('#puzzle-error').textContent = error.message; }
    finally { if (request === generation) { busy = false; paintPuzzle(); } }
  }
  async function helpPuzzle(reveal) {
    if (!current || busy || current.state.complete) return;
    const request = generation, wasGraded = current.state.graded; busy = true;
    try {
      let data;
      if (current.server) data = await accountRequest('puzzle/' + (reveal ? 'solution' : 'hint'), { method:'POST',body:{ challengeId:current.challengeId } });
      else {
        current.state.hinted = true;
        if (reveal) { current.state.complete = true; current.state.failed = true; }
        data = { state:current.state,delta:gradeLocal(false),message:reveal ? 'Řešení úlohy.' : 'Zkus zahrát označenou figurou.',hint:reveal ? undefined : current.puzzle.moves[current.state.index].slice(0, 2) };
      }
      if (request !== generation) return;
      current.state = data.state; if (data.training) saveTraining(data.training); showResult(data, wasGraded);
      busy = false; paintPuzzle(); if (data.hint) { puzzleBoard.selected = data.hint; puzzleBoard.paint(); }
    } catch (error) { $('#puzzle-error').textContent = error.message; }
    finally { if (request === generation) busy = false; }
  }
  $('#puzzle-promotion').onclick = event => { const piece = event.target.dataset.piece; if (piece && current?.promotion) { const move = current.promotion; current.promotion = null; $('#puzzle-promotion').hidden = true; submitMove(move.from + move.to + piece); } };
  $('#toggle-sidebar').onclick=()=>updatePreferences({sidebarCollapsed:!preferences.sidebarCollapsed});
  $('#toggle-language').onclick=()=>updatePreferences({language:language()==='en'?'cs':'en'});
  $('#language-choice').onchange=event=>updatePreferences({language:event.target.value});
  document.addEventListener('evala:language',()=>{renderHome();paintPuzzle();document.title=translate(pageNames[page]||'Přehled')+' · Evala';if(page==='account')renderAccount();});
  $('#next-puzzle').onclick = loadPuzzle; $('#puzzle-hint').onclick = () => helpPuzzle(false); $('#puzzle-reveal').onclick = () => helpPuzzle(true);
  $('#flip-puzzle').onclick = () => { puzzleFlipped = !puzzleFlipped; paintPuzzle(); };
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; loadPuzzle(); });
  document.querySelectorAll('[data-training-mode]').forEach(b => b.onclick = () => { mode = b.dataset.trainingMode; if (page === 'puzzles') loadPuzzle(); });
  $('#puzzle-theme').onchange = loadPuzzle;
  $('#puzzle-difficulty').onchange = event => { updatePreferences({ difficulty:event.target.value }); loadPuzzle(); };
  document.querySelectorAll('[data-board-theme]').forEach(b => b.onclick = () => updatePreferences({ boardTheme:b.dataset.boardTheme }));
  for (const [id, key] of Object.entries({ 'piece-style':'pieceStyle', 'show-coordinates':'coordinates', 'show-legal':'legalMoves', 'move-sound':'sound', 'auto-next':'autoNext', 'experience-level':'skill' })) $('#' + id).onchange = event => updatePreferences({ [key]:event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  $('#save-chess-profile').onclick = () => {
    const username = $('#linked-username').value.trim(); if (!/^[A-Za-z0-9_-]{0,40}$/.test(username)) { $('#preference-status').textContent = 'Přezdívka může obsahovat jen písmena, čísla, pomlčku a podtržítko.'; return; }
    updatePreferences({ chessUsername:username,chessPlatform:$('#linked-platform').value }); context.setUsername(username, preferences.chessPlatform); $('#preference-status').textContent = 'Profil uložen.'; renderHome();
  };
  $('#starting-rating').onchange=async event=>{const rating=Number(event.target.value);try{if(account.user){const data=await accountRequest('profile',{method:'PATCH',body:{startingRating:rating}});saveTraining(data.training);}else saveTraining({...training,rating,initialRating:rating});toast('Výchozí úroveň byla nastavena.');}catch(e){toast(e.message);renderTraining();}};
  $('#open-engine-settings').onclick = () => { go('analysis'); $('#toggle-settings').click(); };
  $('#sync-library').onclick = async event => { event.target.disabled = true; try { await context.sync(); renderHome(); } catch (e) { toast(e.message); } finally { event.target.disabled = false; } };
  document.addEventListener('evala:route', event => go(event.detail));
  document.addEventListener('evala:library', renderHome);
  document.addEventListener('evala:sync', event => { $('#sync-status').textContent = event.detail.message; $('#sync-status').classList.toggle('sync-error', event.detail.error); });
  document.addEventListener('evala:identity', async event => {
    ++generation; clearTimeout(autoTimer); clearTimeout(preferenceTimer); current = null;sessionSolved=0;sessionAttempted=0;
    await context.onIdentity(event.detail); loadState(); renderIdentity(); renderHome(); if (page === 'account') renderAccount();
  });
  const fromUrl = () => go(location.hash.replace(/^#\/?/, '') || (new URLSearchParams(location.search).get('view') === 'review' ? 'analysis' : 'home'));
  window.addEventListener('hashchange', fromUrl); window.addEventListener('popstate', fromUrl);
  setInterval(() => { if (page === 'puzzles' && current && !current.state.complete) { const seconds = Math.floor((Date.now() - puzzleStarted) / 1000); $('#puzzle-time').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); } }, 1000);
  icons(); loadState(); renderIdentity(); renderHome();
  miniBoard($('#preview-board'), new Chess().fen());
  getBank().then(() => {
    const preview = choosePuzzle(bank, training, { mode:'daily' }), start = startPuzzle(preview); miniBoard($('#home-board'), start.fen);
    $('#home-to-move').textContent = start.color === 'w' ? 'Bílý na tahu' : 'Černý na tahu'; $('#home-training-count').textContent = bank.length.toLocaleString('cs-CZ') + ' úloh';
  }).catch(e => toast(e.message));
  fromUrl();
  return { go, preferences:() => preferences, refresh:renderHome };
}
