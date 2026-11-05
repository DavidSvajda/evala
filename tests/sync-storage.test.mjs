import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { parsePgn } from '../src/study/game.js';

const values = new Map();
Object.assign(globalThis, {
  indexedDB,
  location: new URL('http://localhost/study.html?lang=cs'),
  document: new EventTarget(),
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  },
});
const { account, queueAccountPreferences, flushAccountPreferences, refreshAccount } =
  await import('../src/study/account.js');
const { setStorageIdentity, saveGame, loadLibrary, resolveGameConflict, gameConflictBackup } =
  await import('../src/study/storage.js');
const { cleanStudyKit } = await import('../src/training/study-kit.js');
const { mergeAccountPreferences } = await import('../src/core/account-preferences.js');

async function fixture() {
  const remote = new Map(),
    puts = [];
  let version = 0,
    intercept;
  account.user = { id: crypto.randomUUID(), generation: crypto.randomUUID(), preferences: {} };
  account.csrf = 'test';
  await setStorageIdentity(account.user);
  globalThis.fetch = async (url, options = {}) => {
    const id = url.split('/').at(-1);
    if (options.method === 'PUT') {
      const input = JSON.parse(options.body);
      puts.push(input);
      await intercept?.(input);
      if (remote.has(id) && input._remoteVersion !== remote.get(id)._remoteVersion)
        return Response.json({ error: 'Version conflict' }, { status: 409 });
      const game = { ...parsePgn(input.pgn), ...input, _remoteVersion: String(++version) };
      remote.set(id, game);
      return Response.json({ version: game._remoteVersion });
    }
    if (id === 'library')
      return Response.json({
        games: [...remote.values()].map((g) => ({ id: g.id, version: g._remoteVersion })),
      });
    if (remote.has(id)) return Response.json({ game: remote.get(id) });
    return Response.json({ error: 'Missing' }, { status: 404 });
  };
  return { remote, puts, intercept: (fn) => (intercept = fn) };
}

test('a stale game retains both versions, stops retrying 409 and can resolve either way', async () => {
  for (const choice of ['local', 'remote']) {
    const f = await fixture(),
      game = parsePgn('1. e4 e5 *');
    game.notes = 'Original';
    assert.equal((await saveGame(game)).status, 'synced');
    f.remote.set(game.id, {
      ...f.remote.get(game.id),
      notes: 'Phone notes',
      _remoteVersion: 'phone',
    });
    game.notes = 'PC notes';
    assert.equal((await saveGame(game)).status, 'conflict');
    let [loaded] = await loadLibrary();
    assert.equal(loaded.notes, 'PC notes');
    assert.equal(loaded._syncConflict.remote.notes, 'Phone notes');
    const before = f.puts.length;
    assert.equal((await saveGame(loaded)).status, 'conflict');
    assert.equal(f.puts.length, before);
    assert.equal((await resolveGameConflict(loaded, choice)).status, 'synced');
    [loaded] = await loadLibrary();
    assert.equal(loaded._syncPending, false);
    assert.equal(loaded._syncConflict, undefined);
    assert.equal(loaded.notes, choice === 'local' ? 'PC notes' : 'Phone notes');
    const backup = await gameConflictBackup(game.id);
    assert.equal(backup.local.notes, 'PC notes');
    assert.equal(backup.remote.notes, 'Phone notes');
    assert.equal(
      f.puts.some((p) => p._syncConflict || p._storageOwner),
      false,
    );
  }
});

test('library refresh detects a remote edit even when the local analysis is pending', async () => {
  const f = await fixture(),
    game = parsePgn('1. d4 d5 *');
  await saveGame(game);
  game.analysis = { complete: false, positions: [], moves: [] };
  game.notes = 'Local pending';
  assert.equal((await saveGame(game)).status, 'pending');
  f.remote.set(game.id, {
    ...f.remote.get(game.id),
    notes: 'Remote edit',
    _remoteVersion: 'phone',
  });
  const [loaded] = await loadLibrary();
  assert.equal(loaded.notes, 'Local pending');
  assert.equal(loaded._syncConflict.remote.notes, 'Remote edit');
});

test('choosing a version stops if the account changed again during comparison', async () => {
  const f = await fixture(),
    game = parsePgn('1. Nf3 d5 *');
  await saveGame(game);
  f.remote.set(game.id, { ...f.remote.get(game.id), notes: 'Phone one', _remoteVersion: 'phone1' });
  game.notes = 'PC';
  await saveGame(game);
  const [conflict] = await loadLibrary(),
    before = f.puts.length;
  f.remote.set(game.id, { ...f.remote.get(game.id), notes: 'Phone two', _remoteVersion: 'phone2' });
  assert.equal((await resolveGameConflict(conflict, 'local')).status, 'conflict');
  assert.equal(f.puts.length, before);
  const [latest] = await loadLibrary();
  assert.equal(latest.notes, 'PC');
  assert.equal(latest._syncConflict.remote.notes, 'Phone two');
});

