import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalEnginePool } from '../src/study/local-engine-pool.js';

const device = { hardwareConcurrency: 12, deviceMemory: 8 };
const options = { engine: 'full', computeMode: 'auto', hash: 64 };

test('preparation loads one engine without searching; preset/hash changes keep that instance', async () => {
  let created = 0,
    searches = 0;
  const pool = new LocalEnginePool(() => {}, options, {
    device,
    createEngine: () => {
      created++;
      return {
        async boot() {},
        async search() {
          searches++;
          return { nodes: 1 };
        },
        dispose() {},
      };
    },
  });
  try {
    await pool.warm();
    assert.equal(created, 1);
    assert.equal(searches, 0);
    const primary = pool.slots[0].engine;
    pool.configure({ ...options, hash: 128 });
    await pool.warm();
    pool.configure({ ...options, hash: 32 });
    await pool.search({});
    assert.equal(pool.slots[0].engine, primary);
    assert.equal(created, 1);
    pool.configure({ ...options, computeMode: 'eco' });
    assert.equal(pool.parallelism, 1);
    assert.equal(pool.slots[0].engine, primary);
  } finally {
    pool.dispose();
  }
});

test('idle cleanup releases extra NNUE workers first and retains the primary for a later analysis', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let created = 0;
  const pool = new LocalEnginePool(() => {}, options, {
    device,
    idleMs: 30000,
    primaryIdleMs: 180000,
    createEngine: () => {
      created++;
      return {
        async boot() {},
        async search() {
          return { nodes: 1 };
        },
        dispose() {},
      };
    },
  });
  try {
    await Promise.all([pool.search({}), pool.search({})]);
    assert.equal(created, 2);
    const primary = pool.slots[0].engine;
    t.mock.timers.tick(30001);
    assert.equal(pool.slots[1].engine, null);
    assert.equal(pool.slots[0].engine, primary);
    await pool.search({});
    assert.equal(created, 2);
    t.mock.timers.tick(180001);
    assert.equal(pool.slots[0].engine, null);
  } finally {
    pool.dispose();
  }
});

test('a failed preparation can be retried without retaining a broken worker', async () => {
  let created = 0;
  const pool = new LocalEnginePool(() => {}, options, {
    device,
    createEngine: () => {
      const first = created++ === 0;
      return {
        async boot() {
          if (first) throw Error('startup');
        },
        async search() {
          return {};
        },
        dispose() {},
      };
    },
  });
  try {
    await assert.rejects(pool.warm(), /startup/);
    await pool.warm();
    assert.equal(created, 2);
  } finally {
    pool.dispose();
  }
});
