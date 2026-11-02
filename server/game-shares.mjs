import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { json, readJsonBody, httpError } from './http.mjs';
import { parseServerPgn } from './pgn-parser.mjs';
import { createRateLimiter, clientAddress } from './security.mjs';
import { publicSnapshot } from '../src/study/share-snapshot.js';
const hash = (token) => createHash('sha256').update(token).digest();
const validId = /^[A-Za-z0-9_-]{22}$/;
export function createGameShares({ store, maxShares = 1000 }) {
  const creates = createRateLimiter({ limit: 20, windowMs: 86400000 });
  const reads = createRateLimiter({ limit: 180, windowMs: 60000 });
  const registry = 'public-shares:index';
  const changeIndex = (id, add) =>
    store.transact(registry, (old) => {
      const ids = Array.isArray(old?.ids) ? old.ids : [];
      if (add && ids.length >= maxShares)
        throw httpError(503, 'Sdílení je dočasně zaplněné. Zkus to později.');
      return { ids: add ? [...ids, id] : ids.filter((value) => value !== id) };
    });
  return async (req, res, url) => {
    if (url.pathname !== '/api/shares' && !url.pathname.startsWith('/api/shares/')) return false;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!reads(clientAddress(req))) throw httpError(429, 'Příliš mnoho požadavků na sdílení.');
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) throw httpError(405, 'Method not allowed');
    if (req.method !== 'GET') {
      let origin;
      try {
        origin = new URL(req.headers.origin);
      } catch {
        throw httpError(403, 'Požadavek musí pocházet z Evaly.');
      }
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol))
        throw httpError(403, 'Požadavek musí pocházet z Evaly.');
    }
    if (url.pathname === '/api/shares') {
      if (req.method !== 'POST') throw httpError(405, 'Use POST');
      if (!creates(clientAddress(req))) throw httpError(429, 'Dnešní limit je 20 nových sdílení.');
      const input = await readJsonBody(req, { limit: 180000 });
      const game = await parseServerPgn(input.pgn);
      let snapshot;
      try {
        snapshot = publicSnapshot(game, input.variation);
      } catch {
        throw httpError(400, 'Neplatná varianta.');
      }
      const id = randomBytes(16).toString('base64url'),
        deleteToken = randomBytes(32).toString('base64url');
      await changeIndex(id, true);
      try {
        await store.put(
          'public-share:' + id,
          { snapshot, ownerHash: hash(deleteToken).toString('hex'), createdAt: Date.now() },
          null,
        );
      } catch (e) {
        await changeIndex(id, false);
        throw e;
      }
      json(res, 201, { id, deleteToken });
      return true;
    }
    const id = url.pathname.slice('/api/shares/'.length);
    if (!validId.test(id) || req.method === 'POST')
      throw httpError(404, 'Sdílená partie nebyla nalezena.');
    const key = 'public-share:' + id,
      { value } = await store.get(key);
    if (req.method === 'GET') {
      if (!value || value.revoked)
        throw httpError(404, 'Sdílená partie není dostupná. Odkaz mohl být zrušen.');
      json(res, 200, { id, ...value.snapshot });
      return true;
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      !value?.ownerHash ||
      !timingSafeEqual(hash(token), Buffer.from(value.ownerHash, 'hex'))
    )
      throw httpError(404, 'Sdílená partie nebyla nalezena.');
    // Tombstone first: readers cannot race a successful revocation.
    await store.transact(key, (current) => ({ ...current, revoked: true, snapshot: null }));
    await changeIndex(id, false);
    await store.remove(key);
    json(res, 200, { ok: true });
    return true;
  };
}
