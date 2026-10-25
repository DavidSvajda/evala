import { account, accountRequest } from './account.js';
import { normalizeReview } from './review.js';
let opening;
let owner = 'guest',
  generation = 'guest';
const saves = new Map();
export let lastSyncStatus = { message: '', error: false };
export async function setStorageIdentity(user) {
  const previous = opening,
    target = user?.id || 'guest';
  owner = target;
  generation = user?.generation || 'legacy';
  opening = null;
  lastSyncStatus = { message: '', error: false };
  await previous?.then((db) => db.close()).catch(() => {});
  if (!user?.generation || owner !== target || generation !== user.generation) return;
  const key = 'evala-generation:' + target,
    known = localStorage.getItem(key);
  if (known && known !== user.generation) {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    for (const prefix of ['evala-study-options:', 'evala-display:', 'evala-training:'])
      localStorage.removeItem(prefix + target);
  }
  if (owner === target && generation === user.generation)
    localStorage.setItem(key, user.generation);
}
function database() {
  if (!opening)
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(owner === 'guest' ? 'evala-study' : 'evala-study-' + owner, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(new Error('Prohlížeč nepovolil lokální knihovnu. Zkontroluj nastavení úložiště.'));
    });
  return opening;
}
async function localGames(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games'),
      r = tx.objectStore('games').getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function localSave(db, game) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(game);
    tx.oncomplete = resolve;
    tx.onerror = () =>
      reject(new Error('Partii se nepodařilo uložit. Exportuj PGN a uvolni místo v prohlížeči.'));
  });
}
const syncStatus = (message, error = false) => {
  lastSyncStatus = { message, error };
  document.dispatchEvent(new CustomEvent('evala:sync', { detail: lastSyncStatus }));
};
export async function loadLibrary() {
  const active = owner,
    activeGeneration = generation,
    db = await database(),
    local = await localGames(db);
  const current = () => owner === active && generation === activeGeneration;
  if (!current()) return [];
  if (account.user && active === account.user.id) {
    try {
      const { games: remote } = await accountRequest('library');
      if (!current()) return [];
      const byId = new Map(local.map((g) => [g.id, g]));
      for (const item of remote) {
        const saved = byId.get(item.id);
        if (saved?._syncPending) continue;
        if (!saved || saved._remoteVersion !== item.version) {
          const { game } = await accountRequest('library/' + item.id);
          if (!current()) return [];
          game._storageOwner = active;
          game._storageGeneration = activeGeneration;
          await localSave(db, game);
          byId.set(item.id, game);
        }
      }
      const remoteIds = new Set(remote.map((g) => g.id));
      for (const saved of local)
        if (!remoteIds.has(saved.id) && saved._remoteVersion && !saved._syncPending) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('games', 'readwrite');
            tx.objectStore('games').delete(saved.id);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
          byId.delete(saved.id);
        }
      const pending = [...byId.values()].some((g) => g._syncPending);
      syncStatus(pending ? 'Některé partie čekají na synchronizaci.' : 'Synchronizováno', pending);
      return [...byId.values()].map(normalizeReview).sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      if (!current()) return [];
      syncStatus(error.message, true);
    }
  }
  return local
    .map((g) =>
      normalizeReview({ ...g, _storageOwner: active, _storageGeneration: activeGeneration }),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}
export async function saveGame(game) {
  const active = owner,
    activeGeneration = generation;
  if (
    (game._storageOwner && game._storageOwner !== active) ||
    (game._storageGeneration && game._storageGeneration !== activeGeneration)
  )
    return;
  game._storageOwner = active;
  game._storageGeneration = activeGeneration;
  const db = await database();
  game._syncPending = active !== 'guest';
  await localSave(db, game);
  if (!account.user || active !== account.user.id || (game.analysis && !game.analysis.complete))
    return;
  const key = active + ':' + game.id,
    previous = saves.get(key) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      if (owner !== active || generation !== activeGeneration || account.user?.id !== active)
        return;
      try {
        const { version } = await accountRequest('library/' + game.id, {
          method: 'PUT',
          body: game,
        });
        if (owner !== active || generation !== activeGeneration) return;
        game._remoteVersion = version;
        game._syncPending = false;
        await localSave(db, game);
        syncStatus('Synchronizováno');
      } catch (error) {
        if (owner === active && generation === activeGeneration) syncStatus(error.message, true);
      }
    });
  saves.set(key, task);
  await task;
  if (saves.get(key) === task) saves.delete(key);
}
export async function removeGame(id) {
  const db = await database();
  if (account.user) await accountRequest('library/' + id, { method: 'DELETE' });
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function clearAccountCache() {
  if (owner === 'guest') return;
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function migrateGuestGames() {
  if (!account.user) return 0;
  const target = account.user.id,
    targetGeneration = generation;
  const request = indexedDB.open('evala-study', 1),
    db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const games = await localGames(db);
  db.close();
  const existing = new Set((await accountRequest('library')).games.map((g) => g.id));
  let count = 0;
  for (const game of games) {
    if (owner !== target || generation !== targetGeneration || account.user?.id !== target)
      throw new DOMException('Přihlášení se změnilo. Přenos byl zastaven.', 'AbortError');
    if (existing.has(game.id)) continue;
    delete game._remoteVersion;
    game._storageOwner = target;
    game._storageGeneration = targetGeneration;
    await saveGame(game);
    if (game._syncPending)
      throw new Error(
        lastSyncStatus.error
          ? lastSyncStatus.message
          : 'Partie čekají na synchronizaci. Zkontroluj připojení a zkus to znovu.',
      );
    count++;
  }
  return count;
}

export const STUDY_DEFAULTS = {
  engine: 'full',
  depth: 18,
  time: 750,
  multipv: 3,
  hash: 64,
  profile: 'balanced',
  arrows: true,
  backend: 'local',
  serverUrl: '',
};
const optionsKey = () =>
  owner === 'guest' ? 'evala-study-options' : 'evala-study-options:' + owner;
export function getPreferences(defaults = {}) {
  try {
    return {
      ...STUDY_DEFAULTS,
      ...defaults,
      ...JSON.parse(localStorage.getItem(optionsKey()) || '{}'),
    };
  } catch {
    return { ...STUDY_DEFAULTS, ...defaults };
  }
}
export function savePreferences(settings) {
  const { token, ...safe } = settings;
  localStorage.setItem(optionsKey(), JSON.stringify(safe));
}
