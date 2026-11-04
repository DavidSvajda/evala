import test from 'node:test';
import assert from 'node:assert/strict';
import { localPerformancePlan } from '../src/study/local-performance.js';
import { LocalEnginePool } from '../src/study/local-engine-pool.js';
import { reviewGame } from '../src/study/review.js';
import { parsePgn } from '../src/study/game.js';
import { reviewCheckpoint } from '../src/study/review-checkpoint.js';
import { reviewState } from '../server/review-state.mjs';

const desktop = { hardwareConcurrency: 12, deviceMemory: 8 };
const pgn = '1. Nf3 Nf6 2. Nc3 Nc6 3. g3 g6 4. Bg2 Bg7 *';
const options = {
  engine: 'full',
  backend: 'local',
  time: 100,
  depth: 14,
  multipv: 2,
  refineLimit: 0,
  greatLimit: 0,
  specialLimit: 0,
};
const score = () => ({
  kind: 'cp',
  value: 0,
  depth: 14,
  nodes: 500,
  lines: [
    { kind: 'cp', value: 0, depth: 14, pv: [] },
    { kind: 'cp', value: 0, depth: 14, pv: [] },
  ],
});

test('automatic performance stays conservative on mobile, unknown memory and low-memory devices', () => {
  assert.equal(localPerformancePlan(options, desktop).workers, 2);
  assert.equal(localPerformancePlan({ ...options, computeMode: 'fast' }, desktop).workers, 4);
  for (const device of [
    {},
    { hardwareConcurrency: 16, deviceMemory: 2 },
    { ...desktop, userAgentData: { mobile: true } },
    { ...desktop, connection: { saveData: true } },
  ])
    assert.equal(localPerformancePlan(options, device).workers, 1);
  assert.equal(localPerformancePlan({ ...options, computeMode: 'eco' }, desktop).workers, 1);
});

test('independent engines bound concurrent work and fall back after secondary allocation failure', async () => {
  let active = 0,
    peak = 0,
    created = 0;
  const pool = new LocalEnginePool(() => {}, options, {
    device: desktop,
    createEngine: () => {
      const index = created++;
      return {
        dispose() {},
        async search() {
          if (index === 1) throw Error('allocation failed');
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 3));
          active--;
          return score();
        },
      };
    },
  });
  try {
    const results = await Promise.all([pool.search({}), pool.search({})]);
    assert.equal(results.length, 2);
    assert.equal(pool.parallelism, 1);
    assert.equal(created, 2);
    assert.ok(peak <= 2);
  } finally {
    pool.dispose();
  }
});

test('out-of-order results keep exact history, monotone progress and deterministic classifications', async () => {
  const a = parsePgn(pgn),
    b = parsePgn(pgn);
  let active = 0,
    peak = 0;
  const progress = [],
    seen = [];
  const parallel = {
    parallelism: 3,
    async search(request) {
      active++;
      peak = Math.max(peak, active);
      const i = request.history.moves.length;
      seen.push(i);
      assert.deepEqual(
        request.history.moves,
        a.moves.slice(0, i).map((m) => m.uci),
      );
      await new Promise((r) => setTimeout(r, i % 3 === 0 ? 8 : 1));
      active--;
      return score();
    },
  };
  await reviewGame(a, parallel, options, {
    onUpdate: (s) => {
      if (s.phase === 'positions') progress.push(s.index);
    },
  });
  await reviewGame(b, { search: async () => score() }, options);
  assert.equal(peak, 3);
  assert.equal(new Set(seen).size, a.fens.length);
  assert.deepEqual(
    progress,
    [...progress].sort((x, y) => x - y),
  );
  assert.deepEqual(a.analysis.positions, b.analysis.positions);
  assert.deepEqual(a.analysis.moves, b.analysis.moves);
});

test('cancelled parallel review retains completed positions and resumes without repeating them', async () => {
  const g = parsePgn(pgn),
    abort = new AbortController();
  let finished = 0;
  const e = {
    parallelism: 2,
    async search(request, { signal }) {
      await new Promise((r) => setTimeout(r, 3));
      if (signal.aborted) throw new DOMException('paused', 'AbortError');
      return score();
    },
  };
  await assert.rejects(
    reviewGame(g, e, options, {
      signal: abort.signal,
      onUpdate: (s) => {
        if (s.phase === 'positions' && s.processed === 2) {
          finished = 2;
          abort.abort();
        }
      },
    }),
    { name: 'AbortError' },
  );
  const saved = g.analysis.positions.filter(Boolean).length;
  assert.ok(saved >= finished && saved < g.fens.length);
  const calls = [];
  await reviewGame(
    g,
    {
      parallelism: 2,
      search: async (r) => {
        calls.push(r.history.moves.length);
        return score();
      },
    },
    options,
  );
  assert.equal(calls.length, g.fens.length - saved);
  assert.equal(g.analysis.complete, true);
});

test('checkpoints coalesce slow writes and flush partial progress explicitly', async () => {
  const calls = [];
  let release;
  const cp = reviewCheckpoint(
    {},
    async (g, o) => {
      calls.push(o);
      if (calls.length === 1) await new Promise((r) => (release = r));
    },
    { localMs: 0, remoteMs: 0 },
  );
  cp.update();
  await Promise.resolve();
  for (let i = 0; i < 20; i++) cp.update();
  assert.equal(calls.length, 1);
  release();
  await cp.flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].syncPartial, true);
});

test('resume metadata is bounded and cannot carry arbitrary client state', () => {
  const s = reviewState(
    {
      profile: 'balanced',
      options: { time: 500, depth: 20, multipv: 3 },
      refined: [-1, 1, 1, 900],
      refinedPositions: [0, 2, NaN],
      admin: true,
    },
    9,
  );
  assert.deepEqual(s.refined, [1]);
  assert.deepEqual(s.refinedPositions, [0, 2]);
  assert.equal(s.admin, undefined);
  assert.equal(s.options.depth, 20);
});
