import { Chess } from 'chess.js';
import { lineToSan } from './game.js';

export const REVIEW_VERSION = 4;
export const SACRIFICE_VERSION = 2;
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function expectedPercent(score) {
  if (!score) return null;
  if (score.kind === 'mate') return score.value > 0 ? 100 : score.value < 0 ? 0 : 50;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.value)) - 1);
}
function material(chess, color) {
  return chess
    .board()
    .flat()
    .filter(Boolean)
    .reduce((sum, p) => sum + (p.color === color ? 1 : -1) * values[p.type], 0);
}

export function classifyMove(move, before, after, { previous } = {}) {
  if (!before || !after) return null;
  const sign = move.color === 'w' ? 1 : -1;
  const loss = Math.max(0, (expectedPercent(before) - expectedPercent(after)) * sign);
  const accuracy = clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100);
  const best = before.lines?.[0]?.pv?.[0] === move.uci;
  const base = { loss, accuracy, best, depth: Math.min(before.depth || 0, after.depth || 0) };
  const own = (score) =>
    move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
  const second = before.lines?.[1];
  if (
    best &&
    loss < 2 &&
    base.depth >= 14 &&
    second?.depth >= 14 &&
    own(after) >= 45 &&
    own(before) - own(second) >= 20
  )
    return {
      ...base,
      kind: 'great',
      label: 'Skvělý tah',
      symbol: '!',
      note: 'Výrazně lepší než druhá spočítaná varianta. Hloubka obou variant je alespoň 14.',
    };
  if (
    !best &&
    loss >= 10 &&
    ((before.kind === 'mate' &&
      before.value * sign > 0 &&
      !(after.kind === 'mate' && after.value * sign > 0)) ||
      (previous && own(before) >= 65 && own(after) < 55 && own(before) - own(previous) >= 10))
  )
    return {
      ...base,
      kind: 'miss',
      label: 'Promarněná šance',
      symbol: '×',
      note:
        before.kind === 'mate'
          ? 'Tah minul vynucený mat.'
          : 'Po chybě soupeře přišla příležitost, kterou tah nevyužil.',
    };
  if (best && loss < 5)
    return {
      ...base,
      kind: 'best',
      label: 'Nejlepší',
      symbol: '★',
      note: 'Zahraný tah odpovídá první variantě enginu.',
    };
  if (loss < 2)
    return {
      ...base,
      kind: 'excellent',
      label: 'Výborný',
      symbol: '✓',
      note: 'Zachovává téměř celé hodnocení pozice.',
    };
  if (loss < 5)
    return {
      ...base,
      kind: 'good',
      label: 'Dobrý',
      symbol: '',
      note: 'Rozumné pokračování s malou ztrátou hodnocení.',
    };
  if (loss < 10)
    return {
      ...base,
      kind: 'inaccuracy',
      label: 'Nepřesnost',
      symbol: '?!',
      note: 'Existovalo přesnější pokračování.',
    };
  if (loss < 20)
    return {
      ...base,
      kind: 'mistake',
      label: 'Chyba',
      symbol: '?',
      note: 'Tah citelně zhoršil vyhlídky v pozici.',
    };
  return {
    ...base,
    kind: 'blunder',
    label: 'Hrubá chyba',
    symbol: '??',
    note: 'Velká ztráta hodnocení. Projdi si doporučenou variantu.',
  };
}

export function brilliantEligible(move, before, after) {
  const own = (score) =>
    move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
  const alternative = before?.lines?.[1];
  if (!before || !after || !alternative) return false;
  if (!move.fenBefore) return false;
  const chess = new Chess(move.fenBefore);
  return (
    !chess.isCheck() &&
    chess.moves().length > 1 &&
    move.piece !== 'p' &&
    !move.promotion &&
    before.lines?.[0]?.pv?.[0] === move.uci &&
    [before, after, before.lines[0], alternative].every((s) => s.depth >= 18) &&
    own(alternative) < 75 &&
    own(after) >= 49 &&
    own(before) - own(alternative) >= 5 &&
    own(before) - own(after) <= 2
  );
}

