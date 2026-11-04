import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BlobServiceClient } from '@azure/storage-blob';
import { createPostgresStore } from './postgres-store.mjs';

const filename = (key) => createHash('sha256').update(key).digest('hex') + '.json';
export function createDocumentStore({
  directory = process.env.EVALA_DATA_DIR || '.local-data/accounts',
  connectionString = process.env.ACCOUNT_STORAGE_CONNECTION_STRING,
  container = 'evala-accounts',
  databaseUrl = process.env.DATABASE_URL,
  requirePostgres = process.env.REQUIRE_POSTGRES === 'true',
} = {}) {
  if (requirePostgres && !databaseUrl)
    throw new Error('DATABASE_URL is required. Refusing to fall back to retired storage.');
  if (databaseUrl) return createPostgresStore({ connectionString: databaseUrl });
  const locks = new Map();
  const service = connectionString
    ? BlobServiceClient.fromConnectionString(connectionString, {
        retryOptions: { maxTries: 3, tryTimeoutInMs: 10000 },
      })
    : null;
  const blobs = service?.getContainerClient(container);
  let ready;
  const root = resolve(directory);
  const initialize = () =>
    (ready ||= (
      blobs
        ? blobs.createIfNotExists({ publicAccess: undefined })
        : mkdir(root, { recursive: true })
    ).catch((error) => {
      ready = null;
      throw error;
    }));
  async function get(key) {
    await initialize();
    if (blobs) {
      try {
        const blob = blobs.getBlockBlobClient(filename(key));
        const response = await blob.download();
        const chunks = [];
        let length = 0;
        for await (const chunk of response.readableStreamBody) {
          length += chunk.length;
          if (length > 3_000_000) throw new Error('Stored document exceeds limit');
          chunks.push(chunk);
        }
        return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), etag: response.etag };
      } catch (e) {
        if (e.statusCode === 404) return { value: null, etag: null };
        throw e;
      }
    }
    try {
      return {
        value: JSON.parse(await readFile(resolve(root, filename(key)), 'utf8')),
        etag: null,
      };
    } catch (e) {
      if (e.code === 'ENOENT') return { value: null, etag: null };
      throw e;
    }
  }
  async function put(key, value, etag) {
    await initialize();
    const data = JSON.stringify(value);
    if (Buffer.byteLength(data) > 3_000_000) throw new Error('Document exceeds limit');
    if (blobs) {
      return blobs.getBlockBlobClient(filename(key)).upload(data, Buffer.byteLength(data), {
        blobHTTPHeaders: { blobContentType: 'application/json' },
        tags: {
          kind: key.startsWith('session:')
            ? 'session'
            : key.startsWith('login:')
              ? 'login'
              : 'data',
        },
        conditions: etag ? { ifMatch: etag } : etag === null ? { ifNoneMatch: '*' } : undefined,
      });
    }
    const target = resolve(root, filename(key)),
      temp = target + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, data, { mode: 0o600, flag: 'wx' });
      await rename(temp, target);
    } catch (error) {
      try {
        await unlink(temp);
      } catch (cleanup) {
        if (cleanup.code !== 'ENOENT')
          console.error('Temporary document cleanup failed:', cleanup.code);
      }
      throw error;
    }
  }
  async function remove(key) {
    await initialize();
    if (blobs) await blobs.getBlockBlobClient(filename(key)).deleteIfExists();
    else
      try {
        await unlink(resolve(root, filename(key)));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
  }
  function transact(key, change) {
    const previous = locks.get(key) || Promise.resolve();
    const promise = previous
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { value, etag } = await get(key);
          const next = await change(value);
          try {
            await put(key, next, etag);
            return next;
          } catch (e) {
            if (e.statusCode !== 409 && e.statusCode !== 412) throw e;
          }
        }
        throw new Error('Data changed on another device. Retry.');
      });
    locks.set(key, promise);
    promise
      .finally(() => {
        if (locks.get(key) === promise) locks.delete(key);
      })
      .catch(() => {});
    return promise;
  }
  return {
    async accountSummaries() {
      await initialize();
      const users = [];
      let scanned = 0,
        truncated = false;
      const names = blobs ? blobs.listBlobsFlat() : await readdir(root);
      for await (const entry of names) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        if (++scanned > 10000) {
          truncated = true;
          break;
        }
        let value;
        try {
          const data = blobs
            ? await blobs.getBlockBlobClient(name).downloadToBuffer()
            : await readFile(resolve(root, name));
          value = JSON.parse(data.toString('utf8'));
        } catch (e) {
          if (e.code === 'ENOENT' || e.statusCode === 404) continue;
          throw e;
        }
        if (
          !value?.deleting &&
          /^[a-f0-9]{64}$/.test(value?.id || '') &&
          value?.email &&
          value?.training &&
          value?.games
        ) {
          users.push({
            name: value.name,
            email: value.email,
            createdAt: value.createdAt,
            lastLoginAt: value.lastLoginAt || null,
          });
        }
      }
      return { users: users.sort((a, b) => b.createdAt - a.createdAt), truncated };
    },
    get,
    put,
    remove,
    transact,
    durable: !!blobs,
    kind: blobs ? 'azure-blob' : 'local-file',
  };
}
