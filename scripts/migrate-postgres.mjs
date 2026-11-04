import { readFile, writeFile } from 'node:fs/promises';
import { BlobServiceClient } from '@azure/storage-blob';
import { createDocumentStore } from '../server/document-store.mjs';
import { createPostgresStore, postgresPool } from '../server/postgres-store.mjs';
import { digest, exportPostgres } from '../server/database-snapshot.mjs';

// Run only with application writes frozen. Secrets are environment-only.
const command = process.argv[2];
if (!['export-blob', 'import', 'verify', 'backup'].includes(command))
  throw new Error('Usage: migrate-postgres.mjs export-blob|import|verify|backup private-file');
const path = process.argv[3];
if (!path) throw new Error('Provide a private backup path');
if (command === 'export-blob') {
  const service = BlobServiceClient.fromConnectionString(
    process.env.ACCOUNT_STORAGE_CONNECTION_STRING,
  );
  const container = service.getContainerClient('evala-accounts');
  const source = createDocumentStore({ databaseUrl: '' });
  const records = [];
  for await (const blob of container.listBlobsFlat()) {
    const value = JSON.parse(
      (await container.getBlockBlobClient(blob.name).downloadToBuffer()).toString(),
    );
    if (value?.id && value?.email && value?.games && value?.training) {
      records.push(['account:' + value.id, value]);
      for (const g of Object.values(value.games)) {
        const key = `game:${value.id}:${g.id}:${g.version}`;
        const game = (await source.get(key)).value;
        if (!game) throw new Error('Referenced game missing; refusing partial migration');
        records.push([key, game]);
      }
    }
  }
  for (const key of ['public-shares:index', 'admin:page-loads']) {
    const value = (await source.get(key)).value;
    if (!value) continue;
    records.push([key, value]);
    if (key === 'public-shares:index')
      for (const id of value.ids || []) {
        const share = (await source.get('public-share:' + id)).value;
        if (!share) throw new Error('Indexed share missing');
        records.push(['public-share:' + id, share]);
      }
  }
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      createdAt: new Date().toISOString(),
      records,
      checksum: digest(records),
    }),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      records: records.length,
      checksum: digest(records),
      sessions: 'require fresh login',
    }),
  );
} else {
  const pool = postgresPool(process.env.DATABASE_URL);
  const store = createPostgresStore({ pool });
  try {
    if (command === 'backup') {
      await writeFile(path, JSON.stringify(await exportPostgres(pool)), {
        flag: 'wx',
        mode: 0o600,
      });
    } else {
      const snapshot = JSON.parse(await readFile(path, 'utf8'));
      if (snapshot.version !== 1 || snapshot.checksum !== digest(snapshot.records))
        throw new Error('Backup checksum mismatch');
      if (command === 'import') {
        if ((await pool.query('SELECT count(*)::int AS n FROM evala.users')).rows[0].n)
          throw new Error('Target is not empty');
        // Account rows first, then immutable versions, then relational links.
        await store.transact('migration:initial', async () => {
          for (const [key, value] of snapshot.records.filter(([k]) => k.startsWith('account:')))
            await store.put(key, { ...value, games: {} });
          for (const [key, value] of snapshot.records.filter(([k]) => !k.startsWith('account:')))
            await store.put(key, value);
          for (const [key, value] of snapshot.records.filter(([k]) => k.startsWith('account:')))
            await store.put(key, value);
          return { completedAt: Date.now(), checksum: snapshot.checksum };
        });
      }
      for (const [key, value] of snapshot.records)
        if (digest((await store.get(key)).value) !== digest(value))
          throw new Error('Roundtrip mismatch for ' + key.split(':')[0]);
      console.log(
        JSON.stringify({ verified: snapshot.records.length, checksum: snapshot.checksum }),
      );
    }
  } finally {
    await pool.end();
  }
}
