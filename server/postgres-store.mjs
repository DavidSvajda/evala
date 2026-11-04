import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { scheduleDatabaseBackup } from './database-backup.mjs';
import { httpError } from './http.mjs';

export function postgresPool(connectionString, ca = process.env.DATABASE_CA) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database URL');
  // URL SSL parameters must never override certificate and hostname verification.
  for (const key of [...url.searchParams.keys()])
    if (key.startsWith('ssl')) url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.href,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    idle_in_transaction_session_timeout: 30000,
    application_name: 'evala',
  });
  pool.on('error', (error) =>
    console.error('Database connection failed:', error.code || 'unknown'),
  );
  return pool;
}

const tableFor = (key) =>
  key.startsWith('game:')
    ? 'game_versions'
    : key.startsWith('session:')
      ? 'sessions'
      : key.startsWith('login:')
        ? 'login_nonces'
        : key.startsWith('public-share:')
          ? 'public_shares'
          : 'app_state';
const conflict = () => Object.assign(new Error('Data changed. Retry.'), { statusCode: 412 });

export function createPostgresStore({
  connectionString = process.env.DATABASE_URL,
  pool,
  softLimitMB = Number(process.env.DATABASE_SOFT_LIMIT_MB || 0),
} = {}) {
  if (!Number.isFinite(softLimitMB) || softLimitMB < 0)
    throw new Error('DATABASE_SOFT_LIMIT_MB must be a non-negative number');
  pool ||= postgresPool(connectionString);
  const stopBackup = scheduleDatabaseBackup(pool);
  const context = new AsyncLocalStorage();
  const query = (sql, args) => (context.getStore() || pool).query(sql, args);
  let capacityAt = 0,
    capacityBytes = 0,
    capacityReserved = 0,
    capacityCheck = null;
  async function checkCapacity(value) {
    if (!(softLimitMB > 0)) return;
    if (Date.now() - capacityAt > 5000) {
      capacityCheck ||= (async () => {
        const { rows } = await query('SELECT pg_database_size(current_database())::text AS bytes');
        capacityBytes = Number(rows[0].bytes);
        if (!Number.isFinite(capacityBytes) || capacityBytes < 0)
          throw new Error('Database capacity could not be measured');
        capacityReserved = 0;
        capacityAt = Date.now();
      })().finally(() => {
        capacityCheck = null;
      });
      await capacityCheck;
    }
    const estimated = Math.max(8192, Buffer.byteLength(JSON.stringify(value)) * 3);
    if (capacityBytes + capacityReserved + estimated >= softLimitMB * 1024 * 1024)
      throw httpError(
        507,
        'Úložiště služby se blíží limitu. Rozbor zůstává v tomto zařízení; exportuj jej nebo to zkus později.',
      );
    capacityReserved += estimated;
  }
  const cleanup = async () => {
    try {
      await pool.query(
        `DELETE FROM evala.sessions WHERE key IN
        (SELECT key FROM evala.sessions WHERE expires<$1 ORDER BY expires LIMIT 1000)`,
        [Date.now()],
      );
      await pool.query(
        `DELETE FROM evala.login_nonces WHERE key IN
        (SELECT key FROM evala.login_nonces WHERE used_at<$1 ORDER BY used_at LIMIT 1000)`,
        [Date.now() - 600000],
      );
    } catch (error) {
      console.error('Expired authentication cleanup failed:', error.code || 'unknown');
    }
  };
  const cleanupTimer = setInterval(cleanup, 3600000);
  cleanupTimer.unref();
  async function transaction(fn) {
    if (context.getStore()) return fn();
    for (let attempt = 0; ; attempt++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await context.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (attempt >= 4 || !['40001', '40P01'].includes(error.code)) throw error;
      } finally {
        client.release();
      }
    }
  }
  async function get(key) {
    if (key.startsWith('account:')) {
      const { rows } = await query(
        `SELECT profile, revision,
        COALESCE((SELECT jsonb_object_agg(game_id,metadata) FROM evala.games WHERE user_id=u.id),'{}') AS games,
        (SELECT state FROM evala.training WHERE user_id=u.id) AS training,
        COALESCE((SELECT jsonb_object_agg(puzzle_id,payload) FROM evala.training_history WHERE user_id=u.id),'{}') AS history
        FROM evala.users u WHERE id=$1`,
        [key.slice(8)],
      );
      const r = rows[0];
      return r
        ? {
            value: {
              ...r.profile,
              games: r.games,
              ...(r.training ? { training: { ...r.training, history: r.history } } : {}),
            },
            etag: r.revision,
          }
        : { value: null, etag: null };
    }
    const { rows } = await query(
      `SELECT payload,revision FROM evala.${tableFor(key)} WHERE key=$1`,
      [key],
    );
    return { value: rows[0]?.payload ?? null, etag: rows[0]?.revision ?? null };
  }
  async function put(key, value, etag) {
    if (Buffer.byteLength(JSON.stringify(value)) > 3_000_000)
      throw new Error('Document exceeds limit');
    return transaction(async () => {
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      if (etag !== undefined && (await get(key)).etag !== etag) throw conflict();
      if (value === null) {
        await remove(key);
        return;
      }
      if (key.startsWith('account:')) {
        const { games = {}, training, ...profile } = value;
        const id = key.slice(8);
        if (profile.id !== id) throw new Error('Account key mismatch');
        await query(
          `INSERT INTO evala.users(id,profile) VALUES($1,$2)
          ON CONFLICT(id) DO UPDATE SET profile=$2,revision=evala.users.revision+1`,
          [id, profile],
        );
        // Reconcile links on the same connection as immutable game writes inside account transactions.
        await query('DELETE FROM evala.games WHERE user_id=$1 AND NOT(game_id=ANY($2::text[]))', [
          id,
          Object.keys(games),
        ]);
        await query(
          `INSERT INTO evala.games(user_id,game_id,version,metadata)
          SELECT $1,key,value->>'version',value FROM jsonb_each($2::jsonb)
          ON CONFLICT(user_id,game_id) DO UPDATE SET version=EXCLUDED.version,metadata=EXCLUDED.metadata
          WHERE evala.games.metadata IS DISTINCT FROM EXCLUDED.metadata`,
          [id, JSON.stringify(games)],
        );
        if (training) {
          const { history = {}, ...state } = training;
          await query(
            `INSERT INTO evala.training(user_id,state) VALUES($1,$2)
            ON CONFLICT(user_id) DO UPDATE SET state=$2
            WHERE evala.training.state IS DISTINCT FROM EXCLUDED.state`,
            [id, state],
          );
          await query(
            'DELETE FROM evala.training_history WHERE user_id=$1 AND NOT(puzzle_id=ANY($2::text[]))',
            [id, Object.keys(history)],
          );
          await query(
            `INSERT INTO evala.training_history(user_id,puzzle_id,payload)
            SELECT $1,key,value FROM jsonb_each($2::jsonb)
            ON CONFLICT(user_id,puzzle_id) DO UPDATE SET payload=EXCLUDED.payload
            WHERE evala.training_history.payload IS DISTINCT FROM EXCLUDED.payload`,
            [id, JSON.stringify(history)],
          );
        }
        return;
      }
      const table = tableFor(key);
      if (table === 'game_versions') await checkCapacity(value);
      let columns = '',
        placeholders = '',
        extra = [];
      if (table === 'game_versions') {
        const parts = key.split(':');
        if (parts.length !== 4) throw new Error('Invalid game key');
        columns = ',user_id,game_id,version';
        placeholders = ',$3,$4,$5';
        extra = parts.slice(1);
      } else if (table === 'sessions') {
        columns = ',user_id,expires';
        placeholders = ',$3,$4';
        extra = [value.userId, value.expires];
      } else if (table === 'login_nonces') {
        columns = ',used_at';
        placeholders = ',$3';
        extra = [value.usedAt];
      } else if (table === 'public_shares') {
        columns = ',owner_hash';
        placeholders = ',$3';
        extra = [value.ownerHash || null];
      }
      const updates = columns
        .split(',')
        .filter(Boolean)
        .map((c) => `${c}=EXCLUDED.${c}`)
        .join(',');
      await query(
        `INSERT INTO evala.${table}(key,payload${columns}) VALUES($1,$2${placeholders})
        ON CONFLICT(key) DO UPDATE SET payload=$2,revision=evala.${table}.revision+1${updates ? ',' + updates : ''}`,
        [key, value, ...extra],
      );
    });
  }
  async function remove(key) {
    await query(
      key.startsWith('account:')
        ? 'DELETE FROM evala.users WHERE id=$1'
        : `DELETE FROM evala.${tableFor(key)} WHERE key=$1`,
      [key.startsWith('account:') ? key.slice(8) : key],
    );
  }
  async function transact(key, change) {
    return transaction(async () => {
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const next = await change((await get(key)).value);
      await put(key, next);
      return next;
    });
  }
  return {
    get,
    put,
    remove,
    transact,
    durable: true,
    kind: 'postgres',
    async accountSummaries() {
      const { rows } = await query(`SELECT name,email,profile->'createdAt' AS "createdAt",
        profile->'lastLoginAt' AS "lastLoginAt" FROM evala.users
        WHERE NOT(profile ? 'deleting') ORDER BY (profile->>'createdAt')::bigint DESC LIMIT 10001`);
      return { users: rows.slice(0, 10000), truncated: rows.length > 10000 };
    },
    async ready() {
      const result = await query('SELECT version FROM evala.schema_migrations WHERE version=1');
      if (result.rows.length !== 1) throw new Error('Database migration 1 is required');
    },
    close: () => {
      stopBackup();
      clearInterval(cleanupTimer);
      return pool.end();
    },
  };
}
