import { createHash } from 'node:crypto';

// Stable ordering makes migration verification independent of JSONB key order.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');

// Cursor batches and stream backpressure bound RAM even as the database grows.
// The resulting JSON has the same canonical checksum as exportPostgres.
export async function* streamPostgres(pool) {
  const client = await pool.connect();
  const checksum = createHash('sha256');
  let committed = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    yield '{"version":1,"createdAt":' + JSON.stringify(new Date().toISOString()) + ',"tables":';
    yield '{';
    checksum.update('{');
    const tables = [
      'users',
      'game_versions',
      'games',
      'training',
      'training_history',
      'public_shares',
      'app_state',
    ].sort();
    for (const [index, table] of tables.entries()) {
      const header = (index ? ',' : '') + JSON.stringify(table) + ':[';
      yield header;
      checksum.update(header);
      await client.query(`DECLARE backup_rows NO SCROLL CURSOR FOR SELECT * FROM evala.${table}`);
      let count = 0;
      for (;;) {
        const { rows } = await client.query('FETCH FORWARD 5 FROM backup_rows');
        if (!rows.length) break;
        for (const row of rows) {
          const json = (count++ ? ',' : '') + canonical(row);
          checksum.update(json);
          yield json;
        }
      }
      await client.query('CLOSE backup_rows');
      yield ']';
      checksum.update(']');
    }
    checksum.update('}');
    await client.query('COMMIT');
    committed = true;
    yield '},"checksum":' + JSON.stringify(checksum.digest('hex')) + '}';
  } finally {
    if (!committed) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

export async function exportPostgres(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = {};
    for (const name of [
      'users',
      'game_versions',
      'games',
      'training',
      'training_history',
      'public_shares',
      'app_state',
    ])
      tables[name] = (await client.query(`SELECT * FROM evala.${name}`)).rows;
    await client.query('COMMIT');
    return { version: 1, createdAt: new Date().toISOString(), tables, checksum: digest(tables) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
