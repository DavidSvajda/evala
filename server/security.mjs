import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { httpError } from './http.mjs';

export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const loopbackHost = (host) =>
  /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host || '');
export const secureRequest = (req) =>
  process.env.NODE_ENV === 'production' ||
  !!req.socket.encrypted ||
  !loopbackHost(req.headers.host) ||
  String(req.headers['x-forwarded-proto']).split(',')[0].trim() === 'https';
export const cookieName = (req, name) => (secureRequest(req) ? '__Host-' + name : name);
export function cookie(req, name) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName(req, name) + '='))
    ?.slice(cookieName(req, name).length + 1);
}
export function setCookie(req, res, name, value, maxAge, sameSite = 'Lax') {
  const valueHeader = `${cookieName(req, name)}=${value}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=${maxAge}${secureRequest(req) ? '; Secure' : ''}`;
  const previous = res.getHeader('Set-Cookie');
  res.setHeader(
    'Set-Cookie',
    previous ? [...(Array.isArray(previous) ? previous : [previous]), valueHeader] : valueHeader,
  );
}

export function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  if (secureRequest(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// ACA appends the verified address on the RIGHT. Never trust a client's leftmost XFF.
// Enable only inside ACA (its injected environment variable), or explicitly in tests.
export function clientAddress(req, trustAzureIngress = !!process.env.CONTAINER_APP_NAME) {
  if (trustAzureIngress) {
    const last = String(req.headers['x-forwarded-for'] || '')
      .split(',')
      .at(-1)
      .trim();
    if (isIP(last)) return last;
  }
  return req.socket.remoteAddress || 'unknown';
}

export function createRequestGuard({
  perMinute = 600,
  globalPerMinute = 6000,
  activeLimit = 64,
} = {}) {
  const clientAllowed = createRateLimiter({ limit: perMinute, windowMs: 60000 });
  const globalAllowed = createRateLimiter({ limit: globalPerMinute, windowMs: 60000, maxKeys: 1 });
  const active = new Map();
  let total = 0;
  return (req, res, url) => {
    if (!url.pathname.startsWith('/api/')) return;
    const site = req.headers['sec-fetch-site'];
    // CORS still handles explicit allowed origins, including authenticated extensions.
    if ((site === 'cross-site' || site === 'same-site') && !req.headers.origin)
      throw httpError(403, 'Cross-origin API request rejected.');
    const key = clientAddress(req);
    if (
      !clientAllowed(key) ||
      !globalAllowed('all') ||
      total >= activeLimit ||
      (active.get(key) || 0) >= 12
    ) {
      res.setHeader('Retry-After', '60');
      throw httpError(429, 'Příliš mnoho požadavků. Zkus to za minutu.');
    }
    total++;
    active.set(key, (active.get(key) || 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      total--;
      const left = active.get(key) - 1;
      if (left) active.set(key, left);
      else active.delete(key);
    };
    res.once('finish', release);
    res.once('close', release);
  };
}

export function allowOrigin(req, res, { origins, allowExtensionOrigins, token }) {
  const origin = req.headers.origin;
  if (origin) {
    let same = false;
    try {
      same =
        new URL(origin).origin === `${secureRequest(req) ? 'https' : 'http'}://${req.headers.host}`;
    } catch {
      /* Reject malformed origins. */
    }
    const extension =
      allowExtensionOrigins && !!token && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    if (!same && !extension && !origins.has(origin))
      throw httpError(403, 'Origin is not allowed. Configure ALLOWED_ORIGINS.');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}

/** Fixed-window counters with an actual bound, including unexpired entries. */
export function createRateLimiter({ limit, windowMs, maxKeys = 1000 }) {
  const entries = new Map();
  return (key, now = Date.now()) => {
    let entry = entries.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (entries.size >= maxKeys) {
        for (const [id, item] of entries) if (now - item.start >= windowMs) entries.delete(id);
        if (!entries.has(key) && entries.size >= maxKeys) return false;
      }
      entry = { start: now, count: 0 };
      entries.set(key, entry);
    }
    return ++entry.count <= limit;
  };
}
