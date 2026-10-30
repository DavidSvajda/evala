import { Chess } from 'chess.js';
import { phaseOf, errorReason, timeClass } from '../core/game-analytics.js';

export const ownColor = (game, name) =>
  ['w', 'b'].find(
    (c) => game.headers[c === 'w' ? 'White' : 'Black']?.toLowerCase() === name.trim().toLowerCase(),
  );
export const ownScore = (score, color) =>
  score?.kind === 'cp'
    ? score.value * (color === 'w' ? 1 : -1)
    : score?.kind === 'mate'
      ? Math.sign(score.value) * (color === 'w' ? 1 : -1) * 10000
      : null;
export const positionKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
export function cleanLearning(value, moves) {
  const notes = {};
  for (const [key, n] of Object.entries(value?.notes || {}).slice(0, 200)) {
    if (!/^\d+$/.test(key) || Number(key) > moves.length || !n || typeof n !== 'object') continue;
    notes[key] = {
      text: typeof n.text === 'string' ? n.text.slice(0, 1200) : '',
      critical: n.critical === true,
      plan: typeof n.plan === 'string' ? n.plan.slice(0, 800) : '',
      cause: ['unseen', 'calculation', 'time', 'plan'].includes(n.cause) ? n.cause : '',
    };
  }
  const attempts = (Array.isArray(value?.attempts) ? value.attempts : [])
    .filter(
      (a) =>
        a &&
        ['mixed', 'defense', 'conversion', 'opening'].includes(a.mode) &&
        Number.isInteger(a.ply) &&
        a.ply >= 0 &&
        a.ply < moves.length &&
        Number.isFinite(a.at) &&
        Number.isFinite(a.loss),
    )
    .slice(-100)
    .map((a) => ({
      mode: a.mode,
      ply: a.ply,
      at: Math.min(Date.now(), Math.max(0, a.at)),
      loss: Math.max(0, Math.min(20000, a.loss)),
      steps: Math.min(40, Math.max(1, Number(a.steps) || 1)),
      result: a.result === 'success' ? 'success' : 'practice',
    }));
  const variations = [];
  for (const v of (Array.isArray(value?.variations) ? value.variations : []).slice(0, 20)) {
    if (!Number.isInteger(v?.ply) || v.ply < 0 || v.ply >= moves.length || !Array.isArray(v.moves))
      continue;
    try {
      const chess = new Chess(moves[v.ply].fenBefore),
        line = [];
      for (const uci of v.moves.slice(0, 40)) {
        if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) break;
        try {
          chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        } catch {
          break;
        }
        line.push(uci);
      }
      if (line.length) variations.push({ ply: v.ply, moves: line });
    } catch {
      /* Invalid imported position cannot become a saved variation. */
    }
  }
  return { notes, attempts, variations, selfAnalysis: value?.selfAnalysis === true };
}

