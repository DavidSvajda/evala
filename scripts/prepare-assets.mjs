import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';

await mkdir('public/pieces', { recursive: true });
for (const color of ['w','b']) for (const type of ['K','Q','R','B','N','P']) {
  const name = `${color}${type}.svg`;
  const url = `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett/${name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const data = await response.text();
  if (!data.includes('<svg')) throw new Error(`Invalid SVG: ${name}`);
  await writeFile(`public/pieces/${name}`, data);
}
await copyFile('node_modules/stockfish/Copying.txt','LICENSE');
const metadata = await (await fetch('https://registry.npmjs.org/stockfish/19.0.1')).json();
const tagResponse = await fetch('https://api.github.com/repos/nmrugg/stockfish.js/git/ref/tags/v19.0.1', {headers:{'User-Agent':'Evala-build'}});
if (!tagResponse.ok) throw new Error(`Cannot resolve source tag: ${tagResponse.status}`);
let object = (await tagResponse.json()).object;
if (object.type === 'tag') {
  const tag = await (await fetch(object.url,{headers:{'User-Agent':'Evala-build'}})).json();
  object = tag.object;
}
const revision = metadata.gitHead || object.sha;
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Missing exact engine source revision');
await writeFile('public/engine-source.json', JSON.stringify({ package:'stockfish', version:'19.0.1', gitHead:revision, sourceTag:'v19.0.1', repository:'https://github.com/nmrugg/stockfish.js', tarball:metadata.dist.tarball, integrity:metadata.dist.integrity }, null, 2));
if (revision) {
  await mkdir('vendor-source',{recursive:true});
  const response = await fetch(`https://codeload.github.com/nmrugg/stockfish.js/tar.gz/${revision}`);
  if (!response.ok) throw new Error(`Engine source download: ${response.status}`);
  await writeFile(`vendor-source/stockfish-${revision}.tar.gz`,Buffer.from(await response.arrayBuffer()));
}
console.log('Vendored 12 chess piece SVGs, GPL license, engine provenance and corresponding source archive.');
