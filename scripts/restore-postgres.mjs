import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { postgresPool } from '../server/postgres-store.mjs';
import { digest } from '../server/database-snapshot.mjs';

// Restore only into a newly migrated EMPTY database, never over live data.
const columns = {
  users: ['id', 'profile', 'revision'],
  game_versions: ['key', 'user_id', 'game_id', 'version', 'payload', 'revision'],
  games: ['user_id', 'game_id', 'version', 'metadata'],
  training: ['user_id', 'state'],
  training_history: ['user_id', 'puzzle_id', 'payload'],
  public_shares: ['key', 'owner_hash', 'payload', 'revision'],
  app_state: ['key', 'payload', 'revision'],
};
const bytes = await readFile(process.argv[2]);
const snapshot = JSON.parse((bytes[0] === 0x1f ? gunzipSync(bytes) : bytes).toString());
if (snapshot.version !== 1 || digest(snapshot.tables) !== snapshot.checksum)
  throw new Error('Invalid backup checksum');
const pool = postgresPool(process.env.DATABASE_URL);
const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const table of Object.keys(columns))
    if ((await client.query(`SELECT count(*)::int AS n FROM evala.${table}`)).rows[0].n)
      throw new Error('Restore target must be empty');
  for (const [table, fields] of Object.entries(columns)) {
    if (!Array.isArray(snapshot.tables[table])) throw new Error('Missing backup table');
    const names = fields.join(',');
    await client.query(
      `INSERT INTO evala.${table}(${names}) SELECT ${names}
      FROM jsonb_populate_recordset(NULL::evala.${table},$1::jsonb)`,
      [JSON.stringify(snapshot.tables[table])],
    );
  }
  await client.query('COMMIT');
  console.log('Restored all account data. Authentication sessions require a fresh login.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
