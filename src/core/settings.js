export const DEFAULTS = Object.freeze({
  enabled: true,
  depth: 18,
  time: 1500,
  hash: 32,
  width: 32,
  gap: 10,
  side: 'left',
  autoFlip: true,
  showDepth: true,
  pauseHidden: true,
  backend: 'local',
  engine: 'lite',
  serverUrl: '',
  serverVersion: 0,
});

export function sanitizeSettings(input = {}) {
  const settings = { ...DEFAULTS };
  for (const key of ['enabled', 'autoFlip', 'showDepth', 'pauseHidden']) {
    if (typeof input[key] === 'boolean') settings[key] = input[key];
  }
  for (const [key, min, max] of [
    ['depth', 6, 30],
    ['time', 100, 30000],
    ['hash', 16, 256],
    ['width', 26, 48],
    ['gap', 4, 48],
  ]) {
    if (Number.isFinite(input[key]))
      settings[key] = Math.max(min, Math.min(max, Math.round(input[key])));
  }
  if (input.side === 'right') settings.side = 'right';
  if (input.engine === 'full') settings.engine = 'full';
  if (input.backend === 'server' && typeof input.serverUrl === 'string') {
    try {
      const url = new URL(input.serverUrl);
      if (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      ) {
        settings.backend = 'server';
        settings.serverUrl = url.origin;
      }
    } catch {}
  }
  if (Number.isSafeInteger(input.serverVersion) && input.serverVersion >= 0)
    settings.serverVersion = input.serverVersion;
  return settings;
}

export async function readSettings() {
  try {
    if (globalThis.chrome?.storage)
      return sanitizeSettings((await chrome.storage.local.get('settings')).settings);
    return sanitizeSettings(JSON.parse(localStorage.getItem('evala-settings') || '{}'));
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeSettings(input) {
  const settings = sanitizeSettings(input);
  if (globalThis.chrome?.storage) await chrome.storage.local.set({ settings });
  else localStorage.setItem('evala-settings', JSON.stringify(settings));
  return settings;
}
