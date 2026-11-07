import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { json, httpError } from './http.mjs';
import {
  createRateLimiter,
  clientAddress,
  secureRequest,
  cookie,
  constantTimeEqual,
} from './security.mjs';
import { ADMIN_PAGE_SIZE } from './admin-metrics.mjs';
import { createAdminTraffic } from './admin-traffic.mjs';

export const ADMIN_GRANT_SECONDS = 15 * 60;
export const isAdminAccount = (id, owner) => /^[a-f0-9]{64}$/.test(owner || '') && id === owner;
const shellPath = new URL('./admin.html', import.meta.url);
const pagePaths = new Set(['/admin', '/admin/', '/admin.html']);
const overviewPath = '/api/admin/overview';

export function createAdmin({ store, session, ownerId }) {
  const entry = createRateLimiter({ limit: 48, windowMs: 60_000 });
  const dataReads = createRateLimiter({ limit: 16, windowMs: 60_000, maxKeys: 1 });
  const traffic = createAdminTraffic(store);
  let shell;

  return {
    ...traffic,
    async handle(req, res, url) {
      const isPage = pagePaths.has(url.pathname);
      if (!isPage && url.pathname !== overviewPath) return false;
      res.removeHeader('Access-Control-Allow-Origin');
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      if (!isAdminAccount(ownerId, ownerId)) throw httpError(404, 'Stránka nebyla nalezena.');
      if (req.method !== 'GET' && !(isPage && req.method === 'HEAD'))
        throw httpError(405, 'Metoda není povolena.');
      if (!isPage) {
        const site = req.headers['sec-fetch-site'];
        const origin = `${secureRequest(req) ? 'https' : 'http'}://${req.headers.host}`;
        if (
          site === 'same-site' ||
          site === 'cross-site' ||
          (req.headers.origin && req.headers.origin !== origin)
        )
          throw httpError(403, 'Požadavek musí přijít z Evaly.');
      }
      if (!entry(clientAddress(req))) {
        res.setHeader('Retry-After', '60');
        throw httpError(429, 'Zkus to za minutu.');
      }
      const s = await session(req);
      if (isPage && !s) {
        res.writeHead(303, { Location: '/study.html#/account' });
        res.end();
        return true;
      }
      if (!s || !isAdminAccount(s.userId, ownerId))
        throw httpError(isPage ? 404 : 403, 'Přístup je omezen na správce.');
      if (isPage) {
        shell ||= await readFile(shellPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': shell.length,
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        });
        res.end(req.method === 'HEAD' ? undefined : shell);
        return true;
      }
      const grant = cookie(req, 'evala_admin');
      const now = Date.now(),
        age = now - s.createdAt;
      if (
        !/^[a-f0-9]{64}$/.test(grant || '') ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= ADMIN_GRANT_SECONDS * 1000 ||
        !constantTimeEqual(createHash('sha256').update(grant).digest('hex'), s.adminGrantHash)
      ) {
        json(res, 401, {
          code: 'reauth',
          error: 'Pro otevření přehledu se v účtu odhlas a znovu přihlas přes Google.',
        });
        return true;
      }
      const value = url.searchParams.get('page') ?? '1';
      if (!/^[1-9]\d{0,5}$/.test(value) || url.searchParams.getAll('page').length > 1)
        throw httpError(400, 'Neplatná stránka přehledu.');
      const page = Number(value);
      if (!dataReads(s.userId)) {
        res.setHeader('Retry-After', '60');
        throw httpError(429, 'Obnov přehled za minutu.');
      }
      const overview = await store.accountSummaries({ page, now });
      const days = page === 1 ? await traffic.days(now) : undefined;
      const validForMs = s.createdAt + ADMIN_GRANT_SECONDS * 1000 - Date.now();
      if (validForMs <= 0) {
        json(res, 401, { code: 'reauth', error: 'Ověření správce vypršelo. Přihlas se znovu.' });
        return true;
      }
      json(res, 200, {
        ...overview,
        page,
        pageSize: ADMIN_PAGE_SIZE,
        days,
        generatedAt: now,
        validForMs,
      });
      return true;
    },
  };
}
