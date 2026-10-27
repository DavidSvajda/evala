import { language } from './i18n.js';
import { mergeAccountPreferences, remainingPreferencePatch } from '../core/account-preferences.js';
export const account = { user: null, csrf: '', config: null, training: null, status: 'loading' };
let googleLoading;
let identityRevision = 0,
  refreshing,
  preferenceTimer,
  preferenceTail = Promise.resolve();
const pendingKey = (user = account.user) =>
  user ? `evala-preferences-pending:${user.id}:${user.generation}` : null;
const pendingMemory = new Map();
function pendingPreferences(key) {
  if (!key) return {};
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : pendingMemory.get(key) || {};
  } catch {
    return pendingMemory.get(key) || {};
  }
}
function writePending(key, patch) {
  pendingMemory.set(key, patch);
  try {
    if (Object.keys(patch).length) localStorage.setItem(key, JSON.stringify(patch));
    else localStorage.removeItem(key);
    pendingMemory.delete(key);
  } catch {
    /* The current tab still retains the pending update. */
  }
}
function applyState(state) {
  ++identityRevision;
  const user = state.user;
  if (user)
    user.preferences = mergeAccountPreferences(
      user.preferences,
      pendingPreferences(pendingKey(user)),
    );
  Object.assign(account, {
    user,
    csrf: state.csrf || '',
    training: state.training,
    status: 'ready',
  });
}
export async function accountRequest(
  path,
  { method = 'GET', body, signal, keepalive = false } = {},
) {
  const identity = account.user;
  const response = await fetch('/api/account/' + path, {
    method,
    credentials: 'same-origin',
    keepalive,
    signal: signal || AbortSignal.timeout(20000),
    headers: {
      ...(identity
        ? {
            'X-Evala-Account': identity.id,
            ...(identity.generation ? { 'X-Evala-Generation': identity.generation } : {}),
          }
        : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': account.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (
    identity &&
    (account.user?.id !== identity.id || account.user?.generation !== identity.generation)
  )
    throw new DOMException('Přihlášení se změnilo.', 'AbortError');
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Spojení se serverem se nezdařilo.'), {
      status: response.status,
    });
  return data;
}
export async function initializeAccount(hosted, onChange = () => {}) {
  if (!hosted) {
    account.status = 'ready';
    onChange();
    return;
  }
  account.status = 'loading';
  onChange();
  const config = accountRequest('config').then((value) => {
    account.config = value;
  });
  const identity = refreshAccount(false).finally(onChange);
  await Promise.allSettled([config, identity]);
  if (account.config?.enabled === false) account.status = 'ready';
  onChange();
}
export function refreshAccount(notify = true) {
  if (refreshing) return refreshing;
  const revision = identityRevision,
    prior = account.user;
  refreshing = accountRequest('me')
    .then((state) => {
      if (revision !== identityRevision) return;
      applyState(state);
      if (notify)
        document.dispatchEvent(
          new CustomEvent(
            prior?.id !== account.user?.id || prior?.generation !== account.user?.generation
              ? 'evala:identity'
              : 'evala:account-update',
            { detail: account.user },
          ),
        );
    })
    .catch((error) => {
      if (revision === identityRevision) account.status = 'unavailable';
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
export async function googleButton(element, onError) {
  if (!account.config?.googleClientId) return false;
  try {
    // Refresh the short-lived, HttpOnly challenge only when opening sign-in.
    account.config = await accountRequest('config');
    googleLoading ||= new Promise((resolve, reject) => {
      if (globalThis.google?.accounts?.id) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = () => {
        googleLoading = null;
        reject(new Error('Google přihlášení se nenačetlo. Zkontroluj připojení a zkus to znovu.'));
      };
      document.head.append(script);
    });
    await googleLoading;
    globalThis.google.accounts.id.initialize({
      client_id: account.config.googleClientId,
      nonce: account.config.challenge,
      auto_select: false,
      callback: async ({ credential }) => {
        try {
          const response = await fetch('/api/account/google', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': account.config.challenge,
            },
            body: JSON.stringify({ credential }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Přihlášení se nezdařilo.');
          applyState(data);
          document.dispatchEvent(new CustomEvent('evala:identity', { detail: account.user }));
        } catch (error) {
          onError(error.message);
        }
      },
    });
    globalThis.google.accounts.id.renderButton(element, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      locale: language(),
      width: 300,
    });
    return true;
  } catch (error) {
    onError(error.message);
    return false;
  }
}
export async function logoutAccount(allDevices = false) {
  try {
    await accountRequest(allDevices ? 'logout-all' : 'logout', { method: 'POST', body: {} });
  } catch (e) {
    if (e.status !== 401) throw e;
  }
  applyState({ user: null, csrf: '', training: null });
  document.dispatchEvent(new CustomEvent('evala:identity', { detail: null }));
}
export function queueAccountPreferences(patch) {
  if (!account.user || !Object.keys(patch).length) return;
  const key = pendingKey();
  writePending(key, mergeAccountPreferences(pendingPreferences(key), patch));
  account.user.preferences = mergeAccountPreferences(account.user.preferences, patch);
  clearTimeout(preferenceTimer);
  preferenceTimer = setTimeout(
    () =>
      flushAccountPreferences().catch(() => {
        document.dispatchEvent(
          new CustomEvent('evala:sync', {
            detail: { message: 'Nastavení čeká na synchronizaci.', error: true },
          }),
        );
      }),
    450,
  );
}
export function flushAccountPreferences({ keepalive = false } = {}) {
  const identity = account.user,
    key = pendingKey(identity);
  if (!key) return Promise.resolve();
  const current = () =>
    account.user?.id === identity.id && account.user?.generation === identity.generation;
  const task = preferenceTail
    .catch(() => {})
    .then(async () => {
      if (!current()) return;
      const sent = pendingPreferences(key);
      if (!Object.keys(sent).length) return;
      const { user } = await accountRequest('profile', {
        method: 'PATCH',
        body: { preferences: sent },
        keepalive,
      });
      if (!current()) return;
      const remaining = remainingPreferencePatch(pendingPreferences(key), sent);
      writePending(key, remaining);
      user.preferences = mergeAccountPreferences(user.preferences, remaining);
      account.user = user;
      document.dispatchEvent(
        new CustomEvent('evala:sync', { detail: { message: 'Synchronizováno', error: false } }),
      );
    });
  preferenceTail = task;
  return task;
}
export async function saveAccountPreferences(preferences) {
  queueAccountPreferences(preferences);
  await flushAccountPreferences();
}
export function clearPendingAccountPreferences() {
  const prefix = `evala-preferences-pending:${account.user?.id}:`;
  for (const key of Object.keys(localStorage))
    if (key.startsWith(prefix)) localStorage.removeItem(key);
  for (const key of pendingMemory.keys()) if (key.startsWith(prefix)) pendingMemory.delete(key);
}
