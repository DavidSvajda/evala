import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'dist');
if (dirname(out) !== resolve(root)) throw new Error('Build output must stay inside the project.');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(resolve(root, 'public'), out, { recursive: true });
const common = { absWorkingDir: resolve(root), tsconfigRaw: {}, bundle: true, target: 'chrome111', logLevel: 'info', legalComments: 'eof', minify: true };
await build({ ...common, entryPoints: ['src/content.js','src/bridge.js','src/background.js','src/engine/frame.js','src/engine/offscreen.js'], outdir: out, entryNames: '[name]', format: 'iife', loader: { '.css': 'text' } });
// Extension entrypoints may use top-level await; browsers load these as modules.
await build({ ...common, entryPoints: {'popup':'src/popup.js','demo':'src/demo.js','study':'src/study/app.js'}, outdir: out, format: 'esm', loader: { '.css': 'text' } });
await cp(resolve(out,'frame.js'), resolve(out,'engine-frame.js'));
await rm(resolve(out,'frame.js'));
await cp(resolve(root,'src/ui/theme.css'), resolve(out,'theme.css'));
for (const html of ['popup','demo','study']) {
  const path = resolve(out, `${html}.html`);
  await writeFile(path, (await readFile(path,'utf8')).replace(`<script src="${html}.js" defer>`, `<script src="${html}.js" type="module">`));
}
await mkdir(resolve(out,'engine'), { recursive: true });
for (const ext of ['js','wasm']) await cp(resolve(root,`node_modules/stockfish/bin/stockfish-19-lite-single.${ext}`), resolve(out,`engine/stockfish-19-lite-single.${ext}`));
for (const ext of ['js','wasm']) await cp(resolve(root,`node_modules/stockfish/bin/stockfish-19-single.${ext}`), resolve(out,`engine/stockfish-19-single.${ext}`));
await cp(resolve(root,'node_modules/stockfish/Copying.txt'), resolve(out,'engine/COPYING.txt'));
await cp(resolve(root,'node_modules/stockfish/README.md'), resolve(out,'engine/UPSTREAM-README.md'));
await cp(resolve(root,'LICENSE'), resolve(out,'LICENSE'));
await cp(resolve(root,'THIRD_PARTY_NOTICES.md'), resolve(out,'THIRD_PARTY_NOTICES.md'));
await mkdir(resolve(out,'fonts'), { recursive: true });
for (const subset of ['latin','latin-ext']) await cp(resolve(root,`node_modules/@fontsource-variable/manrope/files/manrope-${subset}-wght-normal.woff2`),resolve(out,`fonts/manrope-${subset}-wght-normal.woff2`));
await cp(resolve(root,'node_modules/@fontsource-variable/manrope/LICENSE'), resolve(out,'fonts/OFL.txt'));
await mkdir(resolve(out,'icons'), { recursive: true });
const icon = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"><rect width="128" height="128" rx="27" fill="#20231f"/><rect x="32" y="25" width="24" height="78" rx="6" fill="#f2f0e9"/><rect x="72" y="25" width="24" height="78" rx="6" fill="#4c5145"/><path d="M72 65h24v32a6 6 0 0 1-6 6H78a6 6 0 0 1-6-6z" fill="#d5b77a"/></svg>`;
for (const size of [16,32,48,128]) await sharp(Buffer.from(icon)).resize(size,size).png().toFile(resolve(out,`icons/${size}.png`));
for (const color of ['w','b']) for (const type of ['K','Q','R','B','N','P']) await access(resolve(out,`pieces/${color}${type}.svg`));
const total = (await readFile(resolve(out,'engine/stockfish-19-lite-single.wasm'))).length;
console.log(`Evala built in dist/ · Stockfish WASM ${(total/1024/1024).toFixed(2)} MiB · no remote runtime dependencies`);
