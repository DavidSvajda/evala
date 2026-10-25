import { timingSafeEqual } from 'node:crypto';
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
  if (secureRequest(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
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
