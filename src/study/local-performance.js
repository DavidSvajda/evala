// Hardware hints choose conservative limits, not a claim about CPU speed.
// These hints stay on the device and are never sent to the account service.
export function localPerformancePlan(options = {}, device = globalThis.navigator || {}) {
  const mode = ['auto', 'eco', 'fast'].includes(options.computeMode) ? options.computeMode : 'auto';
  const cores = Math.max(1, Math.min(64, Number(device.hardwareConcurrency) || 2));
  const memory = Number(device.deviceMemory) || 0;
  const mobile =
    device.userAgentData?.mobile ?? /Android|iPhone|iPad/i.test(device.userAgent || '');
  const hash = Math.max(16, Math.min(256, Number(options.hash) || 64));
  let workers = 1;
  if (mode !== 'eco' && !device.connection?.saveData) {
    if (mode === 'auto' && !mobile && memory >= 8 && cores >= 4) workers = 2;
    if (mode === 'fast' && cores >= 4 && (!memory || memory >= 4)) workers = 2;
    if (mode === 'fast' && !mobile && memory >= 8 && cores >= 12) workers = 4;
  }
  // Each Full engine owns its NNUE/heap. Reserve ample memory for Chrome and UI.
  const budget = memory ? memory * 1024 * (mode === 'fast' ? 0.25 : 0.15) : 1024;
  const perWorker = (options.engine === 'lite' ? 96 : 400) + hash;
  workers = Math.max(1, Math.min(workers, Math.floor(budget / perWorker), Math.max(1, cores - 1)));
  return { mode, workers };
}
