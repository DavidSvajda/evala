import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Assets are vendored and reviewed in Git. Builds never download moving tags,
// remote SVG markup or unverified engine archives into the source tree.
const manifest = JSON.parse(await readFile(new URL('./asset-integrity.json', import.meta.url)));
for (const [path, expected] of Object.entries(manifest)) {
  if (
    !/^(LICENSE|public\/engine-source\.json|public\/pieces\/[wb][KQRBNP]\.svg|vendor-source\/stockfish-[a-f0-9]{40}\.tar\.gz)$/.test(
      path,
    )
  )
    throw new Error('Unexpected vendored asset path');
  const actual = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
  if (actual !== expected) throw new Error('Vendored asset checksum mismatch: ' + path);
}
console.log('Verified vendored chess assets and engine provenance without network access.');
