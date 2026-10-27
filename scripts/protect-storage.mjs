import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { BlobServiceClient } from '@azure/storage-blob';
const connection = (
  await readFile('.local-data/deployment/account-storage-connection.txt', 'utf8')
).trim();
const service = BlobServiceClient.fromConnectionString(connection);
// Provisioning enables blob/container soft delete through Azure management API.
// This data-plane command only verifies retention and an actual recovery.
const properties = await service.getProperties();
assert.equal(properties.deleteRetentionPolicy.days, 7);
const container = service.getContainerClient('evala-restore-check-' + randomUUID());
await container.create();
const blob = container.getBlockBlobClient('restore-fixture.json'),
  content = '{"fixture":"recovery-check"}';
try {
  await blob.upload(content, Buffer.byteLength(content));
  const original = await blob.getProperties();
  await blob.delete();
  await blob.undelete();
  if (properties.isVersioningEnabled)
    await blob.beginCopyFromURL(blob.withVersion(original.versionId).url);
  assert.equal((await blob.downloadToBuffer()).toString(), content);
  console.log(
    'PASS: seven-day blob protection and recovery of a disposable fixture. Production documents were not read or modified.',
  );
} finally {
  await container.deleteIfExists();
}
