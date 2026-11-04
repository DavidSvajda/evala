import { StudyEngine } from './uci.js';
import { localPerformancePlan } from './local-performance.js';

// Independent single-thread engines need no SharedArrayBuffer or login-policy
// changes. Review positions carry their complete history to every worker.
export class LocalEnginePool {
  constructor(
    makeWorker,
    options = {},
    {
      device = globalThis.navigator || {},
      createEngine = (factory) => new StudyEngine(factory),
      idleMs = 30000,
      primaryIdleMs = 180000,
    } = {},
  ) {
    this.device = device;
    this.plan = localPerformancePlan(options, device);
    this.slots = Array.from({ length: this.plan.workers }, () => ({
      engine: null,
      pending: 0,
      disabled: false,
    }));
    this.makeEngine = () => createEngine(makeWorker);
    this.idleMs = idleMs;
    const mobile =
      device.userAgentData?.mobile ?? /Android|iPhone|iPad/i.test(device.userAgent || '');
    this.primaryIdleMs = mobile ? Math.min(primaryIdleMs, 60000) : primaryIdleMs;
    this.completed = 0;
    this.nodes = 0;
    this.disposed = false;
  }
  get parallelism() {
    return this.slots.filter((s) => !s.disabled).length;
  }
  clearIdle() {
    clearTimeout(this.idleTimer);
    clearTimeout(this.primaryTimer);
  }
  configure(options) {
    if (this.disposed) return;
    if (this.slots.some((s) => s.pending || s.warming)) {
      this.nextOptions = options;
      return;
    }
    this.nextOptions = null;
    const plan = localPerformancePlan(options, this.device);
    for (const s of this.slots.slice(plan.workers)) s.engine?.dispose();
    this.slots.length = Math.min(this.slots.length, plan.workers);
    while (this.slots.length < plan.workers)
      this.slots.push({ engine: null, pending: 0, disabled: false });
    if (plan.mode !== this.plan.mode) for (const s of this.slots) s.disabled = false;
    this.plan = plan;
  }
  armIdle() {
    if (this.disposed || this.slots.some((s) => s.pending || s.warming)) return;
    if (this.nextOptions) this.configure(this.nextOptions);
    this.clearIdle();
    this.idleTimer = setTimeout(() => {
      for (const s of this.slots.slice(1)) {
        s.engine?.dispose();
        s.engine = null;
      }
    }, this.idleMs);
    this.primaryTimer = setTimeout(
      () => {
        this.slots[0].engine?.dispose();
        this.slots[0].engine = null;
      },
      this.plan.mode === 'eco' ? this.idleMs : this.primaryIdleMs,
    );
    this.idleTimer.unref?.();
    this.primaryTimer.unref?.();
  }
  async warm() {
    if (this.disposed) throw new DOMException('Výpočet byl zrušen.', 'AbortError');
    this.clearIdle();
    const slot = this.slots[0];
    slot.engine ||= this.makeEngine();
    const instance = slot.engine;
    slot.warming = (slot.warming || 0) + 1;
    try {
      await instance.boot();
    } catch (error) {
      if (slot.engine === instance) {
        instance.dispose();
        slot.engine = null;
      }
      throw error;
    } finally {
      slot.warming--;
      this.armIdle();
    }
  }
  async search(request, options = {}) {
    if (this.disposed || options.signal?.aborted)
      throw new DOMException('Výpočet byl zrušen.', 'AbortError');
    this.clearIdle();
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
      this.armIdle();
    }
  }
  dispose() {
    this.disposed = true;
    this.clearIdle();
    for (const slot of this.slots) {
      slot.engine?.dispose();
      slot.engine = null;
    }
  }
}
