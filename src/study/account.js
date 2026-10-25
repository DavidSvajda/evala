import { language } from './i18n.js';
export const account = { user: null, csrf: '', config: null, training: null };
let googleLoading;
export async function accountRequest(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch('/api/account/' + path, { method, credentials: 'same-origin', signal:signal||AbortSignal.timeout(20000), headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': account.csrf } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Spojení se serverem se nezdařilo.'), { status: response.status });
  return data;
}
export async function initializeAccount(hosted) {
  if (!hosted) return;
  try {
    account.config = await accountRequest('config');
    if (!account.config.enabled) return;
    const state = await accountRequest('me');
    Object.assign(account, { user: state.user, csrf: state.csrf || '', training: state.training });
  } catch { /* Guest library stays available when the account service is offline. */ }
}
export async function googleButton(element, onError) {
  if (!account.config?.googleClientId) return false;
  try {
    // Refresh the short-lived, HttpOnly challenge only when opening sign-in.
    account.config = await accountRequest('config');
    googleLoading ||= new Promise((resolve, reject) => {
      if (globalThis.google?.accounts?.id) return resolve();
      const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
      script.onload = resolve; script.onerror = () => { googleLoading = null; reject(new Error('Google přihlášení se nenačetlo. Zkontroluj připojení a zkus to znovu.')); };
      document.head.append(script);
    });
    await googleLoading;
    google.accounts.id.initialize({ client_id: account.config.googleClientId, nonce: account.config.challenge, auto_select: false, callback: async ({ credential }) => {
      try {
        const response = await fetch('/api/account/google', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': account.config.challenge }, body: JSON.stringify({ credential }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Přihlášení se nezdařilo.');
        Object.assign(account, { user: data.user, csrf: data.csrf, training: data.training });
        document.dispatchEvent(new CustomEvent('evala:identity', { detail: account.user }));
      } catch (error) { onError(error.message); }
    } });
    google.accounts.id.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: language(), width: 300 });
    return true;
  } catch (error) { onError(error.message); return false; }
}
export async function logoutAccount() {
  try{await accountRequest('logout', { method: 'POST', body: {} });}catch(e){if(e.status!==401)throw e;}
  Object.assign(account, { user: null, csrf: '', training: null });
  document.dispatchEvent(new CustomEvent('evala:identity', { detail: null }));
}
export async function saveAccountPreferences(preferences) {
  if (!account.user) return;
  const id=account.user.id;
  const { user } = await accountRequest('profile', { method: 'PATCH', body: { preferences } }); if(account.user?.id===id)account.user = user;
}
