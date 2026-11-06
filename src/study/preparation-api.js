// On-demand public chess data only. Tokens never enter URLs, logs or persisted preferences.
export async function preparationJson(url, { signal, token, method = 'GET', body } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok)
      throw Object.assign(
        Error(
          response.status === 429
            ? 'Too many requests. Try again in one minute.'
            : response.status === 401
              ? 'Connect Lichess to use the opening database.'
              : `Chess data unavailable (${response.status}).`,
        ),
        { status: response.status },
      );
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let text = '',
      bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 256_000) throw Error('Chess data response too large.');
        text += decoder.decode(value, { stream: true });
      }
      return JSON.parse(text + decoder.decode());
    } finally {
      await reader.cancel().catch(() => {});
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

const pendingKey = 'evala-lichess-explorer-pkce';
const clientId = 'evala.me-opening-explorer';
const encode = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
export async function connectExplorer(owner) {
  if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname))
    throw Error('Connect Lichess in the Evala web app.');
  const verifier = random(),
    state = random(),
    redirect = location.origin + location.pathname + '?lichess=explorer';
  const challenge = encode(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(
    pendingKey,
    JSON.stringify({ verifier, state, redirect, owner, at: Date.now() }),
  );
  const url = new URL('https://lichess.org/oauth');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  }).toString();
  location.assign(url.href);
}

export async function resumeExplorer(owner) {
  const url = new URL(location.href);
  if (url.searchParams.get('lichess') !== 'explorer') return null;
  const saved = sessionStorage.getItem(pendingKey);
  sessionStorage.removeItem(pendingKey);
  history.replaceState(null, '', location.pathname + '#/analysis');
  const pending = saved ? JSON.parse(saved) : null;
  if (
    !pending ||
    pending.state !== url.searchParams.get('state') ||
    pending.owner !== owner ||
    Date.now() - pending.at > 600_000 ||
    Date.now() < pending.at
  )
    throw Error('Lichess connection expired. Connect again.');
  if (url.searchParams.has('error')) throw Error('Lichess connection cancelled.');
  const code = url.searchParams.get('code');
  if (!code || code.length > 1024) throw Error('Invalid Lichess response.');
  const result = await preparationJson('https://lichess.org/api/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: pending.redirect,
      code,
      code_verifier: pending.verifier,
    }),
  });
  if (typeof result.access_token !== 'string' || result.access_token.length > 2048)
    throw Error('Invalid Lichess token.');
  return result.access_token;
}