// Exact repeated positions only. We do not infer causality or motif transfer.
export function practiceFollowThrough(games, username) {
  const date = (game) => {
    const raw = game.headers.UTCDate || game.headers.Date || '';
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) return null;
    const stamp = Date.parse(raw.replaceAll('.', '-') + 'T00:00:00Z');
    return Number.isFinite(stamp) ? stamp : null;
  };
  const rows = [];
  const occurrences = new Map();
  for (const game of games) {
    const played = date(game),
      own = ownColor(game, username),
      seen = new Set();
    if (!played || !own || !game.analysis?.complete) continue;
    for (const [index, move] of game.moves.entries()) {
      const mark = game.analysis.moves?.[index];
      if (move.color !== own || !Number.isFinite(mark?.loss) || !(mark.depth >= 12)) continue;
      const key = timeClass(game.headers.TimeControl) + ':' + positionKey(move.fenBefore);
      if (seen.has(key)) continue;
      seen.add(key);
      const list = occurrences.get(key) || [];
      list.push({ game, ply: index + 1, loss: mark.loss, played });
      occurrences.set(key, list);
    }
  }
  for (const source of games) {
    const color = ownColor(source, username);
    if (!color) continue;
    const attempts = new Map();
    for (const a of source.learning?.attempts || []) {
      if (!Number.isFinite(a.at) || !source.moves[a.ply] || source.moves[a.ply].color !== color)
        continue;
      const old = attempts.get(a.ply);
      if (!old || a.at < old.at) attempts.set(a.ply, a);
    }
    for (const a of attempts.values()) {
      const key =
        timeClass(source.headers.TimeControl) + ':' + positionKey(source.moves[a.ply].fenBefore);
      // Exclude the same day: PGNs without exact timestamps cannot prove order.
      const examples = (occurrences.get(key) || []).filter(
        (e) => e.game.id !== source.id && e.played > a.at,
      );
      rows.push({
        source,
        ply: a.ply,
        at: a.at,
        examples,
        errors: examples.filter((e) => e.loss >= 10).length,
      });
    }
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, 12);
}
export function practicePositions(games, username, mode = 'mixed') {
  const pool = [],
    seen = new Set();
  for (const game of games) {
    const color = ownColor(game, username);
    if (!color) continue;
    for (const [ply, m] of game.moves.entries()) {
      const score = game.analysis?.positions?.[ply],
        mark = game.analysis?.moves?.[ply],
        value = ownScore(score, color);
      if (
        m.color !== color ||
        !score ||
        score.depth < 14 ||
        !score.lines?.[0]?.pv?.length ||
        value === null ||
        new Chess(m.fenBefore).isGameOver()
      )
        continue;
      if (mode === 'conversion' && !(value >= 200 && value <= 700 && ply >= 12)) continue;
      if (
        mode === 'defense' &&
        !(
          value >= -180 &&
          value <= 60 &&
          score.lines?.[1]?.depth >= 14 &&
          ownScore(score.lines[1], color) < value - 80
        )
      )
        continue;
      if (mode === 'opening' && ply >= 20) continue;
      if (mode === 'mixed' && (ply < 8 || Math.abs(value) > 250 || score.kind !== 'cp')) continue;
      const key = positionKey(m.fenBefore);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        game,
        ply,
        color,
        fen: m.fenBefore,
        value,
        score,
        mark,
        quiet:
          !/[x+#]/.test(m.san) &&
          Math.abs(value) < 80 &&
          Math.abs(ownScore(score.lines?.[1], color) - value) < 50,
      });
    }
  }
  return pool;
}
export function openingRepertoire(games, username) {
  const positions = new Map();
  for (const game of games) {
    const color = ownColor(game, username);
    if (!color) continue;
    for (const [ply, m] of game.moves.slice(0, 20).entries()) {
      if (m.color !== color) continue;
      const key = positionKey(m.fenBefore),
        row = positions.get(key) || {
          fen: m.fenBefore,
          game,
          ply,
          color,
          count: 0,
          moves: {},
          replies: {},
        };
      row.count++;
      row.moves[m.san] = (row.moves[m.san] || 0) + 1;
      const reply = game.moves[ply + 1]?.san;
      if (reply) row.replies[reply] = (row.replies[reply] || 0) + 1;
      positions.set(key, row);
    }
  }
  return [...positions.values()].sort((a, b) => b.count - a.count || a.ply - b.ply).slice(0, 30);
}
export function weaknessEvidence(games, username) {
  const eligible = games
    .filter((g) => ownColor(g, username) && g.analysis?.complete)
    .sort((a, b) => {
      const date = (g) =>
        Date.parse((g.headers.UTCDate || g.headers.Date || '').replaceAll('.', '-')) ||
        g.createdAt ||
        0;
      return date(b) - date(a);
    });
  const groups = new Map();
  for (const game of eligible) {
    const color = ownColor(game, username),
      speed = timeClass(game.headers.TimeControl);
    const bucket = groups.get(speed) || [];
    bucket.push({ game, color });
    groups.set(speed, bucket);
  }
  return [...groups].map(([speed, entries]) => {
    const sample = (items) => {
      const buckets = {};
      for (const { game, color } of items)
        for (const [ply, m] of game.moves.entries()) {
          const mark = game.analysis.moves[ply];
          if (m.color !== color || !mark) continue;
          const phase = phaseOf(m.fenBefore),
            b = (buckets[phase] ||= { moves: 0, errors: 0, examples: [] });
          b.moves++;
          if (mark.loss >= 10) {
            b.errors++;
            if (b.examples.length < 3)
              b.examples.push({
                game,
                ply: ply + 1,
                reason: errorReason(
                  m,
                  game.analysis.positions[ply],
                  game.analysis.positions[ply + 1],
                ),
              });
          }
        }
      return buckets;
    };
    return {
      speed,
      recentGames: Math.min(10, entries.length),
      priorGames: Math.max(0, Math.min(10, entries.length - 10)),
      recent: sample(entries.slice(0, 10)),
      prior: sample(entries.slice(10, 20)),
    };
  });
}
