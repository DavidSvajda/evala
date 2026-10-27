import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { trainingState } from '../src/training/logic.js';
import { json, readJsonBody, httpError } from './http.mjs';
import {
  cookie,
  setCookie,
  constantTimeEqual as equal,
  loopbackHost,
  createRateLimiter,
  clientAddress,
} from './security.mjs';
import { finishAccountDeletion } from './account-deletion.mjs';
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const fail = (message, status = 400) => httpError(status, message);
export const publicUser = (a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  preferences: a.preferences,
  createdAt: a.createdAt,
  generation: a.authEpoch,
});
export function createAccountIdentity({
  store,
  googleClientId = process.env.GOOGLE_CLIENT_ID || '',
  verifyGoogle = async (token) =>
    (
      await jwtVerify(token, googleKeys, {
        audience: googleClientId,
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'email', 'email_verified', 'nonce', 'iat', 'exp'],
        clockTolerance: 30,
      })
    ).payload,
}) {
  const loginAllowed = createRateLimiter({ limit: 12, windowMs: 60000 });
  const writesAllowed = createRateLimiter({ limit: 120, windowMs: 60000 });
  const enabled = (req) =>
    store.durable || (process.env.NODE_ENV !== 'production' && loopbackHost(req.headers.host));
  const body = (req, limit) => readJsonBody(req, { limit });
  async function session(req) {
    const value = cookie(req, 'evala_account');
    if (!/^[a-f0-9]{64}$/.test(value || '')) return null;
    const { value: s } = await store.get('session:' + hash(value));
    if (!s || s.cookieVersion !== 1 || s.expires <= Date.now()) return null;
    const account = (await store.get('account:' + s.userId)).value;
    return account && !account.deleting && account.authEpoch === s.epoch ? { ...s, account } : null;
  }
  async function authenticate(req, res, url) {
    if (url.pathname === '/api/account/config' && req.method === 'GET') {
      const challenge = random();
      setCookie(req, res, 'evala_login', challenge, 600);
      json(res, 200, {
        enabled: enabled(req),
        googleClientId: enabled(req) ? googleClientId : '',
        challenge,
        persistent: store.durable,
      });
      return true;
    }
    if (!enabled(req))
      throw fail('Přihlášení zatím není dostupné. Můžeš pokračovat bez účtu.', 503);
    if (url.pathname === '/api/account/google' && req.method === 'POST') {
      if (!loginAllowed(clientAddress(req)))
        throw fail('Příliš mnoho přihlášení. Zkus to za minutu.', 429);
      if (!googleClientId) throw fail('Přihlášení přes Google ještě není dostupné.', 503);
      const challenge = cookie(req, 'evala_login');
      if (!/^[a-f0-9]{64}$/.test(challenge || '') || !equal(challenge, req.headers['x-csrf-token']))
        throw fail('Přihlašovací formulář vypršel. Obnov stránku.', 403);
      const data = await body(req, 12000);
      if (typeof data.credential !== 'string' || data.credential.length > 10000)
        throw fail('Neplatné potvrzení Google účtu.', 401);
      let claims;
      try {
        claims = await verifyGoogle(data.credential);
      } catch {
        throw fail('Google přihlášení se nepodařilo ověřit.', 401);
      }
      if (
        typeof claims?.sub !== 'string' ||
        !claims.sub ||
        claims.sub.length > 255 ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= Date.now() ||
        !Number.isFinite(claims.iat) ||
        claims.iat * 1000 > Date.now() + 30000 ||
        typeof claims.email !== 'string' ||
        claims.email_verified !== true ||
        !equal(claims.nonce, challenge)
      )
        throw fail('Neplatné potvrzení Google účtu.', 401);
      await store.transact('login:' + hash(challenge), (prior) => {
        if (prior) throw fail('Přihlášení již bylo použito. Obnov stránku.', 403);
        return { usedAt: Date.now() };
      });
      const id = hash('google:' + claims.sub);
      const prior = (await store.get('account:' + id)).value;
      if (prior?.deleting) await finishAccountDeletion(store, id, prior.deleting);
      const account = await store.transact('account:' + id, (prior) => {
        if (prior?.deleting) throw fail('Účet se právě odstraňuje. Zkus přihlášení znovu.', 409);
        return prior
          ? { ...prior, authEpoch: prior.authEpoch || randomUUID() }
          : {
              id,
              authEpoch: randomUUID(),
              name: String(claims.name || claims.email.split('@')[0]).slice(0, 80),
              email: String(claims.email).slice(0, 254),
              preferences: {},
              games: {},
              training: trainingState(),
              createdAt: Date.now(),
            };
      });
      const old = cookie(req, 'evala_account');
      if (/^[a-f0-9]{64}$/.test(old || '')) await store.remove('session:' + hash(old));
      const raw = random(),
        csrf = random();
      await store.put('session:' + hash(raw), {
        userId: id,
        epoch: account.authEpoch,
        csrf,
        expires: Date.now() + 30 * 86400000,
        createdAt: Date.now(),
        cookieVersion: 1,
      });
      setCookie(req, res, 'evala_account', raw, 30 * 86400);
      json(res, 200, { user: publicUser(account), csrf, training: account.training });
      return true;
    }
    const s = await session(req);
    if (
      s &&
      ((req.headers['x-evala-account'] && req.headers['x-evala-account'] !== s.userId) ||
        (req.headers['x-evala-generation'] &&
          req.headers['x-evala-generation'] !== s.account.authEpoch))
    )
      throw fail('Přihlášení se změnilo. Obnov stránku.', 409);
    if (url.pathname === '/api/account/me' && req.method === 'GET') {
      const account = s?.account;
      json(
        res,
        200,
        account
          ? { user: publicUser(account), csrf: s.csrf, training: account.training }
          : { user: null },
      );
      return true;
    }
    if (!s) throw fail('Přihlas se ke svému účtu.', 401);
    if (!['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-csrf-token'], s.csrf))
      throw fail('Obnov stránku a zkus to znovu.', 403);
    if (!['GET', 'HEAD'].includes(req.method) && !writesAllowed(s.userId))
      throw fail('Příliš mnoho změn. Zkus to za minutu.', 429);
    if (url.pathname === '/api/account/logout-all' && req.method === 'POST') {
      await store.transact('account:' + s.userId, (a) => {
        if (!a || a.authEpoch !== s.epoch) throw fail('Přihlas se znovu.', 401);
        return { ...a, authEpoch: randomUUID() };
      });
      await store.remove('session:' + hash(cookie(req, 'evala_account')));
      setCookie(req, res, 'evala_account', '', 0);
      json(res, 200, { ok: true });
      return true;
    }
    if (url.pathname === '/api/account/logout' && req.method === 'POST') {
      await store.remove('session:' + hash(cookie(req, 'evala_account')));
      setCookie(req, res, 'evala_account', '', 0);
      json(res, 200, { ok: true });
      return true;
    }

    return s;
  }
  return { authenticate, session };
}
