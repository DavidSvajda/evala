import { json, httpError } from './http.mjs';
import { createRateLimiter, clientAddress } from './security.mjs';

export function createAdmin({ store, session, emails = process.env.ADMIN_EMAILS || '' }) {
  const allowed = new Set(
    emails
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
  const limit = createRateLimiter({ limit: 6, windowMs: 60000 });
  let cache = null,
    cachedAt = 0;
  return {
    async handle(req, res, url) {
      if (!url.pathname.startsWith('/api/admin/')) return false;
      if (req.method !== 'GET') throw httpError(405, 'Method not allowed');
      const s = await session(req);
      if (!s || !allowed.has(s.account.email.toLowerCase()))
        throw httpError(403, 'Pouze pro správce. Přihlas se oprávněným Google účtem.');
      if (!limit(clientAddress(req))) throw httpError(429, 'Obnov přehled za minutu.');
      if (url.pathname !== '/api/admin/overview') throw httpError(404, 'Not found');
      if (!cache || Date.now() - cachedAt > 60000) {
        cache = await store.accountSummaries();
        cachedAt = Date.now();
      }
      const { value } = await store.get('admin:page-loads');
      const cutoff = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      json(res, 200, {
        ...cache,
        days: Object.entries(value?.days || {})
          .filter(([day]) => day >= cutoff)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([date, loads]) => ({ date, loads })),
        generatedAt: cachedAt,
      });
      return true;
    },
    recordPageLoad(req, res, url) {
      if (req.method !== 'GET' || !['/', '/study.html'].includes(url.pathname)) return;
      res.once('finish', () => {
        if (res.statusCode !== 200) return;
        const day = new Date().toISOString().slice(0, 10);
        const cutoff = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
        // Aggregate only the count. Never retain URL queries, identity, IP or UA.
        void store
          .transact('admin:page-loads', (old) => {
            const days = Object.fromEntries(
              Object.entries(old?.days || {}).filter(([date]) => date >= cutoff),
            );
            days[day] = Math.min(Number.MAX_SAFE_INTEGER, (days[day] || 0) + 1);
            return { days };
          })
          .catch(() => console.error('Aggregate page count could not be saved'));
      });
    },
  };
}
