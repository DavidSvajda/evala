import { Chess } from 'chess.js';
import { lineToSan } from './game.js';
import { gameAccuracy } from '../core/game-accuracy.js';

export const REVIEW_VERSION = 5;
export const SACRIFICE_VERSION = 3;
export const SPECIAL_DEPTH = 14;
export const currentReview = (game) =>
  !!game.analysis?.complete && game.analysis.version === REVIEW_VERSION;
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

const ownPercent = (score, color) =>
  color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);

export function specialReviewLimits(options = {}) {
  const count = (value, fallback, max) =>
    Number.isFinite(value) ? clamp(Math.floor(value), 0, max) : fallback;
  return {
    great: count(options.greatLimit, 4, 4),
    sacrifices: options.verifySacrifices === false ? 0 : count(options.specialLimit, 6, 8),
    positionTime: Math.max(1200, Math.min(2500, (options.time || 500) * 3)),
    proofTime: Math.max(800, Math.min(2400, (options.time || 500) * 2)),
  };
}

export function specialReviewBudget(options) {
  const limits = specialReviewLimits(options);
  return (
    (limits.great * 3 * limits.positionTime +
      limits.sacrifices * (2 * limits.positionTime + 3 * limits.proofTime)) /
    1000
  );
}

function greatReason(move, before, after, previous) {
  if (!before?.lines?.[1] || !after) return null;
  const best = ownPercent(before, move.color),
    next = ownPercent(after, move.color),
    second = ownPercent(before.lines[1], move.color),
    gap = best - second;
  if (next < 45 || best - next >= 2) return null;
  if (gap >= 12 && ((next >= 65 && second <= 55) || second <= 35))
    return {
      note: 'Jediný tah, který podle spočítaných alternativ zachovává výhru nebo drží pozici.',
      recovery: false,
    };
  if (previous && gap >= 6) {
    const prior = ownPercent(previous, move.color);
    if (best - prior >= 15 && ((prior <= 35 && next >= 47) || (prior <= 55 && next >= 70)))
      return {
        note: 'Využívá chybu soupeře a mění prohranou pozici na udržitelnou nebo vyrovnanou na vyhranou.',
        recovery: true,
      };
  }
  return null;
}

