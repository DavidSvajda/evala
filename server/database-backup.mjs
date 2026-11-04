import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobServiceClient } from '@azure/storage-blob';
import { streamPostgres } from './database-snapshot.mjs';

// One private daily snapshot; account-wide Blob soft deletion retains overwritten
// versions for seven days. Sessions and login nonces deliberately never enter backups.
export function scheduleDatabaseBackup(pool) {
  const connection = process.env.ACCOUNT_STORAGE_CONNECTION_STRING;
  if (!connection || process.env.DATABASE_BACKUPS !== 'true') return () => {};
  let busy = false;
  const container =
    BlobServiceClient.fromConnectionString(connection).getContainerClient('evala-database-backups');
  async function backup() {
    if (busy) return;
    busy = true;
    try {
      await container.createIfNotExists();
      const blob = container.getBlockBlobClient('latest.json.gz');
      let modified = 0;
      try {
        modified = (await blob.getProperties()).lastModified.getTime();
      } catch (e) {
        if (e.statusCode !== 404) throw e;
      }
      if (Date.now() - modified < 20 * 3600000) return;
      const gzip = createGzip();
      const upload = blob
        .uploadStream(gzip, 256 * 1024, 2, {
          blobHTTPHeaders: { blobContentType: 'application/gzip' },
        })
        .catch((error) => {
          gzip.destroy(error);
          throw error;
        });
      await Promise.all([pipeline(Readable.from(streamPostgres(pool)), gzip), upload]);
      console.log('Private database backup completed.');
    } catch (error) {
      console.error('Database backup failed:', error.code || 'unknown');
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(backup, 3600000);
  timer.unref();
  backup();
  return () => clearInterval(timer);
}
