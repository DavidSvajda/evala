import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist-bar');
const release = resolve(root, 'release');
if (dirname(out) !== resolve(root) || out !== resolve(root, 'dist-bar')) throw new Error('Output must stay inside the project.');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await mkdir(release, { recursive: true });

for (const path of [
  'background.js', 'bridge.js', 'content.js', 'offscreen.js', 'offscreen.html',
  'popup.html', 'popup.js', 'popup.css', 'theme.css',
  'demo.html', 'demo.js', 'demo.css', 'engine.html', 'engine-frame.js',
  'engine-source.json', 'privacy.html', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'icons', 'fonts', 'pieces',
]) await cp(resolve(root, 'dist', path), resolve(out, path), { recursive: true });
await mkdir(resolve(out, 'engine'), { recursive: true });
for (const path of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'COPYING.txt', 'UPSTREAM-README.md']) {
  await cp(resolve(root, 'dist/engine', path), resolve(out, 'engine', path));
}
const provenance = JSON.parse(await readFile(resolve(out, 'engine-source.json'), 'utf8'));
await cp(resolve(root, `vendor-source/stockfish-${provenance.gitHead}.tar.gz`), resolve(out, 'engine/stockfish-js-source.tar.gz'));

const manifest = JSON.parse(await readFile(resolve(root, 'dist/manifest.json'), 'utf8'));
manifest.name = 'Evala — Evaluation Bar';
manifest.description = 'Lokální Stockfish 19 Lite: evaluation bar vedle šachovnice Chess.com a Lichess, nastavení výkonu a zkušební deska.';
delete manifest.host_permissions;
delete manifest.optional_host_permissions;
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const popupPath = resolve(out, 'popup.html');
await writeFile(popupPath, (await readFile(popupPath, 'utf8'))
  .replace(/<button class="study-link demo-link">[\s\S]*?<\/button>/, '')
  .replace('Stockfish 19 ·', 'Stockfish 19 Lite ·'));
const noticesPath = resolve(out, 'THIRD_PARTY_NOTICES.md');
await writeFile(noticesPath, (await readFile(noticesPath, 'utf8'))
  .replace('Stockfish 19 Full NNUE and Lite single-thread', 'Stockfish 19 Lite single-thread')
  .replace('Corresponding engine source archive is supplied with the release in engine-source/.', 'Corresponding engine source archive: engine/stockfish-js-source.tar.gz.'));
await writeFile(resolve(out, 'INSTALACE.txt'), `Evala ${manifest.version} — samotný evaluation bar

1. V Chrome otevři chrome://extensions.
2. Zapni Režim pro vývojáře.
3. Klikni Načíst rozbalené a vyber tuto složku dist-bar (obsahuje manifest.json).
4. Obnov již otevřené stránky Chess.com nebo Lichess.
5. Nastavení a zkušební desku otevřeš přes ikonu rozšíření.

Výpočet běží lokálně přes Stockfish 19 Lite. Není potřeba Node.js ani server.
Rozšíření používej pro rozbor, trénink a povolené sledování.
Pro aktualizaci stejné instalace ponech složku na stejném místě a klikni Znovu načíst.

Opětovné sestavení ze zdrojů: npm ci; npm run build:bar
`);

async function filesIn(dir) {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await filesIn(path));
    else paths.push(path);
  }
  return paths;
}
const files = {};
let bytes = 0;
for (const path of await filesIn(out)) {
  const data = new Uint8Array(await readFile(path));
  files[relative(out, path).replaceAll('\\', '/')] = data;
  bytes += data.length;
}
const zip = zipSync(files, { level: 6 });
await writeFile(resolve(release, `evala-bar-${manifest.version}.zip`), zip);

const source = {};
for (const dir of ['src', 'server', 'scripts', 'tests', 'public', '.github', 'vendor-source']) {
  for (const path of await filesIn(resolve(root, dir))) source[relative(root, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
}
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && (/\.md$/.test(entry.name) || ['package.json', 'package-lock.json', 'LICENSE', 'Dockerfile', 'Dockerfile.azure', 'compose.yaml', '.dockerignore', '.gitignore'].includes(entry.name))) {
    source[entry.name] = new Uint8Array(await readFile(resolve(root, entry.name)));
  }
}
await writeFile(resolve(release, `evala-bar-${manifest.version}-source.zip`), zipSync(source, { level: 6 }));
console.log(`Evaluation bar: dist-bar/ ${(bytes / 1024 / 1024).toFixed(2)} MiB; ZIP ${(zip.length / 1024 / 1024).toFixed(2)} MiB + source ZIP.`);
