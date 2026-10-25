import { assertAssetTree, assertPublishablePath } from './release-safety.mjs';
import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';
async function filesIn(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    assertPublishablePath(path);
    if (entry.isSymbolicLink()) throw new Error('Symlink in source package: ' + path);
    if (entry.isDirectory()) result.push(...(await filesIn(path)));
    else result.push(path);
  }
  return result;
}
await assertAssetTree('dist');
await mkdir('release', { recursive: true });
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const files = {};
for (const path of await filesIn('dist'))
  files[relative('dist', path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
await writeFile(`release/evala-${version}.zip`, zipSync(files, { level: 6 }));
const web = {};
for (const [path, data] of Object.entries(files))
  if (
    ![
      'manifest.json',
      'background.js',
      'bridge.js',
      'content.js',
      'offscreen.js',
      'offscreen.html',
      'popup.html',
      'popup.js',
      'popup.css',
    ].includes(path)
  )
    web[path] = data;
web['index.html'] = files['study.html'];
await writeFile(`release/evala-${version}-web.zip`, zipSync(web, { level: 6 }));
const source = {};
for (const dir of ['src', 'server', 'scripts', 'tests', 'public', '.github'])
  for (const path of await filesIn(dir))
    source[path.replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
for (const path of [
  'eslint.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
  '.gitattributes',
  'ARCHITECTURE.md',
  'SECURITY.md',
  'CODE_REVIEW_2026-10-25.md',
  'PERFORMANCE_2026_10_25.md',
  'package.json',
  'package-lock.json',
  'README.md',
  'RESEARCH.md',
  'PRIVACY.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSE',
  'PRODUCT.md',
  'DESIGN.md',
  'TESTING.md',
  'HOSTING_RESEARCH.md',
  'DEPLOYMENT.md',
  'AZURE_DEPLOYMENT.md',
  'INSIGHTS_RESEARCH.md',
  'STORE_LISTING.md',
  'Dockerfile',
  'Dockerfile.azure',
  'compose.yaml',
  '.dockerignore',
  '.gitignore',
])
  source[path] = new Uint8Array(await readFile(path));
await writeFile(`release/evala-${version}-source.zip`, zipSync(source, { level: 6 }));
await cp('vendor-source', 'release/engine-source', { recursive: true });
await cp('README.md', 'release/README.md');
console.log(
  `Release ${version}: extension ZIP + standalone web ZIP + source ZIP + corresponding engine source.`,
);
