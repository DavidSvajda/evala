const checkedUser = (value) => {
  const name = value.trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(name))
    throw new Error('Zadej uživatelské jméno bez odkazu a mezer.');
  return name;
};
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
  const user = checkedUser(username);
  limit = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
  if (platform === 'lichess') {
    const response = await checkedFetch(
      `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${limit}&moves=true&clocks=true&evals=false&ongoing=false&perfType=bullet,blitz,rapid,classical`,
      { signal, headers: { Accept: 'application/x-chess-pgn' } },
    );
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('Import je příliš velký. Použij PGN soubor.');
    return text;
  }
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games`;
  const archives = await (await checkedFetch(base + '/archives', { signal })).json();
  if (!Array.isArray(archives.archives) || !archives.archives.length)
    throw new Error('Uživatel nemá dostupné archivované partie.');
  const games = [];
  // Serial requests follow the provider's published rate-limit guidance.
  const recent = archives.archives.slice(-12).reverse();
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
