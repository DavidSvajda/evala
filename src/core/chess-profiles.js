const validName = /^[a-z0-9_-]{2,40}$/i;

export function linkedUsername(preferences, platform) {
  const field = platform === 'lichess' ? 'lichessUsername' : 'chesscomUsername';
  const name =
    preferences[field] ??
    ((preferences.chessPlatform || 'chesscom') === platform ? preferences.chessUsername : '');
  return typeof name === 'string' && validName.test(name) ? name : '';
}

export function profilePatch(platform, username) {
  return {
    [platform === 'lichess' ? 'lichessUsername' : 'chesscomUsername']: username,
    chessPlatform: platform,
    chessUsername: username,
  };
}
