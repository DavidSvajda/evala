import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('application, lockfile and extension have one release version', async () => {
  const [app, lock, extension] = await Promise.all(
    ['package.json', 'package-lock.json', 'public/manifest.json'].map(async (p) =>
      JSON.parse(await readFile(p, 'utf8')),
    ),
  );
  assert.equal(lock.version, app.version);
  assert.equal(lock.packages[''].version, app.version);
  assert.equal(extension.version, app.version);
});
