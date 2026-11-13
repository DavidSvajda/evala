import { account, accountRequest } from './account.js';
import { normalizeReview } from './review.js';
import { queueAccountPreferences } from './account.js';
import { portableStudySettings } from '../core/account-preferences.js';
let opening;
let owner = 'guest',
  generation = 'guest';
const saves = new Map();
const uploadedVersions = new Map();
export let lastSyncStatus = { message: '', error: false };
export async function setStorageIdentity(user) {
  const previous = opening,
    target = user?.id || 'guest';
  owner = target;
  generation = user?.generation || 'legacy';
  uploadedVersions.clear();
  opening = null;
  lastSyncStatus = { message: '', error: false };
  await previous?.then((db) => db.close()).catch(() => {});
  if (!user?.generation || owner !== target || generation !== user.generation) return;
  const key = 'evala-generation:' + target,
    known = localStorage.getItem(key);
  if (known && known !== user.generation) {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['games', 'conflicts'], 'readwrite');
      tx.objectStore('games').clear();
      tx.objectStore('conflicts').clear();
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
      const request = indexedDB.open(owner === 'guest' ? 'evala-study' : 'evala-study-' + owner, 2);
      let blocked = false;
      request.onupgradeneeded = () => {
        for (const name of ['games', 'conflicts'])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        if (blocked) db.close();
        else resolve(db);
      };
      request.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            'Zavři ostatní záložky Evaly a obnov stránku pro dokončení aktualizace úložiště.',
          ),
        );
      };
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
function updateLocal(db, id, change) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readwrite'),
      store = tx.objectStore('games'),
      request = store.get(id);
    let updated;
    request.onsuccess = () => {
      updated = change(request.result);
      if (updated) store.put(updated);
    };
    tx.oncomplete = () => resolve(updated);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function localGame(db, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('games').objectStore('games').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const cloudGame = (game) => ({
  pgn: game.pgn,
  createdAt: game.createdAt,
  notes: game.notes,
  learning: game.learning,
  analysis: game.analysis,
  _remoteVersion: game._remoteVersion,
});
const conflictMessage = 'Partie má dvě verze. Otevři Moje partie a vyřeš konflikt.';
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
      const downloads = remote.filter((item) => {
        const saved = byId.get(item.id);
        return (
          (!saved || saved._remoteVersion !== item.version) &&
          saved?._syncConflict?.remote?._remoteVersion !== item.version
        );
      });
      let cursor = 0;
      const results = await Promise.allSettled(
        Array.from({ length: Math.min(4, downloads.length) }, async () => {
          while (cursor < downloads.length && current()) {
            const item = downloads[cursor++];
            const { game } = await accountRequest('library/' + item.id);
            if (!current()) return;
            game._storageOwner = active;
            game._storageGeneration = activeGeneration;
            const updated = await updateLocal(db, game.id, (saved) => {
              if (!current()) return;
              if (saved?._syncPending)
                return saved._remoteVersion === game._remoteVersion
                  ? saved
                  : { ...saved, _syncConflict: { remote: game }, _hasSyncBackup: true };
              return { ...game, _hasSyncBackup: saved?._hasSyncBackup || false };
            });
            if (updated) byId.set(item.id, updated);
          }
        }),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      if (!current()) return [];
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
      const conflict = [...byId.values()].some((g) => g._syncConflict);
      syncStatus(
        conflict
          ? conflictMessage
          : pending
            ? 'Některé partie čekají na synchronizaci.'
            : 'Synchronizováno',
        pending,
      );
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
export async function saveGame(game, { syncPartial = false } = {}) {
  const active = owner,
    activeGeneration = generation;
  if (
    (game._storageOwner && game._storageOwner !== active) ||
    (game._storageGeneration && game._storageGeneration !== activeGeneration)
  )
    return { status: 'stale' };
  game._storageOwner = active;
  game._storageGeneration = activeGeneration;
  const db = await database();
  if (owner !== active || generation !== activeGeneration) return { status: 'stale' };
  game._syncPending = active !== 'guest';
  game._syncRevision = crypto.randomUUID();
  const snapshot = structuredClone(game);
  await localSave(db, snapshot);
  if (game._syncConflict && active !== 'guest') {
    syncStatus(conflictMessage, true);
    return { status: 'conflict' };
  }
  if (
    !account.user ||
    active !== account.user.id ||
    (game.analysis && !game.analysis.complete && !syncPartial)
  )
    return { status: active === 'guest' ? 'local' : 'pending' };
  const key = active + ':' + activeGeneration + ':' + game.id,
    previous = saves.get(key) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      if (owner !== active || generation !== activeGeneration || account.user?.id !== active)
        return { status: 'stale' };
      try {
        const saved = await localGame(db, game.id);
        if (!saved || owner !== active || generation !== activeGeneration)
          return { status: 'stale' };
        if (saved._syncConflict) return { status: 'conflict' };
        const uploaded = uploadedVersions.get(key);
        if (uploaded?.bases.has(snapshot._remoteVersion))
          snapshot._remoteVersion = uploaded.version;
        const { version } = await accountRequest('library/' + game.id, {
          method: 'PUT',
          body: cloudGame(snapshot),
        });
        if (owner !== active || generation !== activeGeneration) return { status: 'stale' };
        const bases = uploaded?.bases || new Set();
        bases.add(snapshot._remoteVersion);
        uploadedVersions.set(key, { version, bases });
        game._remoteVersion = version;
        const latest = await updateLocal(
          db,
          game.id,
          (saved) =>
            saved && {
              ...saved,
              _remoteVersion: version,
              _syncPending: saved._syncRevision !== snapshot._syncRevision,
            },
        );
        game._syncPending = latest?._syncPending ?? true;
        syncStatus(
          game._syncPending ? 'Některé partie čekají na synchronizaci.' : 'Synchronizováno',
          game._syncPending,
        );
        return { status: game._syncPending ? 'pending' : 'synced' };
      } catch (error) {
        if (owner !== active || generation !== activeGeneration) return { status: 'stale' };
        if (error.status === 409) {
          uploadedVersions.delete(key);
          try {
            const { game: remote } = await accountRequest('library/' + game.id);
            if (owner !== active || generation !== activeGeneration) return { status: 'stale' };
            await updateLocal(
              db,
              game.id,
              (saved) => saved && { ...saved, _syncConflict: { remote }, _hasSyncBackup: true },
            );
            game._syncConflict = { remote };
            game._hasSyncBackup = true;
            syncStatus(conflictMessage, true);
            return { status: 'conflict' };
          } catch (refreshError) {
            syncStatus(refreshError.message, true);
            return { status: 'pending', error: refreshError };
          }
        }
        syncStatus(error.message, true);
        return { status: 'pending', error };
      }
    });
  saves.set(key, task);
  const result = await task;
  if (saves.get(key) === task) saves.delete(key);
  return result;
}

