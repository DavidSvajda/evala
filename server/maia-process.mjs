import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export class MaiaProcess {
  constructor({ python = process.env.MAIA_PYTHON, model = process.env.MAIA_MODEL } = {}) {
    this.python = python;
    this.model = model;
    this.ready = false;
  }
  get available() {
    return !!this.python && !!this.model;
  }
  boot() {
    if (this.starting) return this.starting;
    if (!this.available) throw new Error('Maia is not installed on this server.');
    this.starting = new Promise((resolveReady, reject) => {
      this.readyWait = { resolve: resolveReady, reject };
      this.child = spawn(this.python, [resolve('server/maia-runtime.py')], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          MAIA_MODEL: this.model,
          OMP_NUM_THREADS: '1',
          MKL_NUM_THREADS: '1',
          HF_HUB_OFFLINE: '1',
        },
      });
      let buffer = '';
      this.bootTimer = setTimeout(() => this.dispose(new Error('Maia startup timed out.')), 25000);
      this.child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        if (buffer.length > 65536) {
          this.dispose(new Error('Invalid Maia response.'));
          return;
        }
        let i;
        while ((i = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          try {
            const data = JSON.parse(line);
            if (data.ready && this.readyWait) {
              clearTimeout(this.bootTimer);
              this.ready = true;
              this.readyWait.resolve();
              this.readyWait = null;
            } else if (this.pending) {
              const pending = this.pending;
              this.pending = null;
              clearTimeout(this.turnTimer);
              data.error
                ? pending.reject(new Error('Maia inference failed.'))
                : pending.resolve(data);
            }
          } catch {
            this.dispose(new Error('Invalid Maia response.'));
          }
        }
      });
      if (process.env.MAIA_DEBUG === 'true')
        this.child.stderr.on('data', (chunk) => process.stderr.write(chunk));
      else this.child.stderr.resume();
      this.child.stdin.on('error', () => {});
      this.child.on('error', () => this.dispose(new Error('Maia could not start.')));
      const child = this.child;
      this.child.on('exit', () => {
        if (this.child === child) this.dispose(new Error('Maia stopped.'));
      });
    });
    return this.starting;
  }
  async predict(request, signal) {
    clearTimeout(this.idleTimer);
    const abort = () => this.dispose(new DOMException('Request cancelled.', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      await this.boot();
      if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (this.pending) throw new Error('Maia is busy.');
      return await new Promise((resolveTurn, reject) => {
        this.pending = { resolve: resolveTurn, reject };
        this.turnTimer = setTimeout(() => this.dispose(new Error('Maia turn timed out.')), 5000);
        this.child.stdin.write(JSON.stringify(request) + '\n');
      });
    } finally {
      signal?.removeEventListener('abort', abort);
      this.idleTimer = setTimeout(() => this.dispose(), 120000);
      this.idleTimer.unref?.();
    }
  }
  dispose(error = new Error('Maia stopped.')) {
    clearTimeout(this.bootTimer);
    clearTimeout(this.turnTimer);
    clearTimeout(this.idleTimer);
    const child = this.child;
    this.child = null;
    child?.kill();
    this.readyWait?.reject(error);
    this.pending?.reject(error);
    this.readyWait = null;
    this.pending = null;
    this.starting = null;
    this.ready = false;
  }
}
