import { findBoard, boardFlipped, PositionTracker } from './adapters/board.js';
import { EvalBar } from './ui/bar.js';
import { readSettings, writeSettings } from './core/settings.js';

export async function mount({ demo = false } = {}) {
  const assetUrl = (path) =>
    globalThis.chrome?.runtime?.id
      ? chrome.runtime.getURL(path)
      : new URL(path, location.href).href;
  let settings = await readSettings();
  let tracker = new PositionTracker(),
    nativeFen = null,
    nativePath = '',
    lastFen = null,
    currentBoard = null,
    state = 'waiting';
  let connected = false,
    requestId = 0,
    searchKey = '',
    lastPath = location.pathname,
    dead = false;
  const token = crypto.randomUUID(),
    boardToken = crypto.randomUUID();
  const view = new EvalBar(settings, {
    assetUrl,
    onSettings: async (next) => {
      applySettings(next);
      await writeSettings(next);
    },
    onToggle: async () => {
      const next = { ...settings, enabled: !settings.enabled };
      applySettings(next);
      await writeSettings(next);
    },
  });
  const useRuntime = !!globalThis.chrome?.runtime?.id && !demo;
  let frame = null,
    origin = null;
  if (!useRuntime) {
    frame = document.createElement('iframe');
    frame.src = `${assetUrl('engine.html')}#${token}`;
    frame.className = 'engine-frame';
    frame.title = 'Lokální výpočet Evala';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    view.shadow.append(frame);
    origin = new URL(frame.src).origin;
  }
  const send = (message) => {
    const data = { channel: 'evala-engine', token, ...message };
    if (!useRuntime) frame.contentWindow?.postMessage(data, origin);
    else
      chrome.runtime
        .sendMessage({ ...data, target: 'evala-background' })
        .then((response) => {
          if (response?.error && !dead) setState('error', response.error);
        })
        .catch(() => {
          if (!dead) setState('error', 'Spojení s rozšířením bylo přerušeno. Obnov stránku.');
        });
  };
  const setState = (next, message) => {
    state = next;
    view.setState(next, message);
  };
  const isPaused = () => !settings.enabled || (settings.pauseHidden && document.hidden);
  function pause() {
    requestId++;
    searchKey = '';
    send({ type: 'pause' });
    view.renderScore(null);
    setState('paused');
  }
  function applySettings(next) {
    const previous = settings;
    settings = next;
    view.updateSettings(settings);
    if (isPaused()) pause();
    else if (
      !previous.enabled ||
      previous.depth !== next.depth ||
      previous.time !== next.time ||
      previous.hash !== next.hash ||
      previous.backend !== next.backend ||
      previous.serverUrl !== next.serverUrl ||
      previous.serverVersion !== next.serverVersion
    )
      searchKey = '';
    tick();
  }
  function tick() {
    if (dead) return;
    if (lastPath !== location.pathname) {
      lastPath = location.pathname;
      tracker = new PositionTracker();
      nativeFen = null;
      lastFen = null;
      searchKey = '';
      requestId++;
      send({ type: 'pause' });
      view.renderScore(null);
    }
    const board = findBoard();
    if (!board) {
      if (currentBoard) {
        send({ type: 'pause' });
        requestId++;
        searchKey = '';
        lastFen = null;
        tracker = new PositionTracker();
        view.renderScore(null);
      }
      currentBoard = null;
      view.hide();
      setState('waiting');
      return;
    }
    if (currentBoard && currentBoard !== board) {
      tracker = new PositionTracker();
      lastFen = null;
      searchKey = '';
      nativeFen = null;
    }
    currentBoard = board;
    view.place(board, boardFlipped(board));
    if (isPaused()) {
      if (state !== 'paused') pause();
      return;
    }
    if (!demo)
      window.postMessage(
        { channel: 'evala-board', type: 'read', token: boardToken },
        location.origin,
      );
    const position = tracker.resolve(board, nativePath === location.pathname ? nativeFen : null);
    if (!position) {
      if (lastFen !== null) {
        send({ type: 'pause' });
        requestId++;
        searchKey = '';
        lastFen = null;
        view.renderScore(null);
      }
      setState(
        'waiting',
        'Čekám na úplnou pozici. Otevři analýzu nebo načti stránku od začátku partie.',
      );
      return;
    }
    lastFen = position.fen;
    const key = `${lastFen}|${settings.depth}|${settings.time}|${settings.hash}|${settings.backend}|${settings.serverUrl}|${settings.serverVersion}`;
    if (!connected || searchKey === key) return;
    searchKey = key;
    requestId++;
    view.renderScore(null);
    setState('loading');
    send({ type: 'analyze', id: requestId, fen: lastFen, settings });
  }
  const handleEngine = (data) => {
    if (data.type === 'connected') {
      connected = true;
      clearInterval(handshake);
      tick();
      return;
    }
    if (data.type === 'status' && data.state === 'loading' && !isPaused()) setState('loading');
    if (data.id !== requestId || isPaused()) return;
    if (data.type === 'searching') setState('searching');
    if (data.type === 'evaluation') view.renderScore(data.score);
    if (data.type === 'done') setState('done');
    if (data.type === 'error') {
      view.renderScore(null);
      setState('error', data.message);
    }
  };
  const onMessage = (event) => {
    const data = event.data;
    if (
      event.source === window &&
      event.origin === location.origin &&
      data?.channel === 'evala-board' &&
      data.type === 'position' &&
      data.token === boardToken
    ) {
      nativeFen = data.fen;
      nativePath = data.path;
      return;
    }
    if (
      frame &&
      event.source === frame.contentWindow &&
      event.origin === origin &&
      data?.channel === 'evala-engine' &&
      data.token === token
    )
      handleEngine(data);
  };
  window.addEventListener('message', onMessage);
  const handshake = setInterval(() => send({ type: 'hello' }), 400);
  const handshakeTimeout = setTimeout(() => {
    clearInterval(handshake);
    if (!connected)
      setState('error', 'Engine se nepřipojil. Obnov stránku nebo znovu načti rozšíření.');
  }, 15000);
  let queued = false;
  const reposition = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (currentBoard) view.place(currentBoard, boardFlipped(currentBoard));
      });
    }
  };
  window.addEventListener('scroll', reposition, { passive: true, capture: true });
  window.addEventListener('resize', reposition, { passive: true });
  const onVisibility = () => {
    if (settings.pauseHidden && document.hidden) pause();
    else {
      searchKey = '';
      tick();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const interval = setInterval(tick, 450);
  const onStorage = (changes, area) => {
    if (area === 'local' && changes.settings?.newValue) readSettings().then(applySettings);
  };
  globalThis.chrome?.storage?.onChanged.addListener(onStorage);
  const onRuntimeMessage = (message, sender, respond) => {
    if (
      useRuntime &&
      sender.id === chrome.runtime.id &&
      message?.target === 'evala-content' &&
      message.channel === 'evala-engine' &&
      message.token === token
    ) {
      handleEngine(message);
      return;
    }
    if (message?.type !== 'evala-status' || sender.id !== chrome.runtime.id) return;
    respond({
      board: !!currentBoard,
      state,
      fen: lastFen,
      score: view.score || null,
      site: location.hostname,
      settings,
    });
  };
  globalThis.chrome?.runtime?.onMessage.addListener(onRuntimeMessage);
  tick();
  const dispose = () => {
    dead = true;
    send({ type: 'dispose' });
    clearInterval(interval);
    clearInterval(handshake);
    clearTimeout(handshakeTimeout);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
    document.removeEventListener('visibilitychange', onVisibility);
    globalThis.chrome?.storage?.onChanged.removeListener(onStorage);
    globalThis.chrome?.runtime?.onMessage.removeListener(onRuntimeMessage);
    view.dispose();
  };
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) dispose();
    else pause();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      searchKey = '';
      tick();
    }
  });
  return { view, tick, dispose, getStatus: () => ({ state, fen: lastFen, score: view.score }) };
}

if (!location.pathname.endsWith('/demo.html')) mount();
