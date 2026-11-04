// Local checkpoints are frequent; cloud writes are deliberately less frequent.
// A slow IndexedDB write never produces an unbounded queue of old snapshots.
export function reviewCheckpoint(
  game,
  save,
  { localMs = 1200, remoteMs = 15000, onError = () => {} } = {},
) {
  let lastLocal = 0,
    lastRemote = Date.now(),
    pending = null;
  function update() {
    const now = Date.now();
    if (pending || now - lastLocal < localMs) return;
    lastLocal = now;
    const syncPartial = now - lastRemote >= remoteMs;
    if (syncPartial) lastRemote = now;
    pending = Promise.resolve()
      .then(() => save(game, { syncPartial }))
      .catch(onError)
      .finally(() => {
        pending = null;
      });
  }
  async function flush() {
    await pending;
    await save(game, { syncPartial: true });
  }
  return { update, flush };
}