export function classifyMove(move, before, after, { previous } = {}) {
  if (!before || !after) return null;
  const sign = move.color === 'w' ? 1 : -1;
  const loss = Math.max(0, (expectedPercent(before) - expectedPercent(after)) * sign);
  const accuracy = clamp(103.1668 * Math.exp(-0.04354 * loss) - 3.1669, 0, 100);
  const best = before.lines?.[0]?.pv?.[0] === move.uci;
  const base = {
    loss,
    accuracy,
    best,
    depth: Math.min(before.depth || 0, after.terminal ? before.depth || 0 : after.depth || 0),
  };
  const own = (score) =>
    move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
  const second = before.lines?.[1];
  const great = greatReason(move, before, after, previous);
  if (
    best &&
    loss < 2 &&
    base.depth >= SPECIAL_DEPTH &&
    second?.depth >= SPECIAL_DEPTH &&
    (!great?.recovery || previous?.depth >= SPECIAL_DEPTH) &&
    great
  )
    return {
      ...base,
      kind: 'great',
      label: 'Skvělý tah',
      symbol: '!',
      note: great.note,
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
  const nonPawnMaterial = chess
    .board()
    .flat()
    .filter((p) => p && !['p', 'k'].includes(p.type))
    .reduce((sum, p) => sum + values[p.type], 0);
  // A sound sacrifice may be nearly best, an exchange, an interposition while
  // in check, or a quiet move offering a different piece. Uniqueness matters
  // in an endgame; it is not a blanket requirement in an attacking middlegame.
  return (
    chess.moves().length > 1 &&
    [before, after, before.lines[0], alternative].every((s) => s?.depth >= SPECIAL_DEPTH) &&
    own(after) >= 45 &&
    own(before) - own(after) <= 2 &&
    !(own(alternative) >= 90 && material(chess, move.color) >= 200) &&
    (nonPawnMaterial > 2600 || own(alternative) < 60)
  );
}

// Conservative static exchange test: a free recapture is not a sacrifice.
// This only nominates a candidate; an additional engine search must confirm it.
export function sacrificeCandidates(move) {
  const chess = new Chess(move.fenAfter),
    owner = move.color,
    baseline = material(new Chess(move.fenBefore), owner),
    candidates = [];
  // Include material won by the initial move and the entire legal exchange.
  // A rook for a bishop costs 170 centipawns, so a 200cp cutoff missed real
  // exchange sacrifices. Pawns alone do not qualify as a piece sacrifice.
  const exchange = (board, square, depth = 0) => {
    let score = material(board, owner);
    if (depth >= 8) return score;
    const maximize = board.turn() === owner;
    for (const m of board.moves({ verbose: true }).filter((m) => m.to === square && m.captured)) {
      board.move(m);
      const next = exchange(board, square, depth + 1);
      board.undo();
      score = maximize ? Math.max(score, next) : Math.min(score, next);
    }
    return score;
  };
  // Compare an unmoved piece to the threats that already existed. Merely
  // ignoring an unrelated hanging bishop must not badge every quiet move.
  const parts = move.fenBefore.split(' ');
  parts[1] = owner === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const prior = new Chess(parts.join(' ')),
    priorLoss = new Map();
  for (const capture of prior.moves({ verbose: true }).filter((m) => values[m.captured] >= 300)) {
    prior.move(capture);
    const loss = baseline - exchange(prior, capture.to);
    prior.undo();
    priorLoss.set(capture.to, Math.max(priorLoss.get(capture.to) || 0, loss));
  }
  for (const capture of chess
    .moves({ verbose: true })
    .filter((m) => m.captured && values[m.captured] >= 300)) {
    chess.move(capture);
    const capturedFen = chess.fen();
    const loss = baseline - exchange(chess, capture.to);
    if (loss >= 150 && (capture.to === move.to || loss > (priorLoss.get(capture.to) || 0) + 100))
      candidates.push({
        capture: capture.from + capture.to + (capture.promotion || ''),
        fen: capturedFen,
        materialLoss: loss,
      });
    chess.undo();
  }
  return candidates.sort((a, b) => b.materialLoss - a.materialLoss);
}

export function verifiedBrilliant(move, before, after, proof) {
  if (![2, SACRIFICE_VERSION].includes(proof?.version) || !brilliantEligible(move, before, after))
    return null;
  const candidates = sacrificeCandidates(move);
  if (!candidates.length || candidates.length > 3) return null;
  const own = (score) =>
    move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
  if (
    !candidates.every((c) => {
      const p = proof.captures?.find((p) => p.capture === c.capture);
      const terminalDraw =
        p?.score?.terminal &&
        p.score.kind === 'cp' &&
        p.score.value === 0 &&
        new Chess(c.fen).isStalemate();
      return (
        (p?.score?.depth >= SPECIAL_DEPTH || terminalDraw) &&
        own(p.score) >= 45 &&
        own(after) - own(p.score) <= 6
      );
    })
  )
    return null;
  return {
    kind: 'brilliant',
    label: 'Brilantní',
    symbol: '!!',
    note: 'Silný tah s ověřenou obětí figury nebo kvality. Engine potvrzuje kompenzaci po všech nalezených možnostech přijetí oběti.',
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

export function estimateGamePerformance(game, color) {
  if (!game.analysis?.complete) return { value: null, reason: 'Nejprve dokonči rozbor.' };
  const rating = Number(game.headers[color === 'w' ? 'WhiteElo' : 'BlackElo']);
  if (!Number.isFinite(rating) || rating < 100 || rating > 3500)
    return { value: null, reason: 'V PGN chybí Elo hráče.' };
  const informative = [],
    seen = new Set();
  for (let i = 8; i < game.moves.length; i++) {
    const move = game.moves[i],
      before = game.analysis.positions?.[i],
      after = game.analysis.positions?.[i + 1];
    if (
      move.color !== color ||
      ![before, after].every(
        (p) =>
          p &&
          ['cp', 'mate'].includes(p.kind) &&
          Number.isFinite(p.value) &&
          (p.terminal || (Number.isFinite(p.depth) && p.depth >= 12)),
      )
    )
      continue;
    const expected = expectedPercent(before);
    let choices;
    try {
      choices = new Chess(move.fenBefore).moves().length;
    } catch {
      continue;
    }
    if (expected < 2 || expected > 98 || choices <= 1) continue;
    const position = move.fenBefore.split(' ').slice(0, 4).join(' ');
    if (seen.has(position)) continue;
    seen.add(position);
    // Recompute from the actual scores: old saved classification versions and
    // refined positions must not silently change the meaning of the estimate.
    informative.push(classifyMove(move, before, after));
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
      method: 'evala-game-strength-v2',
      calibrated: false,
    };
  }
  return result;
}
export function summarize(game) {
  const list = game.analysis?.moves || [];
  const accuracy = gameAccuracy(game);
  return Object.fromEntries(
    ['w', 'b'].map((color) => {
      const marks = list.filter((m, i) => m && game.moves[i].color === color);
      const counts = {};
      for (const mark of marks) counts[mark.kind] = (counts[mark.kind] || 0) + 1;
      return [
        color,
        {
          accuracy: accuracy[color],
          accuracyMethod: accuracy.method,
          accuracyProvisional: accuracy.provisional,
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
    specialLimits: specialReviewLimits(options),
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
    // Search the child first so the root can reuse its tactical information.
    for (const index of [i + 1, i]) {
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
  const limits = specialReviewLimits(options);
  const deepen = async (index, alternatives = false) => {
    const current = report.positions[index];
    if (
      current?.terminal ||
      (current?.depth >= SPECIAL_DEPTH &&
        (!alternatives || current.lines?.[1]?.depth >= SPECIAL_DEPTH))
    )
      return;
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
            time: limits.positionTime,
            depth: Math.max(20, options.depth),
            multipv: Math.max(2, options.multipv),
          },
        },
        { signal },
      ),
    );
  };
  // Fast searches nominate candidates; they must not veto them merely for
  // lacking the very evidence that this bounded refinement is about to obtain.
  const greatNominees = report.moves
    .map((mark, i) => ({ mark, i }))
    .filter(
      ({ mark, i }) =>
        mark?.best &&
        greatReason(
          game.moves[i],
          report.positions[i],
          report.positions[i + 1],
          report.positions[i - 1],
        ),
    )
    .sort((a, b) => {
      const gap = ({ i }) =>
        Math.abs(
          expectedPercent(report.positions[i]) - expectedPercent(report.positions[i].lines[1]),
        );
      return gap(b) - gap(a);
    })
    .slice(0, limits.great);
  for (const { i } of greatNominees) {
    await deepen(i + 1);
    await deepen(i, true);
    if (i > 0 && report.positions[i - 1]?.depth < SPECIAL_DEPTH) await deepen(i - 1);
    publish('refine', i + 1, game.moves.length);
  }
  const nominees =
    options.verifySacrifices === false
      ? []
      : report.moves
          .map((mark, i) => ({ mark, i }))
          .filter(({ mark }) => mark?.loss < 5)
          .map((candidate) => ({
            ...candidate,
            sacrifices: sacrificeCandidates(game.moves[candidate.i]),
          }))
          .filter(({ sacrifices }) => sacrifices.length > 0 && sacrifices.length <= 3)
          .sort((a, b) => b.sacrifices[0].materialLoss - a.sacrifices[0].materialLoss)
          .slice(0, limits.sacrifices);
  let verified = 0;
  report.specials ||= [];
  for (const { i, sacrifices } of nominees) {
    if (signal?.aborted) throw new DOMException('Rozbor byl pozastaven.', 'AbortError');
    const move = game.moves[i];
    const ownExpected = (score) =>
      move.color === 'w' ? expectedPercent(score) : 100 - expectedPercent(score);
    // The second-best continuation matters: a winning best move can be the
    // only way to win. A winning score BEFORE it is not enough to reject it.
    await deepen(i + 1);
    await deepen(i, true);
    publish('brilliant', verified, nominees.length);
    if (!brilliantEligible(move, report.positions[i], report.positions[i + 1])) continue;
    verified++;
    publish('brilliant', verified, nominees.length);
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
            time: limits.proofTime,
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
        (!score.terminal && score.depth < SPECIAL_DEPTH) ||
        ownExpected(score) < 45 ||
        ownExpected(report.positions[i + 1]) - ownExpected(score) > 6
      )
        break;
    }
    const special = verifiedBrilliant(move, report.positions[i], report.positions[i + 1], proof);
    report.specials = report.specials.filter(([index]) => index !== i);
    if (special) report.specials.push([i, special]);
    publish('brilliant', verified, nominees.length);
  }
  report.complete = true;
  report.finishedAt = Date.now();
  publish('done', game.fens.length, game.fens.length);
  return report;
}
