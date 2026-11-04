# Local analysis and account database

## Free local computation

The hosted app runs Stockfish 19 on each visitor's device. No payment tier or
cloud engine has been introduced. Stockfish is C++ compiled to WebAssembly;
JavaScript schedules the work and renders the UI.

Device performance has three modes: Automatic, Save resources and Faster.
Automatic uses two independent workers on a desktop with at least four logical
processors and a reported 8 GB memory class. It stays at one on mobile,
unknown-memory, low-memory and data-saving configurations. Faster permits up
to four workers on sufficiently capable desktops. Memory budgeting includes
the separate NNUE/heap and Hash table of each worker. Browser hardware hints
are conservative, sometimes capped, and are not performance benchmarks.
They are not uploaded to the account service.

These are independent single-thread engines, not shared-memory Stockfish
threads. They do not require changing the site's Google-login headers. Each
position carries the complete game history. Only the independent base pass
is parallelised; critical-move and sacrifice verification follows it. Search
budgets are unchanged. Different transposition-table histories can change
time-limited engine output; concurrency is not a promise of identical scores.

Additional engine failures fall back to the primary engine. Opening an unfinished
game review prepares one engine without analysing moves. Changing presets, Hash
or compute mode keeps that model instance; changing the model replaces it.
Preparation is skipped in blind review, hidden tabs and Save-Data mode, and does
not run on the library page. Additional idle workers are released after 30 seconds;
the primary stays ready for three minutes on desktop, at most one minute on mobile,
or 30 seconds in Save resources mode. Leaving the page releases the engines.
This avoids repeated startup without holding several NNUE heaps indefinitely.
The first uncached Full model download is still required. Timings in the UI account
for the configured base-pass parallelism; refinement adds work.

Progress writes are coalesced: IndexedDB about every 1.2 seconds, optional
account checkpoints about every 15 seconds, and a final flush on completion
or handled pause/error. A restored partial analysis reuses evaluated positions
and bounded refinement markers. The backend does not mark a base pass complete
before the client's verification phases finish. Closing/discarding a tab
stops its computation; reopening permits continuation, not background execution
after the browser has closed.

Focused diagnostic on the development machine, eight Lite positions at a
250 ms budget per position: one worker 2024 ms, two workers 1030 ms. These are
one-machine throughput measurements, not a playing-strength benchmark or a
universal speed guarantee. Two Full NNUE workers also completed a bounded smoke.

## Database architecture and review — 4 November 2026

Backend: JavaScript modules on Node.js, using parameterised SQL through `pg`.
Database: PostgreSQL hosted by Supabase in Frankfurt. SQL defines the schema,
foreign keys, indexes and access policies. This combination is appropriate for
multiple accounts and I/O-heavy synchronisation; chess search stays off-server.
Changing the server language would not remove hosting capacity limits.

Accounts, current game links, immutable game versions, training, training
history, sessions and shares have separate tables. JSONB stores variable game
reports/preferences, rather than filesystem JSON documents. Composite game
ownership keys and cascading foreign keys keep owners and revisions aligned.

The backend role is a trusted application role. Its RLS policies are not
per-user JWT policies: account ownership is authenticated and checked by the
API. Public `anon`/`authenticated` roles cannot access the private schema.
Read-only production inspection confirmed RLS on all application-data tables,
no anonymous SELECT grants, and owner/expiry/primary-key indexes. The private
migration-version table has no personal data and no anonymous access.

Account mutations use transactions/advisory locks; nested game writes share
the same connection. A three-connection pool bounds database concurrency.
Tests exercise conflicting writes, rollback, separate accounts storing the
same game ID, and deletion. These are correctness regressions, not a certified
capacity test for hundreds of simultaneous users.

Production inspection: 2 accounts, 92 games, roughly 13 MB. Supabase Free's
500 MB capacity is not enough for hundreds of maximally filled 50 MB accounts.
Set `DATABASE_SOFT_LIMIT_MB=400` to reserve room for reads, deletion and recovery.
At the reserve threshold new game-version uploads return HTTP 507; the browser
retains its pending local analysis. The capacity check is cached for five
seconds, so it is a safety reserve, not an exact transactional byte quota.
Estimated new-record growth is reserved between measurements to bound bursts.
Other small writes continue. Monitor growth before expanding the public beta.

TLS verification, the limited database role, RLS, `REQUIRE_POSTGRES=true`,
daily streaming recovery snapshots and the existing backup-retention rule
remain enabled. No paid database upgrade is performed. See
`database-operations.md` for restore and retirement procedures.
