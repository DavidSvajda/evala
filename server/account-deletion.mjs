/** Re-entrant cleanup; login can finish an interrupted deletion after a restart. */
export async function finishAccountDeletion(store, id, operation) {
  const key = 'account:' + id,
    { value: account } = await store.get(key);
  if (!account?.deleting || account.deleting !== operation) return;
  for (const game of Object.values(account.games || {})) {
    await store.remove(`game:${id}:${game.id}:${game.version}`);
  }
  await store.transact(key, (current) => {
    if (!current || current.deleting !== operation) return current;
    // A null CAS tombstone contains no profile data. Do not unconditionally
    // remove the key afterward: a concurrent verified login may recreate it.
    return null;
  });
}
