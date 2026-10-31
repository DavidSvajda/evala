import { choosePuzzle, personalPuzzles } from './logic.js';
import { FOCUS, localDay, trainingJourney } from './journey.js';

export function createLesson(
  bank,
  games,
  username,
  training,
  { day = localDay(), goal = 'balanced', focusKey } = {},
) {
  const priorities = trainingJourney(games, username, training).priorities;
  const focus = priorities.find((p) => p.key === focusKey) || priorities[0];
  const related = new Set(focus?.examples.map((e) => 'own-' + e.gameId + '-' + e.ply) || []);
  const allOwn = personalPuzzles(games, username);
  const own = focus ? allOwn.filter((p) => related.has(p.id)) : allOwn;
  const ids = [],
    positions = new Set();
  const add = (p) => {
    const key = p.fen.split(' ').slice(0, 4).join(' ');
    if (ids.length >= 6 || ids.includes(p.id) || positions.has(key)) return;
    ids.push(p.id);
    positions.add(key);
  };
  const weak = Object.entries(training.themeStats)
    .filter(([, s]) => s.attempted >= 3)
    .sort((a, b) => a[1].solved / a[1].attempted - b[1].solved / b[1].attempted)[0]?.[0];
  const theme = FOCUS[focus?.key]?.theme || weak || own[0]?.themes[0] || 'all';
  const due = [...allOwn, ...bank]
    .filter((p) => training.history[p.id]?.dueAt <= Date.now())
    .sort((a, b) => training.history[a.id].dueAt - training.history[b.id].dueAt)
    .slice(0, goal === 'review' ? 3 : 1);
  due.forEach(add);
  own.slice(0, goal === 'tactics' ? 1 : 3).forEach(add);
  while (ids.length < 6) {
    const pool = bank.filter(
      (p) => !ids.includes(p.id) && !positions.has(p.fen.split(' ').slice(0, 4).join(' ')),
    );
    if (!pool.length) break;
    add(
      choosePuzzle(pool, training, {
        theme: pool.some((p) => p.themes.includes(theme)) ? theme : 'all',
        random: () => 0,
      }),
    );
  }
  return {
    day,
    ids,
    done: [],
    theme,
    personal: ids.filter((id) => id.startsWith('own-')).length,
    ...(focus ? { focusKey: focus.key } : {}),
  };
}
export function nextLessonId(plan) {
  return plan?.ids.find((id) => !plan.done.includes(id)) || null;
}

export function chesscomUsername(input) {
  let value = String(input || '').trim();
  if (/^https?:/i.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error('Neplatný odkaz na profil.');
    }
    if (
      !['www.chess.com', 'chess.com'].includes(url.hostname) ||
      !/^\/member\/[a-z0-9_-]+\/?$/i.test(url.pathname) ||
      url.username ||
      url.password
    )
      throw new Error('Použij odkaz chess.com/member/jmeno.');
    value = url.pathname.split('/')[2];
  }
  if (!/^[a-z0-9_-]{2,40}$/i.test(value))
    throw new Error('Zadej přezdívku nebo odkaz na profil Chess.com.');
  return value.toLowerCase();
}
export async function publicChesscomProfile(input, { fetcher = fetch } = {}) {
  const username = chesscomUsername(input),
    response = await fetcher(`https://api.chess.com/pub/player/${username}`, {
      signal: AbortSignal.timeout(15000),
    });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Profil Chess.com nebyl nalezen.'
        : 'Chess.com není dostupný. Zkus to později.',
    );
  const profile = await response.json();
  if (!profile.username) throw new Error('Chess.com vrátil neplatný profil.');
  return {
    username: chesscomUsername(profile.username),
    url: `https://www.chess.com/member/${encodeURIComponent(profile.username)}`,
  };
}
