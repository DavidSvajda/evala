import { DAY_MS } from './admin-metrics.mjs';

const dateAt = (ms) => new Date(ms).toISOString().slice(0, 10);
const key = 'admin:page-loads';

export function createAdminTraffic(store) {
  let pending = new Map(),
    timer,
    writing,
    stopped = false;
  function schedule() {
    if (stopped || timer || writing || !pending.size) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, 30_000);
    timer.unref?.();
  }
  function add(day, count) {
    if (pending.size >= 30 && !pending.has(day)) pending.delete(pending.keys().next().value);
    pending.set(day, Math.min(Number.MAX_SAFE_INTEGER, (pending.get(day) || 0) + count));
  }
  function flush() {
    if (writing || !pending.size) return writing;
    const batch = pending;
    pending = new Map();
    const cutoff = dateAt(Date.now() - 29 * DAY_MS);
    writing = store
      .transact(key, (old) => {
        const days = Object.fromEntries(
          Object.entries(old?.days || {}).filter(
            ([date, count]) =>
              /^\d{4}-\d{2}-\d{2}$/.test(date) &&
              date >= cutoff &&
              Number.isSafeInteger(count) &&
              count >= 0,
          ),
        );
        for (const [date, count] of batch)
          if (date >= cutoff)
            days[date] = Math.min(Number.MAX_SAFE_INTEGER, (days[date] || 0) + count);
        return { days };
      })
      .catch(() => {
        for (const [date, count] of batch) add(date, count);
        console.error('Aggregate page count could not be saved');
      })
      .finally(() => {
        writing = undefined;
        schedule();
      });
    return writing;
  }
  return {
    recordPageLoad(req, res, url) {
      if (req.method !== 'GET' || !['/', '/study.html'].includes(url.pathname)) return;
      res.once('finish', () => {
        if (stopped || res.statusCode !== 200) return;
        add(dateAt(Date.now()), 1);
        schedule();
      });
    },
    async days(now) {
      await flush();
      const { value } = await store.get(key);
      return Array.from({ length: 30 }, (_, index) => {
        const date = dateAt(now - (29 - index) * DAY_MS);
        const loads = value?.days?.[date];
        return { date, loads: Number.isSafeInteger(loads) && loads >= 0 ? loads : 0 };
      });
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
