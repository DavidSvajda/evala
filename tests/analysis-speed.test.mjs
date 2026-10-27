import test from 'node:test';
import assert from 'node:assert/strict';
import { StudyEngine } from '../src/study/uci.js';
import { parsePgn, DEMO_PGN } from '../src/study/game.js';
import { reviewGame, classifyMove } from '../src/study/review.js';
import { reviewProgressEncoder, applyReviewProgress } from '../src/study/review-stream.js';
import { remoteReview } from '../src/study/remote.js';

test('unchanged UCI options preserve Hash; changed settings and a restarted worker reconfigure it', async () => {
  const commands = [];
  const makeWorker = () => {
    const w = {
      terminate() {},
      postMessage(c) {
        commands.push(c);
        queueMicrotask(() => {
          if (c === 'uci') w.onmessage({ data: 'uciok' });
          if (c === 'isready') w.onmessage({ data: 'readyok' });
          if (c.startsWith('go ')) {
            w.onmessage({ data: 'info depth 14 score cp 20 pv e2e4 e7e5' });
            w.onmessage({ data: 'bestmove e2e4' });
          }
        });
      },
    };
    return w;
  };
  const e = new StudyEngine(makeWorker),
    g = parsePgn(DEMO_PGN),
    request = { fen: g.initialFen, settings: { hash: 64, multipv: 3, depth: 18, time: 750 } };
  try {
    await e.search(request);
    await e.search({ ...request, fen: g.fens[1] });
    assert.equal(commands.filter((c) => c.startsWith('setoption name Hash')).length, 1);
    assert.equal(commands.filter((c) => c === 'setoption name MultiPV value 3').length, 1);
    assert.deepEqual(
      commands.filter((c) => c.startsWith('go ')),
      ['go depth 18 movetime 750', 'go depth 18 movetime 750'],
    );
    await e.search({ ...request, settings: { ...request.settings, hash: 128 } });
    assert.equal(commands.filter((c) => c.startsWith('setoption name Hash')).length, 2);
    e.dispose();
    await e.search(request);
    assert.equal(commands.filter((c) => c.startsWith('setoption name Hash')).length, 3);
  } finally {
    e.dispose();
  }
});

test('adjacent critical moves share refinement searches and keep full history and identical labels', async () => {
  const g = parsePgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'),
    calls = [];
  const engine = {
    async search(r) {
      calls.push(r);
      const i = r.history.moves.length,
        value = i % 2 ? -500 : 0;
      assert.equal(r.fen, g.fens[i]);
      return {
        kind: 'cp',
        value,
        depth: r.settings.depth,
        lines: [
          { kind: 'cp', value, depth: r.settings.depth, pv: [g.moves[i]?.uci].filter(Boolean) },
        ],
      };
    },
  };
  await reviewGame(g, engine, {
    engine: 'full',
    backend: 'local',
    time: 100,
    depth: 14,
    multipv: 2,
    refineLimit: 4,
    verifySacrifices: false,
  });
  const refined = calls.filter((c) => c.settings.depth === 16),
    indices = refined.map((c) => c.history.moves.length);
  assert.ok(g.analysis.refined.length === 4);
  assert.ok(refined.length < 8);
  assert.equal(new Set(indices).size, indices.length);
  assert.ok(refined.every((r) => r.settings.time === 200 && r.settings.multipv === 2));
  assert.deepEqual(
    g.analysis.moves,
    g.moves.map((m, i) =>
      classifyMove(m, g.analysis.positions[i], g.analysis.positions[i + 1], {
        previous: g.analysis.positions[i - 1],
      }),
    ),
  );
});