test('schema migration retains a game from the previous local database', async () => {
  const user = { id: crypto.randomUUID(), generation: 'new', preferences: {} },
    game = parsePgn('1. b3 e5 *');
  game.notes = 'Existing local notes';
  const request = indexedDB.open('evala-study-' + user.id, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(game);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  account.user = user;
  await setStorageIdentity(user);
  globalThis.fetch = async () => Response.json({ games: [] });
  assert.equal((await loadLibrary())[0].notes, 'Existing local notes');
});

test('an old upload cannot overwrite a newer local save or claim it is synced', async () => {
  const f = await fixture(),
    game = parsePgn('1. c4 e5 *');
  let release, started;
  const ready = new Promise((resolve) => (started = resolve)),
    gate = new Promise((resolve) => (release = resolve));
  let first = true;
  f.intercept(async () => {
    if (first) {
      first = false;
      started();
      await gate;
    }
  });
  game.notes = 'First';
  const a = saveGame(game);
  await ready;
  game.notes = 'Second';
  const b = saveGame(game);
  release();
  assert.equal((await a).status, 'pending');
  assert.equal((await b).status, 'synced');
  assert.equal((await loadLibrary())[0].notes, 'Second');
  assert.equal(f.remote.get(game.id).notes, 'Second');
});

test('profile outbox rebases edits during a request and avoids oversized keepalive bodies', async () => {
  await fixture();
  const base = cleanStudyKit({
    tasks: Array.from({ length: 30 }, (_, i) => ({
      id: 't' + i,
      title: 'Task',
      fen: parsePgn('1. e4 *').fens[0],
      prompt: 'a'.repeat(900),
    })),
  });
  account.user.preferences = { studyKit: base };
  let serverPreferences = { studyKit: base },
    release,
    started,
    first = true;
  const ready = new Promise((resolve) => (started = resolve)),
    gate = new Promise((resolve) => (release = resolve)),
    requests = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/me'))
      return Response.json({
        user: { ...account.user, preferences: serverPreferences },
        csrf: 'test',
      });
    const sent = JSON.parse(options.body).preferences;
    requests.push({ sent, keepalive: options.keepalive });
    if (first) {
      first = false;
      started();
      await gate;
    }
    serverPreferences = mergeAccountPreferences(serverPreferences, sent);
    return Response.json({ user: { ...account.user, preferences: serverPreferences } });
  };
  queueAccountPreferences({ studyKit: { ...base, weeklyGoal: 4 } });
  const saving = flushAccountPreferences({ keepalive: true });
  await ready;
  queueAccountPreferences({ studyKit: { ...base, weeklyGoal: 5 }, sound: false });
  release();
  await saving;
  await flushAccountPreferences();
  assert.equal(requests[0].keepalive, false);
  assert.equal(requests[1].sent.studyKitBase.weeklyGoal, 4);
  assert.equal(serverPreferences.studyKit.weeklyGoal, 5);
  assert.equal(serverPreferences.sound, false);
  await refreshAccount(false);
  assert.equal(account.user.preferences.studyKit.weeklyGoal, 5);
  assert.equal(
    [...values.keys()].some((key) => key.startsWith('evala-preferences-pending:')),
    false,
  );
});

test('an offline study update survives a failed upload and account refresh', async () => {
  await fixture();
  const make = (id) =>
    cleanStudyKit({ tasks: [{ id, title: id, fen: parsePgn('1. e4 *').fens[0] }] });
  let preferences = { studyKit: make('phone') },
    offline = true;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/me'))
      return Response.json({ user: { ...account.user, preferences }, csrf: 'test' });
    if (offline) throw new Error('Offline');
    preferences = mergeAccountPreferences(preferences, JSON.parse(options.body).preferences);
    return Response.json({ user: { ...account.user, preferences } });
  };
  queueAccountPreferences({ studyKit: make('pc') });
  await assert.rejects(flushAccountPreferences(), /Offline/);
  await refreshAccount(false);
  assert.deepEqual(
    new Set(account.user.preferences.studyKit.tasks.map((t) => t.id)),
    new Set(['pc', 'phone']),
  );
  offline = false;
  await flushAccountPreferences();
  assert.deepEqual(new Set(preferences.studyKit.tasks.map((t) => t.id)), new Set(['pc', 'phone']));
});