// Conservative static exchange test: a free recapture is not a sacrifice.
// This only nominates a candidate; an additional engine search must confirm it.
export function sacrificeCandidates(move) {
  const chess = new Chess(move.fenAfter),
    owner = move.color,
    baseline = material(new Chess(move.fenBefore), owner),
    candidates = [];
  if (move.piece === 'p' || move.promotion) return candidates;
  // Only the moved piece may be offered. Include material won by the initial
  // move and the entire legal exchange, not just one immediate recapture.
  const exchange = (square, depth = 0) => {
    let score = material(chess, owner);
    if (depth >= 8) return score;
    const maximize = chess.turn() === owner;
    for (const m of chess.moves({ verbose: true }).filter((m) => m.to === square && m.captured)) {
      chess.move(m);
      const next = exchange(square, depth + 1);
      chess.undo();
      score = maximize ? Math.max(score, next) : Math.min(score, next);
    }
    return score;
  };
  for (const capture of chess
    .moves({ verbose: true })
    .filter((m) => m.to === move.to && m.captured && values[m.captured] >= 300)) {
    chess.move(capture);
    const capturedFen = chess.fen();
    const bestMaterial = exchange(capture.to);
    if (baseline - bestMaterial >= 200)
      candidates.push({
        capture: capture.from + capture.to + (capture.promotion || ''),
        fen: capturedFen,
        materialLoss: baseline - bestMaterial,
      });
    chess.undo();
  }
  return candidates.sort((a, b) => b.materialLoss - a.materialLoss);
}

export function verifiedBrilliant(move, before, after, proof) {
  if (proof?.version !== SACRIFICE_VERSION || !brilliantEligible(move, before, after)) return null;
  const candidates = sacrificeCandidates(move);
  if (!candidates.length || candidates.length > 3) return null;
  const own = (score) =>
    move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
  if (
    !candidates.every((c) => {
      const p = proof.captures?.find((p) => p.capture === c.capture);
      return p?.score?.depth >= 18 && own(p.score) >= 49 && own(after) - own(p.score) <= 3;
    })
  )
    return null;
  return {
    kind: 'brilliant',
    label: 'Brilantní*',
    symbol: '!!',
    note: 'Ověřená oběť zahrané figury: materiál po výměnách zůstává odevzdaný, všechny legální možnosti přijetí mají potvrzenou kompenzaci. Vlastní přísná klasifikace Evala.',
    proof: {
      version: SACRIFICE_VERSION,
      captures: candidates.map((c) => {
        const p = proof.captures.find((p) => p.capture === c.capture);
        return {
          capture: c.capture,
          score: p.score,
          continuation: lineToSan(move.fenAfter, [c.capture, ...(p.score.lines?.[0]?.pv || [])], 9),
        };
      }),
    },
  };
}

// Old labels are not evidence. Rebuild them from positions and a current proof
// on both local loads and account reads/writes, including unchanged revisions.
export function normalizeReview(game) {
  const a = game.analysis;
  if (!a) return game;
  const prior = a.moves || [],
    specials = a.specials || [];
  a.moves = game.moves.map((m, i) => {
    const base = classifyMove(m, a.positions?.[i], a.positions?.[i + 1], {
      previous: a.positions?.[i - 1],
    });
    if (!base) return null;
    const proof = prior[i]?.proof || specials.find(([index]) => index === i)?.[1]?.proof;
    return { ...base, ...verifiedBrilliant(m, a.positions?.[i], a.positions?.[i + 1], proof) };
  });
  a.specials = a.moves.flatMap((m, i) => (m?.kind === 'brilliant' ? [[i, m]] : []));
  a.classificationVersion = REVIEW_VERSION;
  return game;
}

