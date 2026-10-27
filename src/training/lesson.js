import { choosePuzzle, personalPuzzles } from './logic.js';

export function createLesson(
  bank,
  games,
  username,
  training,
  { day = new Date().toISOString().slice(0, 10), goal = 'balanced' } = {},
) {
  const own = personalPuzzles(games, username).slice(0, goal === 'tactics' ? 1 : 3),
    ids = own.map((p) => p.id);
  const weak = Object.entries(training.themeStats)
    .filter(([, s]) => s.attempted >= 3)
    .sort((a, b) => a[1].solved / a[1].attempted - b[1].solved / b[1].attempted)[0]?.[0];
  const theme = weak || own[0]?.themes[0] || 'all';
  const due = bank
    .filter((p) => training.history[p.id]?.dueAt <= Date.now())
    .slice(0, goal === 'review' ? 3 : 1);
  ids.push(...due.map((p) => p.id));
  while (ids.length < 6) {
    const pool = bank.filter((p) => !ids.includes(p.id));
    if (!pool.length) break;
    ids.push(
      choosePuzzle(pool, training, {
        theme: pool.some((p) => p.themes.includes(theme)) ? theme : 'all',
        random: () => 0,
      }).id,
    );
  }
  return { day, ids, done: [], theme, personal: own.length };
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
