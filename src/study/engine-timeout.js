// Background throttling is not evidence of an unresponsive engine. Give queued
// worker messages a full response window when the document becomes visible.
export function engineTimeout(callback, milliseconds, page = globalThis.document) {
  let timer;
  function cancel() {
    clearTimeout(timer);
    page?.removeEventListener('visibilitychange', schedule);
  }
  function schedule() {
    clearTimeout(timer);
    if (page?.hidden) return;
    timer = setTimeout(() => {
      cancel();
      callback();
    }, milliseconds);
  }
  page?.addEventListener('visibilitychange', schedule);
  schedule();
  return { cancel };
}
