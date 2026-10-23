import { parseInfo } from '../core/evaluation.js';
import { validPosition, terminalScore } from '../core/position.js';
import { sanitizeSettings } from '../core/settings.js';

// A stopped UCI search must finish with bestmove before another position is sent.
// Keeping a single pending request prevents stale output from being relabelled.
export class EngineController {
  constructor(makeWorker, emit) {
    this.makeWorker = makeWorker;
    this.emit = emit;
    this.worker = null;
    this.active = null;
    this.pending = null;
    this.ready = false;
    this.stopping = false;
  }

  boot() {
    if (this.worker) return;
    this.emit({ type: 'status', state: 'loading' });
    try {
      this.worker = this.makeWorker();
      this.worker.onmessage = event => this.onLine(String(event.data));
      this.worker.onerror = event => {
        console.error('Evala worker:', event.message || 'Worker load error', event.filename || '');
        this.fail('Engine se nepodařilo načíst. Obnov stránku nebo znovu načti rozšíření.');
      };
      this.bootTimer = setTimeout(() => this.fail('Načítání enginu trvá příliš dlouho. Obnov stránku.'), 20000);
      this.worker.postMessage('uci');
    } catch { this.fail('WebAssembly engine není dostupný. Zkontroluj instalaci rozšíření.'); }
  }

  analyze(request) {
    if (!Number.isSafeInteger(request.id) || !validPosition(request.fen)) {
      this.emit({ type: 'error', id: request.id, message: 'Neplatná nebo nepodporovaná šachová pozice.' });
      return;
    }
    this.pending = { id: request.id, fen: request.fen, settings: sanitizeSettings(request.settings) };
    this.boot();
    if (this.active) this.stopActive();
    else this.runPending();
  }

  stopActive() {
    if (!this.active || this.stopping) return;
    this.stopping = true;
    this.worker.postMessage('stop');
    this.stopTimer = setTimeout(() => {
      const pending = this.pending;
      this.dispose();
      if (pending) this.analyze(pending);
    }, 3000);
  }

  runPending() {
    if (!this.ready || !this.pending || this.active) return;
    this.active = this.pending;
    this.pending = null;
    const { id, fen, settings } = this.active;
    const terminal = terminalScore(fen);
    if (terminal) {
      this.emit({ type: 'evaluation', id, score: terminal });
      this.emit({ type: 'done', id });
      this.active = null;
      return;
    }
    this.worker.postMessage(`setoption name Hash value ${settings.hash}`);
    this.worker.postMessage('setoption name MultiPV value 1');
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${settings.depth} movetime ${settings.time}`);
    this.emit({ type: 'searching', id });
  }

  onLine(line) {
    if (line === 'uciok') { this.worker?.postMessage('isready'); return; }
    if (line === 'readyok' && !this.ready) {
      clearTimeout(this.bootTimer);
      this.ready = true;
      this.emit({ type: 'status', state: 'ready' });
      this.runPending();
      return;
    }
    if (/CRITICAL ERROR|Aborted\(/i.test(line)) { this.fail('Engine odmítl pozici. Přepni na standardní šachy a obnov stránku.'); return; }
    if (line.startsWith('bestmove')) {
      clearTimeout(this.stopTimer);
      if (this.active && !this.stopping) this.emit({ type: 'done', id: this.active.id });
      this.active = null;
      this.stopping = false;
      this.runPending();
      return;
    }
    if (this.active && !this.stopping) {
      const score = parseInfo(line, this.active.fen.split(' ')[1]);
      if (score && !score.bound) this.emit({ type: 'evaluation', id: this.active.id, score });
    }
  }

  pause() { this.pending = null; this.stopActive(); }

  fail(message) {
    const id = this.pending?.id ?? this.active?.id;
    this.dispose();
    this.emit({ type: 'error', id, message });
  }

  dispose() {
    clearTimeout(this.bootTimer);
    clearTimeout(this.stopTimer);
    this.worker?.terminate();
    this.worker = null;
    this.active = null;
    this.pending = null;
    this.ready = false;
    this.stopping = false;
  }
}
