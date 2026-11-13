export function importUsernameFor(value, platform) {
  let name = String(value ?? '').trim();
  if (platform === 'lichess') name = name.replace(/^@(?=\w)/, '');
  if (/^https:\/\//i.test(name)) {
    const url = new URL(name);
    const match =
      platform === 'lichess'
        ? url.hostname === 'lichess.org' && url.pathname.match(/^\/@\/([a-z0-9_-]+)\/?$/i)
        : ['chess.com', 'www.chess.com'].includes(url.hostname) &&
          url.pathname.match(/^\/member\/([a-z0-9_-]+)\/?$/i);
    if (match && !url.username && !url.password && !url.port) name = match[1];
  }
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(name))
    throw new Error('Zadej přezdívku nebo odkaz na veřejný profil vybraného webu.');
  return name;
}

export async function publicLichessProfile(input) {
  const name = importUsernameFor(input, 'lichess');
  const response = await checkedFetch(`https://lichess.org/api/user/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(15000),
  });
  const profile = await response.json();
  if (typeof profile.username !== 'string' || !/^[a-z0-9_-]{2,40}$/i.test(profile.username))
    throw new Error('Lichess vrátil neplatný profil.');
  return { username: profile.username };
}
async function checkedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'Uživatel nebo archiv nebyl nalezen.'
        : response.status === 429
          ? 'Server omezuje požadavky. Počkej chvíli a zkus import znovu.'
          : `Import se nezdařil (HTTP ${response.status}). Zkus PGN soubor.`,
    );
  return response;
}
export async function importUsername(username, platform, { signal, onProgress, limit = 20 } = {}) {
  const user = importUsernameFor(username, platform);
  const deadline = AbortSignal.timeout(20000);
  signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  limit = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
  if (platform === 'lichess') {
    const response = await checkedFetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${limit}&moves=true&clocks=true&evals=false&ongoing=false&finished=true&opening=true&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence`,
      { signal, headers: { Accept: 'application/x-chess-pgn' } },
    );
    const text = await response.text();
    if (!text.trim()) throw new Error('Profil nemá dostupné dokončené standardní partie.');
    if (text.length > 2_000_000) throw new Error('Import je příliš velký. Použij PGN soubor.');
    return text;
  }
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`;
  const archives = await (await checkedFetch(base + '/archives', { signal })).json();
  if (!Array.isArray(archives.archives) || !archives.archives.length)
    throw new Error('Uživatel nemá dostupné archivované partie.');
  const games = [];
  // Serial requests follow the provider's published rate-limit guidance.
  const recent = [...archives.archives].sort().slice(-12).reverse();
  for (const [i, url] of recent.entries()) {
    if (!/^https:\/\/api\.chess\.com\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/\d{2}$/i.test(url))
      throw new Error('Neplatná adresa archivu.');
    onProgress?.(
      `Načítám archiv ${i + 1}/${recent.length} · ${Math.min(limit, games.length)}/${limit} partií…`,
    );
    const response = await (await checkedFetch(url, { signal })).json();
    games.push(
      ...(Array.isArray(response.games) ? response.games : [])
        .filter((g) => g.rules === 'chess' && typeof g.pgn === 'string' && g.end_time)
        .sort((a, b) => b.end_time - a.end_time),
    );
    if (games.length >= limit) break;
  }
  if (!games.length)
    throw new Error('V posledních dvanácti archivech nejsou dokončené standardní partie.');
  return games
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, limit)
    .map((g) => g.pgn)
    .join('\n\n');
}