export async function gameConflictBackup(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('conflicts').objectStore('conflicts').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function resolveGameConflict(game, choice) {
  if (!['local', 'remote'].includes(choice)) throw new Error('Neplatná volba verze.');
  const active = owner,
    activeGeneration = generation,
    db = await database();
  const current = () =>
    owner === active && generation === activeGeneration && account.user?.id === active;
  if (!current() || game._storageOwner !== active || game._storageGeneration !== activeGeneration)
    throw new Error('Přihlášení se změnilo.');
  await Promise.allSettled([...saves.values()]);
  const { game: remote } = await accountRequest('library/' + game.id);
  if (!current()) throw new Error('Přihlášení se změnilo.');
  if (remote._remoteVersion !== game._syncConflict?.remote?._remoteVersion) {
    await updateLocal(
      db,
      game.id,
      (saved) => saved && { ...saved, _syncConflict: { remote }, _hasSyncBackup: true },
    );
    syncStatus('Verze v účtu se znovu změnila. Porovnej aktuální verze.', true);
    return { status: 'conflict' };
  }
  let resolved;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['games', 'conflicts'], 'readwrite'),
      store = tx.objectStore('games'),
      request = store.get(game.id);
    request.onsuccess = () => {
      const local = request.result;
      if (!current() || !local?._syncConflict || local._syncRevision !== game._syncRevision) {
        tx.abort();
        return;
      }
      tx.objectStore('conflicts').put({
        id: game.id,
        at: Date.now(),
        local: cloudGame(local),
        remote: cloudGame(remote),
      });
      resolved = choice === 'local' ? { ...local } : { ...remote };
      delete resolved._syncConflict;
      Object.assign(resolved, {
        _remoteVersion: remote._remoteVersion,
        _syncPending: choice === 'local',
        _hasSyncBackup: true,
        _storageOwner: active,
        _storageGeneration: activeGeneration,
        _syncRevision: crypto.randomUUID(),
      });
      store.put(resolved);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Místní verze se změnila. Otevři konflikt znovu.'));
  });
  uploadedVersions.delete(active + ':' + activeGeneration + ':' + game.id);
  if (choice === 'local') return saveGame(resolved, { syncPartial: true });
  syncStatus('Synchronizováno');
  return { status: 'synced' };
}
export async function removeGame(id) {
  const db = await database();
  if (account.user) await accountRequest('library/' + id, { method: 'DELETE' });
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['games', 'conflicts'], 'readwrite');
    tx.objectStore('games').delete(id);
    tx.objectStore('conflicts').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function removeGames(ids) {
  const active = owner,
    activeGeneration = generation,
    db = await database();
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 200) throw new Error('Invalid game selection.');
  await Promise.allSettled([...saves.values()]);
  if (owner !== active || generation !== activeGeneration) throw new Error('Account changed.');
  if (account.user)
    await accountRequest('library/delete', { method: 'POST', body: { ids: unique } });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['games', 'conflicts'], 'readwrite');
    for (const id of unique) {
      tx.objectStore('games').delete(id);
      tx.objectStore('conflicts').delete(id);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function clearAccountCache() {
  if (owner === 'guest') return;
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['games', 'conflicts'], 'readwrite');
    tx.objectStore('games').clear();
    tx.objectStore('conflicts').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function migrateGuestGames() {
  if (!account.user) return 0;
  const target = account.user.id,
    targetGeneration = generation;
  const request = indexedDB.open('evala-study', 2),
    db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        for (const name of ['games', 'conflicts'])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: 'id' });
      };
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
  computeMode: 'auto',
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
const computePreferences = (options) =>
  globalThis.document?.querySelector('meta[name="evala-compute"][content="local"]')
    ? { ...options, backend: 'local', serverUrl: '' }
    : options;
export function getPreferences(defaults = {}) {
  try {
    return computePreferences({
      ...STUDY_DEFAULTS,
      ...defaults,
      ...JSON.parse(localStorage.getItem(optionsKey()) || '{}'),
      ...account.user?.preferences?.study,
    });
  } catch {
    return computePreferences({
      ...STUDY_DEFAULTS,
      ...defaults,
      ...account.user?.preferences?.study,
    });
  }
}
export function savePreferences(settings) {
  const { token, ...safe } = settings;
  localStorage.setItem(optionsKey(), JSON.stringify(safe));
  const study = portableStudySettings(safe),
    previous = account.user?.preferences?.study || {};
  const changed = Object.fromEntries(
    Object.entries(study).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key]),
    ),
  );
  if (Object.keys(changed).length) queueAccountPreferences({ study: changed });
}
