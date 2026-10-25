import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createDocumentStore } from './document-store.mjs';
import { createAccountIdentity, publicUser } from './account-identity.mjs';
import { preferences } from './account-preferences.mjs';
import { handleLibrary } from './account-library.mjs';
import { handleTraining } from './account-training.mjs';
import { finishAccountDeletion } from './account-deletion.mjs';
import { json, readJsonBody, httpError, sendError } from './http.mjs';
import { cookie, setCookie } from './security.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 400) => httpError(status, message);
export function createAccounts({
  store = createDocumentStore(),
  puzzlePath = 'public/data/puzzles.json',
  ...identityOptions
} = {}) {
  const identity = createAccountIdentity({ store, ...identityOptions });
  let bank;
  const puzzles = () =>
    (bank ||= readFile(puzzlePath, 'utf8').then((text) => JSON.parse(text).puzzles));
  const body = (req, limit) => readJsonBody(req, { limit });
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/account/')) return false;
    try {
      const s = await identity.authenticate(req, res, url);
      if (s === true) return true;
      const accountKey = 'account:' + s.userId;
      const account = s.account;
      const mutateAccount = (change) =>
        store.transact(accountKey, (a) => {
          if (!a || a.authEpoch !== s.epoch) throw fail('Přihlas se znovu.', 401);
          return change(a);
        });
      if (!account) throw fail('Účet nebyl nalezen.', 401);
      if (url.pathname === '/api/account/profile' && req.method === 'PATCH') {
        const data = await body(req, 6000);
        const updated = await mutateAccount((a) => {
          a.preferences = { ...a.preferences, ...preferences(data.preferences) };
          if (data.startingRating !== undefined) {
            if (
              a.training.attempted ||
              ![400, 800, 1200, 1600, 2000, 2400, 2800].includes(data.startingRating)
            )
              throw fail('Výchozí úroveň lze změnit pouze před prvním pokusem.');
            a.training.rating = a.training.initialRating = data.startingRating;
          }
          return a;
        });
        json(res, 200, { user: publicUser(updated), training: updated.training });
        return true;
      }
      if (await handleLibrary(req, res, url, { store, s, account, mutateAccount })) return true;
      if (url.pathname === '/api/account/delete' && req.method === 'POST') {
        const operation = randomUUID();
        await mutateAccount((a) => ({ ...a, deleting: operation, authEpoch: randomUUID() }));
        await finishAccountDeletion(store, s.userId, operation);
        await store.remove('session:' + hash(cookie(req, 'evala_account')));
        setCookie(req, res, 'evala_account', '', 0);
        json(res, 200, { ok: true });
        return true;
      }
      if (await handleTraining(req, res, url, { store, s, account, mutateAccount, puzzles }))
        return true;
      throw fail('Stránka nebyla nalezena.', 404);
    } catch (error) {
      sendError(res, error, 'Data se nepodařilo uložit. Zkus to znovu.');
    }
    return true;
  }
  return { handle, session: identity.session };
}
