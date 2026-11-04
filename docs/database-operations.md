# Account database

The web backend uses PostgreSQL when `DATABASE_URL` is set. A failed connection
never falls back to local files. Browser IndexedDB remains the offline cache.
Guest libraries stay in the visitor's browser.

Production uses Supabase Free, Frankfurt. Its 500 MB database, shared resources
and possible inactivity pause are limits, not a production availability guarantee.
Monitor Database Size in the dashboard before opening registration widely.
Do not enable paid options without the owner's approval.

## Schema and access

Apply `server/postgres-schema.sql` with the database administrator. Migration 1
is idempotent. Subsequent changes require new versioned migrations; do not edit
an already deployed migration. `evala_app` needs a separately generated password.
Its URL and CA certificate belong in Azure secrets (`DATABASE_URL`, `DATABASE_CA`).
Use the IPv4 session pooler, port 5432; keep TLS certificate and hostname checks.
Three pooled connections serve this small backend.

Select schema **evala** in Supabase Table Editor. `users`, `games`,
`game_versions`, `training` and `training_history` are relationally linked.
JSONB stores flexible engine reports, PGN metadata and training state. Session
hashes, login nonces and public shares have their own tables. `app_state` is for
small aggregate counters/indexes, not account libraries. Generated name/email
and player columns are read-only; changing game links manually can invalidate
libraries. Prefer the app for deleting accounts and editing games.

The private schema is not exposed via the public Data API. RLS blocks `anon`
and `authenticated`; only the server role has policies. The server authorizes
account ownership before queries. This is a trusted backend role, not a
browser key. Never expose its URL in frontend configuration.

## Blob cutover

1. Deploy compatible code with `DATABASE_URL` unset. Set `DATA_MAINTENANCE=true`;
   check writes return 503. Wait for existing writes to finish. Reads remain.
2. With the old `ACCOUNT_STORAGE_CONNECTION_STRING` in the environment, run
   `node scripts/migrate-postgres.mjs export-blob PRIVATE_FILE`. Store the file
   outside git in private access-controlled storage. It has personal data.
3. Install the schema in an empty target; set the admin/runtime database URL
   and CA in the environment. Run `migrate-postgres.mjs import PRIVATE_FILE`.
   Import is one transaction. It verifies a canonical SHA-256 round trip for
   every active account, referenced game, indexed share and aggregate counter.
4. Run `migrate-postgres.mjs verify PRIVATE_FILE` before changing live settings.
   Old token hashes cannot be recovered from Blob filenames: users log in again.
5. Configure the app role URL, CA and `DATABASE_BACKUPS=true`; turn maintenance
   off. Check account login/save/import and `/api/health` (`storage: postgres`).
6. After verification, delete the retired live Blob records and migration
   exports. Blob soft deletion keeps a recovery copy for seven days. Never
   switch back to the retired Blob library after new SQL writes: restore or
   reverse-migrate current SQL data first.

## Backups and recovery

Supabase Free does not provide automatic database backups. The application
checks hourly and uploads a consistent compressed snapshot at most daily to
the private Azure container `evala-database-backups/latest.json.gz`. It includes
accounts, libraries, training, shares and counters; it excludes login tokens.
Blob soft deletion retains overwritten snapshots for seven days. Privacy
information allows up to fourteen days for recovery copies, including delay
between snapshots and retirement of migration copies. Monitor Azure logs for
`Private database backup completed` / `Database backup failed`.
An app or database outage can prevent scheduled backups: investigate missing
snapshots, rather than assuming a timer guarantees a backup.

For a manual consistent export, use
`node scripts/migrate-postgres.mjs backup PRIVATE_FILE`.
Restore into a separate **empty** database with migration 1 installed using
`node scripts/restore-postgres.mjs PRIVATE_FILE`. It accepts raw JSON or gzip,
checks the checksum and restores in one transaction, refusing nonempty targets.
Keep the old database available until a full comparison and login check pass.
After restoring deleted data, reapply account/game deletions that occurred
after the snapshot. Sessions are intentionally not restored.

## Focused live regression

Before importing production data, point `EVALA_TEST_DATABASE_URL` at the empty
test target and run `node --test tests/postgres-store.test.mjs`. Supply the CA
in `DATABASE_CA`. It creates disposable random test accounts and removes them.
Do not point arbitrary tests at production. Protected-branch checks stay enabled.
