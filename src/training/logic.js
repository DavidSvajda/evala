import { Chess } from 'chess.js';

export const THEMES = { mateIn1:'Mat jedním tahem',mateIn2:'Mat dvěma tahy',fork:'Vidlička',pin:'Vazba',skewer:'Napíchnutí',hangingPiece:'Napadená figura',discoveredAttack:'Odtažný útok',backRankMate:'Mat na poslední řadě',sacrifice:'Oběť',endgame:'Koncovka',promotion:'Proměna pěšce',deflection:'Odlákání',attraction:'Zavlečení',defensiveMove:'Obrana',zugzwang:'Nevýhoda tahu',quietMove:'Tichý tah',mate:'Matový útok',advantage:'Získání výhody',crushing:'Rozhodující výhoda',middlegame:'Střední hra',opening:'Zahájení',short:'Krátká kombinace',long:'Delší kombinace',veryLong:'Dlouhá kombinace',intermezzo:'Mezitah',clearance:'Uvolnění pole',capturingDefender:'Odstranění obránce',trappedPiece:'Chycená figura',exposedKing:'Odkrytý král',pawnEndgame:'Pěšcová koncovka',rookEndgame:'Věžová koncovka' };
export const TRAINING_DEFAULTS = { rating: 800, initialRating:800, solved: 0, attempted: 0, history: {}, themeStats: {}, streak: 0, lastDay: '', bestStreak: 0, recent: [], failedRun: 0 };
const copy = value => JSON.parse(JSON.stringify(value));
export function trainingState(value) {
  return { ...copy(TRAINING_DEFAULTS), ...value, history: value?.history || {}, themeStats: value?.themeStats || {}, recent: value?.recent || [] };
}
export function startPuzzle(puzzle) {
  const chess = new Chess(puzzle.fen);
  const moves = puzzle.moves || [];
  if (moves.length < (puzzle.personal ? 1 : 2)) throw new Error('Úloha nemá úplné řešení.');
  if (!puzzle.personal) chess.move(uciMove(moves[0]));
  return { puzzleId: puzzle.id, fen: chess.fen(), color: chess.turn(), index: puzzle.personal ? 0 : 1, failed: false, hinted: false, complete: false, graded: false, played: [], startedAt: Date.now() };
}
export function uciMove(uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci || '')) throw new Error('Neplatný tah.');
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}
export function playPuzzle(puzzle, original, uci) {
  const state = copy(original);
  if (state.complete) throw new Error('Úloha je již dokončená.');
  const chess = new Chess(state.fen);
  chess.move(uciMove(uci));
  if (uci !== puzzle.moves[state.index]) {
    state.failed = true;
    return { state, correct: false, message: 'Tento tah nevede k řešení. Zkus jiný.' };
  }
  state.index++; state.played.push(uci); state.lastMove = uci;
  let reply = null;
  if (state.index < puzzle.moves.length) {
    reply = puzzle.moves[state.index++]; chess.move(uciMove(reply)); state.played.push(reply); state.lastMove = reply;
  }
  state.fen = chess.fen(); state.complete = state.index >= puzzle.moves.length;
  return { state, correct: true, reply, message: state.complete ? 'Vyřešeno.' : 'Správně. Pokračuj.' };
}
export function choosePuzzle(bank, state, { theme = 'all', mode = 'rated', difficulty = 'normal', now = Date.now(), random = Math.random,reviewBudget=10,reviewPausedUntil=0 } = {}) {
  let pool = theme === 'all' ? bank : bank.filter(p => p.themes.includes(theme));
  if (!pool.length) throw new Error('Pro vybrané téma nejsou dostupné úlohy.');
  const due = pool.filter(p => state.history[p.id]?.dueAt <= now);
  if (mode === 'review') {
    if(reviewPausedUntil>now||(state.reviewDay===new Date(now).toISOString().slice(0,10)&&(state.reviewsToday||0)>=reviewBudget))return null;
    return due.sort((a, b) => state.history[a.id].dueAt - state.history[b.id].dueAt)[0] || null;
  }
  if (mode === 'daily') {
    const day = Math.floor(now / 86400000); return pool[day % pool.length];
  }
  const recent = new Set(state.recent.slice(-80));
  const fresh = pool.filter(p => !recent.has(p.id)); if (fresh.length) pool = fresh;
  const target = state.rating + ({ easy: -250, normal: 0, hard: 250 }[difficulty] || 0) - Math.min(300, (state.failedRun || 0) * 75);
  const weighted = pool.map(p => {
    const weakness = p.themes.reduce((n, theme) => {
      const stats = state.themeStats[theme]; return n + (stats?.attempted >= 3 ? (1 - stats.solved / stats.attempted) * 60 : 0);
    }, 0);
    return { puzzle: p, distance: Math.abs(p.rating - target) - Math.min(150, weakness) };
  }).sort((a, b) => a.distance - b.distance).slice(0, 80);
  return weighted[Math.min(weighted.length - 1, Math.floor(random() * weighted.length))].puzzle;
}
export function recordPuzzle(original, puzzle, success, { hinted = false, now = Date.now(), mode = 'rated' } = {}) {
  const state = trainingState(original), clean = success && !hinted;
  const expected = 1 / (1 + 10 ** ((puzzle.rating - state.rating) / 400));
  const delta = mode === 'rated' ? Math.round(24 * ((clean ? 1 : 0) - expected)) : 0;
  state.rating = Math.max(100, Math.min(3500, state.rating + delta));
  state.attempted++; if (clean) state.solved++;
  state.failedRun = clean ? 0 : Math.min(4, (state.failedRun || 0) + 1);
  const prior = state.history[puzzle.id] || { interval: 0, attempts: 0, failures: 0 };
  const interval = clean ? Math.min(90, prior.interval ? Math.max(1, prior.interval * 2.3) : 1) : 0;
  state.history[puzzle.id] = { ...prior, interval, attempts: prior.attempts + 1, failures: prior.failures + (clean ? 0 : 1), dueAt: now + (clean ? interval * 86400000 : 600000), lastAt: now, success: clean };
  for (const theme of puzzle.themes) {
    const stats = state.themeStats[theme] ||= { attempted: 0, solved: 0 }; stats.attempted++; if (clean) stats.solved++;
  }
  const day = new Date(now).toISOString().slice(0, 10), yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  if(mode==='review'){state.reviewsToday=state.reviewDay===day?(state.reviewsToday||0)+1:1;state.reviewDay=day;}
  if (state.lastDay !== day) { state.streak = state.lastDay === yesterday ? state.streak + 1 : 1; state.lastDay = day; }
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.recent = [...state.recent.filter(id => id !== puzzle.id), puzzle.id].slice(-100);
  return { state, delta };
}
export function personalPuzzles(games, username = '') {
  const name = username.trim().toLowerCase(), puzzles = [];
  for (const game of games) {
    const own = game.headers.White?.toLowerCase() === name ? 'w' : game.headers.Black?.toLowerCase() === name ? 'b' : null;
    if (!own) continue;
    for (const [index, move] of game.moves.entries()) {
      const mark = game.analysis?.moves?.[index], before = game.analysis?.positions?.[index];
      const [best, second] = before?.lines || [];
      if (move.color !== own || !mark || mark.loss < 10 || !best?.pv?.length || !second || before.depth < 14 || best.depth < 14 || second.depth < 14 || !Number.isFinite(best.depth) || !Number.isFinite(second.depth)) continue;
      const sign = own === 'w' ? 1 : -1;
      const distinct = best.kind === 'mate' && best.value * sign > 0 && second.kind !== 'mate' || best.kind === 'cp' && second.kind === 'cp' && (best.value - second.value) * sign >= 100;
      if (!distinct || best.pv[0] === move.uci) continue;
      try {
        const chess = new Chess(move.fenBefore), line = [];
        for (const uci of best.pv.slice(0, 5)) { chess.move(uciMove(uci)); line.push(uci); }
        if (line.length % 2 === 0) line.pop();
        puzzles.push({ id: 'own-' + game.id + '-' + index, fen: move.fenBefore, moves: line.slice(0,1), continuation:line, personal: true, gameId: game.id, ply: index, color: own, opponent: game.headers[own === 'w' ? 'Black' : 'White'], themes: [best.kind === 'mate' ? 'mate' : 'advantage'], rating: null });
      } catch { /* Discard incomplete principal variations. */ }
    }
  }
  return puzzles.slice(0, 80);
}