test('result reuse requires the same session, full history, settings and fully reached depth', async () => {
  let searches = 0;
  const engine = new StudyEngine(() => {
    const w = {
      terminate() {},
      postMessage(c) {
        queueMicrotask(() => {
          if (c === 'uci') w.onmessage({ data: 'uciok' });
          if (c === 'isready') w.onmessage({ data: 'readyok' });
          if (c.startsWith('go ')) {
            searches++;
            for (let n = 1; n <= 3; n++)
              w.onmessage({ data: `info depth 20 multipv ${n} score cp 20 pv e2e4 e7e5` });
            w.onmessage({ data: 'bestmove e2e4' });
          }
        });
      },
    };
    return w;
  });
  const a = parsePgn('1. Nf3 Nf6 2. Nc3 Nc6 *'),
    b = parsePgn('1. Nc3 Nc6 2. Nf3 Nf6 *'),
    scope = {};
  assert.equal(a.fens.at(-1), b.fens.at(-1));
  const request = {
    fen: a.fens.at(-1),
    history: { initialFen: a.initialFen, moves: a.moves.map((m) => m.uci) },
    settings: { depth: 18, time: 500, multipv: 3 },
    cacheScope: scope,
  };
  try {
    const first = await engine.search(request),
      saved = structuredClone(first);
    first.lines[0].value = 999;
    assert.deepEqual(await engine.search(request), saved);
    assert.equal(searches, 1);
    await engine.search({ ...request, cacheScope: {} });
    assert.equal(searches, 2);
    await engine.search({
      ...request,
      history: { initialFen: b.initialFen, moves: b.moves.map((m) => m.uci) },
    });
    assert.equal(searches, 3);
    const deeper = { ...request, settings: { ...request.settings, depth: 22 } };
    await engine.search(deeper);
    await engine.search(deeper);
    assert.equal(searches, 5, 'time-limited shallow output is not cached');
    await engine.search({ ...request, settings: { ...request.settings, multipv: 2 } });
    assert.equal(searches, 6);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(engine.search(request, { signal: aborted.signal }), {
      name: 'AbortError',
    });
    engine.dispose();
    assert.equal(engine.cache.length, 0);
  } finally {
    engine.dispose();
  }
});

test('incremental progress reconstructs exact scores, lines and labels with less transport', async () => {
  const g = parsePgn(DEMO_PGN),
    copy = parsePgn(DEMO_PGN),
    encode = reviewProgressEncoder();
  let fullBytes = 0,
    deltaBytes = 0,
    updates = 0;
  const engine = {
    async search(r) {
      const i = r.history.moves.length;
      return {
        kind: 'cp',
        value: 0,
        depth: 18,
        lines: [1, 2, 3].map((multipv) => ({
          kind: 'cp',
          value: 0,
          depth: 18,
          multipv,
          pv: g.moves.slice(i, i + 12).map((m) => m.uci),
        })),
      };
    },
  };
  await reviewGame(
    g,
    engine,
    { engine: 'full', time: 500, depth: 20, multipv: 3, refineLimit: 0, verifySacrifices: false },
    {
      onUpdate: (update) => {
        const message = encode(update);
        fullBytes += JSON.stringify({ type: 'progress', ...update }).length;
        deltaBytes += JSON.stringify(message).length;
        // Simulate the wire: an object reference must not make this test pass.
        applyReviewProgress(copy, JSON.parse(JSON.stringify(message)));
        updates++;
      },
    },
  );
  assert.deepEqual(copy.analysis.positions, g.analysis.positions);
  assert.deepEqual(copy.analysis.moves, g.analysis.moves);
  assert.equal(copy.analysis.complete, true);
  assert.equal(copy.analysis.key, g.analysis.key);
  assert.ok(deltaBytes < fullBytes * 0.25);
  assert.ok(updates > 10);
  const snapshot = structuredClone(g.analysis);
  applyReviewProgress(copy, { report: snapshot });
  assert.equal(copy.analysis, snapshot, 'old servers stay compatible');
  assert.throws(
    () => applyReviewProgress(copy, { patch: { meta: {}, positions: [[999, null]], moves: [] } }),
    /rozboru/,
  );
  console.log(
    `Progress fixture: ${fullBytes} → ${deltaBytes} bytes (${Math.round(100 * (1 - deltaBytes / fullBytes))}% less).`,
  );
});

test('remote client applies streamed progress before the final snapshot arrives', async () => {
  const game = parsePgn('1. f3 e5 2. g4 Qh4# 0-1'),
    result = parsePgn(game.pgn),
    encode = reviewProgressEncoder();
  result.analysis = {
    key: 'stream-test',
    version: 4,
    engine: 'full',
    complete: false,
    positions: [{ kind: 'cp', value: 0, depth: 18, lines: [] }],
    moves: [null],
  };
  const frame = encode({
      phase: 'positions',
      index: 1,
      total: 5,
      processed: 1,
      elapsed: 1,
      report: result.analysis,
    }),
    oldFetch = globalThis.fetch;
  let progressSeen = false;
  result.analysis.complete = true;
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).streamVersion, 2);
    return new Response(
      JSON.stringify(frame) + '\n' + JSON.stringify({ type: 'game', game: result }) + '\n',
    );
  };
  try {
    await remoteReview('https://fixture.example', '', game, {
      onUpdate: () => {
        progressSeen = true;
        assert.equal(game.analysis.complete, false);
        assert.equal(game.analysis.positions[0].depth, 18);
      },
    });
    assert.equal(progressSeen, true);
    assert.equal(game.analysis.complete, true);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
