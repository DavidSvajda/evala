# Account sync integrity (2.16.1)

Study kits use a shared 44,000-byte UTF-8 limit. The profile request accepts at
most 112,000 bytes, including two kit snapshots, portable settings and the JSON
envelope. Requests above 60,000 bytes do not use fetch keepalive; the persistent
account/generation-specific outbox remains available after closing the page.

Each kit update carries the snapshot edited by that device (`studyKitBase`).
The server merges within the existing account transaction. Independent entities
and fields survive; deletions apply only to content unchanged since that base.
Conflicting edits retain the account entry plus a deterministically named copy.
Retried requests do not create extra copies. Legacy outboxes without a base
preserve additions without inferring deletions. Merges exceeding existing entity
or byte limits fail without changing the account or clearing the local outbox.
Concurrent recall counters retain their maximum observed values; this is not an
exact event ledger for simultaneous practice on two devices.

Game writes still require the indexed remote revision. HTTP 409 retains the
local draft and fetches the other version. Refreshing the library can also detect
this conflict while a local analysis is pending. My games exposes a comparison
dialog, downloads both versions, and lets the user explicitly choose a version.
If the account version changes again during comparison, selection stops and the
latest conflict is shown instead of overwriting unseen work.

Before resolution, both versions are retained locally in IndexedDB. A resolved
pair is available through **Version backup** in My games. There is one backup
pair per game per browser; resolving a later conflict replaces that pair. Backups
are not cloud documents. Export the JSON to retain them outside that browser.
Removing a game or clearing/deleting the account cache removes its local backup.
The schema upgrade preserves existing games and reports blocked upgrades when
an older Evala tab must be closed.

Save results distinguish local, pending, synced, conflicted and stale writes.
Upload acknowledgements cannot replace newer local drafts. Browser-only metadata
and backup snapshots are never sent in game PUT bodies.

Practice recurrence uses valid PGN UTCDate + UTCTime. Date-only games remain
conservative: a game on the practice date is not assumed to have occurred later.

Focused regressions: `study-kit-sync.test.mjs`, `sync-storage.test.mjs`, profile
API cases in `accounts.test.mjs`, timestamp cases in `study-kit.test.mjs`, and
the conflict dialog in `storage-browser.mjs`. The `sync` release validation builds
the browser-only web host and retains the container security gates.
