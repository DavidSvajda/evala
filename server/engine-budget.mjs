import { httpError } from './http.mjs';

export function createEngineBudget({ store, limit }) {
  let memory = null;
  const today = () => new Date().toISOString().slice(0, 10);
  const used = (v) => (v?.day === today() ? v.seconds : 0);
  return {
    async remaining() {
      const value = store?.durable ? (await store.get('security:engine-budget')).value : memory;
      return Math.max(0, limit - used(value));
    },
    async reserve(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw httpError(400, 'Invalid computation budget.');
      const change = (value) => {
        const next = used(value) + seconds;
        if (next > limit)
          throw httpError(429, 'Dnešní výpočetní kapacita je vyčerpaná. Zkus to zítra.');
        return { day: today(), seconds: next };
      };
      // A single CAS document survives scale-to-zero, restarts and replica overlap.
      // Storage failure fails closed; it never silently falls back to fresh credit.
      if (store?.durable) await store.transact('security:engine-budget', change);
      else memory = change(memory);
    },
  };
}