const performanceCache = new WeakMap();
export function estimateGamePerformance(game, color) {
  if (!game.analysis?.complete) return { value: null, reason: 'Nejprve dokonči rozbor.' };
  const cached = performanceCache.get(game.analysis);
  if (cached?.[color]) return cached[color];
  const rating = Number(game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']);
  if (!Number.isFinite(rating) || rating < 100 || rating > 3500)
    return { value: null, reason: 'V PGN chybí Elo hráče.' };
  const informative = [],
    seen = new Set();
  for (let i = 8; i < game.moves.length; i++) {
    const move = game.moves[i],
      mark = game.analysis.moves[i],
      before = game.analysis.positions[i];
    if (
      move.color !== color ||
      !mark ||
      !Number.isFinite(mark.accuracy) ||
      !before ||
      before.depth < 12
    )
      continue;
    const expected = expectedPercent(before);
    if (expected < 2 || expected > 98 || new Chess(move.fenBefore).moves().length <= 1) continue;
    const position = move.fenBefore.split(' ').slice(0, 4).join(' ');
    if (seen.has(position)) continue;
    seen.add(position);
    informative.push(mark);
  }
  let result;
  if (informative.length < 12)
    result = {
      value: null,
      reason: `Málo podkladů (${informative.length}/12 rozhodnutí).`,
      sample: informative.length,
    };
  else {
    // An explicit, uncalibrated per-game heuristic, anchored to the PGN rating.
    // Its range is an indication of uncertainty, not a statistical confidence interval.
    const quality = informative.reduce((n, m) => n + m.accuracy, 0) / informative.length;
    const expectedQuality = clamp(55 + rating * 0.015, 60, 95);
    const reliability = informative.length / (informative.length + 15);
    const value =
      Math.round(clamp(rating + (quality - expectedQuality) * 24 * reliability, 100, 3500) / 50) *
      50;
    const reserve = Math.max(250, Math.round((600 - informative.length * 5) / 50) * 50);
    result = {
      value,
      low: Math.max(100, value - reserve),
      high: Math.min(3500, value + reserve),
      sample: informative.length,
      baseline: rating,
      quality,
      method: 'evala-game-strength-v1',
      calibrated: false,
    };
  }
  performanceCache.set(game.analysis, { ...cached, [color]: result });
  return result;
}
export function summarize(game) {
  const list = game.analysis?.moves || [];
  return Object.fromEntries(
    ['w', 'b'].map((color) => {
      const marks = list.filter((m, i) => m && game.moves[i].color === color);
      const counts = {};
      for (const mark of marks) counts[mark.kind] = (counts[mark.kind] || 0) + 1;
      return [
        color,
        {
          accuracy: marks.length ? marks.reduce((n, m) => n + m.accuracy, 0) / marks.length : null,
          count: marks.length,
          counts,
          performance: estimateGamePerformance(game, color),
          blunders: marks.filter((m) => m.loss >= 20).length,
          mistakes: marks.filter((m) => m.loss >= 10 && m.loss < 20).length,
          brilliants: marks.filter((m) => m.kind === 'brilliant').length,
        },
      ];
    }),
  );
}

export async function reviewGame(game, engine, options, { signal, onUpdate } = {}) {
  const key = JSON.stringify({
    version: REVIEW_VERSION,
    pipeline: 2,
    engine: options.engine,
    backend: options.backend,
    server: options.backend === 'server' ? options.serverUrl : '',
    depth: options.depth,
    time: options.time,
    multipv: options.multipv,
    refineLimit: options.refineLimit ?? 8,
    verifySacrifices: options.verifySacrifices !== false,
  });
  if (game.analysis?.key !== key)
    game.analysis = {
      key,
      version: REVIEW_VERSION,
      positions: [],
      moves: [],
      complete: false,
      engine: options.engine,
      options: { depth: options.depth, time: options.time, multipv: options.multipv },
      startedAt: Date.now(),
    };
  const report = game.analysis,
    start = performance.now(),
    gameKey = game.initialFen + '|' + game.moves.map((m) => m.uci).join(' ');
  let processed = 0;
  const dirty = new Set(game.moves.map((_, i) => i));
  const setPosition = (i, result) => {
    report.positions[i] = result;
    // A score is the before/after/previous position of only three moves.
    for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < game.moves.length) dirty.add(j);
  };
  const publish = (phase, index, total) => {
    for (const i of dirty)
      report.moves[i] = classifyMove(game.moves[i], report.positions[i], report.positions[i + 1], {
        previous: report.positions[i - 1],
      });
    dirty.clear();
    for (const [i, mark] of report.specials || [])
      if (report.moves[i]) {
        const special = verifiedBrilliant(
          game.moves[i],
          report.positions[i],
          report.positions[i + 1],
          mark.proof,
        );
        if (special) report.moves[i] = { ...report.moves[i], ...special };
      }
    onUpdate?.({ phase, index, total, processed, elapsed: performance.now() - start, report });
  };
  for (let i = 0; i < game.fens.length; i++) {
    if (signal?.aborted) throw new DOMException('Rozbor byl pozastaven.', 'AbortError');
    if (report.positions[i]) {
      publish('positions', i + 1, game.fens.length);
      continue;
    }
    const history = {
      initialFen: game.initialFen,
      moves: game.moves.slice(0, i).map((m) => m.uci),
    };
    setPosition(
      i,
      await engine.search(
        { cacheScope: options.cacheScope, gameKey, fen: game.fens[i], history, settings: options },
        { signal },
      ),
    );
    processed++;
    publish('positions', i + 1, game.fens.length);
  }
  // Recheck only critical positions, bounded to avoid hours of extra work.
  const critical = report.moves
    .map((mark, i) => ({ mark, i }))
    .filter(({ mark }) => mark && mark.loss >= 5)
    .sort((a, b) => b.mark.loss - a.mark.loss)
    .slice(0, Math.max(0, Math.min(8, options.refineLimit ?? 8)));
  report.refined ||= [];
  report.refinedPositions ||= [];
  for (const [n, { i }] of critical.entries()) {
    if (report.refined.includes(i)) continue;
    for (const index of [i, i + 1]) {
      if (report.refinedPositions.includes(index)) continue;
      setPosition(
        index,
        await engine.search(
          {
            cacheScope: options.cacheScope,
            gameKey,
            fen: game.fens[index],
            history: {
              initialFen: game.initialFen,
              moves: game.moves.slice(0, index).map((m) => m.uci),
            },
            settings: {
              ...options,
              time: Math.min(5000, options.time * 2),
              depth: Math.min(30, options.depth + 2),
            },
          },
          { signal },
        ),
      );
      report.refinedPositions.push(index);
    }
    report.refined.push(i);
    publish('refine', n + 1, critical.length);
  }
  const nominees =
    options.verifySacrifices === false
      ? []
      : report.moves
          .map((mark, i) => ({ mark, i }))
          .filter(({ mark, i }) => mark?.loss < 2 && mark.best && game.moves[i].piece !== 'p');
  let verified = 0;
  report.specials ||= [];
  for (const [scan, { i }] of nominees.entries()) {
    if (signal?.aborted) throw new DOMException('Rozbor byl pozastaven.', 'AbortError');
    if (scan && scan % 12 === 0) await new Promise((done) => setTimeout(done, 0));
    if (verified >= 6) break;
    const move = game.moves[i];
    const ownExpected = (score) =>
      move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
    // The second-best continuation matters: a winning best move can be the
    // only way to win. A winning score BEFORE it is not enough to reject it.
    if (!brilliantEligible(move, report.positions[i], report.positions[i + 1])) continue;
    const sacrifices = sacrificeCandidates(move);
    if (!sacrifices.length) continue;
    if (sacrifices.length > 3) continue;
    verified++;
    publish('brilliant', verified, Math.min(6, nominees.length));
    const proof = { version: SACRIFICE_VERSION, captures: [] };
    for (const candidate of sacrifices) {
      const score = await engine.search(
        {
          cacheScope: options.cacheScope,
          gameKey,
          fen: candidate.fen,
          history: {
            initialFen: game.initialFen,
            moves: [...game.moves.slice(0, i + 1).map((m) => m.uci), candidate.capture],
          },
          settings: {
            ...options,
            time: Math.max(1200, options.time * 2),
            depth: Math.max(20, options.depth),
            multipv: 1,
          },
        },
        { signal },
      );
      proof.captures.push({
        capture: candidate.capture,
        score,
        continuation: lineToSan(candidate.fen, score.lines?.[0]?.pv || [], 8),
      });
      if (
        score.depth < 18 ||
        ownExpected(score) < 49 ||
        ownExpected(report.positions[i + 1]) - ownExpected(score) > 3
      )
        break;
    }
    const special = verifiedBrilliant(move, report.positions[i], report.positions[i + 1], proof);
    report.specials = report.specials.filter(([index]) => index !== i);
    if (special) report.specials.push([i, special]);
    publish('brilliant', verified, Math.min(6, nominees.length));
  }
  report.complete = true;
  report.finishedAt = Date.now();
  publish('done', game.fens.length, game.fens.length);
  return report;
}
