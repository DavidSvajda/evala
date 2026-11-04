import { StudyEngine } from './uci.js';
import { localPerformancePlan } from './local-performance.js';

// Independent single-thread engines need no SharedArrayBuffer or login-policy
// changes. Review positions carry their complete history to every worker.
export class LocalEnginePool {
  constructor(
    makeWorker,
    options = {},
    { device, createEngine = (factory) => new StudyEngine(factory), idleMs = 30000 } = {},
  ) {
    this.plan = localPerformancePlan(options, device);
    this.slots = Array.from({ length: this.plan.workers }, () => ({
      engine: null,
      pending: 0,
      disabled: false,
    }));
    this.makeEngine = () => createEngine(makeWorker);
    this.idleMs = idleMs;
    this.completed = 0;
    this.nodes = 0;
    this.disposed = false;
  }
  get parallelism() {
    return this.slots.filter((s) => !s.disabled).length;
  }
  async search(request, options = {}) {
    if (this.disposed || options.signal?.aborted)
      throw new DOMException('Výpočet byl zrušen.', 'AbortError');
    clearTimeout(this.idleTimer);
    const slot = this.slots
      .filter((s) => !s.disabled)
      .reduce((a, b) => (a.pending <= b.pending ? a : b));
    slot.pending++;
    try {
      slot.engine ||= this.makeEngine();
      const result = await slot.engine.search(request, options);
      this.completed++;
      this.nodes += result.nodes || 0;
      return result;
    } catch (error) {
      if (slot !== this.slots[0] && error.name !== 'AbortError' && !this.disposed) {
        // Additional engine allocation may fail on memory-constrained browsers.
        // Retry through the primary engine's own serial queue, retaining quality.
        slot.disabled = true;
        slot.engine?.dispose();
        slot.engine = null;
        this.slots[0].engine ||= this.makeEngine();
        return await this.slots[0].engine.search(request, options);
      }
      throw error;
    } finally {
      slot.pending--;
      if (!this.disposed && this.slots.every((s) => s.pending === 0)) {
        this.idleTimer = setTimeout(() => {
          for (const s of this.slots) {
            s.engine?.dispose();
            s.engine = null;
          }
        }, this.idleMs);
        this.idleTimer.unref?.();
      }
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    for (const slot of this.slots) {
      slot.engine?.dispose();
      slot.engine = null;
    }
  }
}
