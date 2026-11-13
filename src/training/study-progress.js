import { ownColor } from './practice.js';
import { errorReason, phaseOf, timeClass } from '../core/game-analytics.js';

// Recurrence after practice is observational. Denominators are analysed own
// decisions in the phase, not inferred opportunities to find a tactical motif.
export function trainedThemeRecurrence(games, username) {
  const themes = new Map();
  for (const game of games) {
    const color = ownColor(game, username);
    if (!color) continue;
    for (const attempt of game.learning?.attempts || []) {
      const move = game.moves[attempt.ply],
        mark = game.analysis?.moves?.[attempt.ply];
      if (!move || move.color !== color || !(mark?.loss >= 10) || !Number.isFinite(attempt.at))
        continue;
      const phase = phaseOf(move.fenBefore),
        speed = timeClass(game.headers.TimeControl);
      const reason = errorReason(
        move,
        game.analysis.positions?.[attempt.ply],
        game.analysis.positions?.[attempt.ply + 1],
      );
      const id = `${speed}:${phase}:${reason}`,
        prior = themes.get(id);
      if (!prior || attempt.at < prior.at)
        themes.set(id, {
          phase,
          speed,
          reason,
          at: attempt.at,
          games: 0,
          decisions: 0,
          errors: 0,
          examples: [],
        });
    }
  }
  for (const game of games) {
    const color = ownColor(game, username),
      rawDate = game.headers.UTCDate || game.headers.Date || '';
    if (!color || !game.analysis?.complete || !/^\d{4}\.\d{2}\.\d{2}$/.test(rawDate)) continue;
    const utcTime = game.headers.UTCDate && game.headers.UTCTime,
      time = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(utcTime || '') ? utcTime : '00:00:00',
      isoDate = rawDate.replaceAll('.', '-'),
      played = Date.parse(isoDate + 'T' + time + 'Z'),
      speed = timeClass(game.headers.TimeControl);
    if (!Number.isFinite(played) || new Date(played).toISOString().slice(0, 10) !== isoDate)
      continue;
    for (const theme of themes.values()) {
      if (!(played > theme.at) || theme.speed !== speed) continue;
      let decisions = 0;
      for (const [index, move] of game.moves.entries()) {
        const mark = game.analysis.moves?.[index];
        if (
          move.color !== color ||
          !(mark?.depth >= 12) ||
          !Number.isFinite(mark.loss) ||
          phaseOf(move.fenBefore) !== theme.phase
        )
          continue;
        decisions++;
        if (
          mark.loss >= 10 &&
          errorReason(
            move,
            game.analysis.positions?.[index],
            game.analysis.positions?.[index + 1],
          ) === theme.reason
        ) {
          theme.errors++;
          if (theme.examples.length < 3) theme.examples.push({ game, ply: index + 1 });
        }
      }
      theme.decisions += decisions;
      if (decisions) theme.games++;
    }
  }
  return [...themes.values()].sort((a, b) => b.errors - a.errors || b.games - a.games).slice(0, 6);
}
