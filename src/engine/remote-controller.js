import { RemoteEngine } from '../study/remote.js';
import { validPosition } from '../core/position.js';
export class RemoteController {
  constructor(url, token, emit) {
    this.engine = new RemoteEngine(url, token);
    this.emit = emit;
    this.active = null;
  }
  analyze(request) {
    this.active?.abort();
    if (!validPosition(request.fen)) {
      this.emit({ type: 'error', id: request.id, message: 'Neplatná šachová pozice.' });
      return;
    }
    const controller = new AbortController();
    this.active = controller;
    const { id } = request;
    this.emit({ type: 'searching', id });
    this.engine
      .search(
        { ...request, settings: { ...request.settings, multipv: 1 } },
        {
          signal: controller.signal,
          onInfo: (score) => {
            if (!controller.signal.aborted) this.emit({ type: 'evaluation', id, score });
          },
        },
      )
      .then((score) => {
        if (!controller.signal.aborted) {
          this.emit({ type: 'evaluation', id, score });
          this.emit({ type: 'done', id });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          this.emit({ type: 'error', id, message: error.message || 'Server není dostupný.' });
      });
  }
  dispose() {
    this.active?.abort();
    this.engine.dispose();
  }
}
