import { EngineController } from './controller.js';
import { Chess } from 'chess.js';
import { chooseHumanMove } from '../training/human-policy.js';
export class HumanController {
  constructor(makeWorker, emit, assetUrl) {
    this.emit = emit;
    this.assetUrl = assetUrl;
    this.engine = new EngineController(makeWorker, (event) => {
      if (event.type === 'done' && this.request?.settings?.engine === 'maia') {
        this.lines = event.lines;
        this.finish();
      } else emit(event);
    });
  }
  analyze(request) {
    this.request = request;
    this.prediction = null;
    this.lines = null;
    if (request.settings?.engine === 'maia') {
      this.worker ||= new Worker(this.assetUrl('engine/maia-worker.js'), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        if (data.id !== this.request?.id) return;
        if (data.error) {
          this.emit({ type: 'error', id: data.id, message: 'Maia: ' + data.error });
          return;
        }
        this.prediction = data;
        this.finish();
      };
      this.worker.onerror = () =>
        this.emit({
          type: 'error',
          id: this.request?.id,
          message: 'Maia se nepodařilo načíst. Znovu načti rozšíření.',
        });
      this.worker.postMessage({ id: request.id, fen: request.fen, elo: request.settings.humanElo });
    }
    this.engine.analyze(request);
  }
  finish() {
    if (!this.prediction || !this.lines) return;
    const result = chooseHumanMove(
      new Chess(this.request.fen),
      this.prediction,
      { lines: this.lines },
      this.request.settings.humanStyle,
    );
    this.emit({
      type: 'human',
      id: this.request.id,
      ...result,
      elo: this.request.settings.humanElo,
    });
    this.emit({ type: 'done', id: this.request.id });
  }
  pause() {
    this.request = null;
    this.engine.pause();
  }
  dispose() {
    this.request = null;
    this.worker?.terminate();
    this.worker = null;
    this.engine.dispose();
  }
}
