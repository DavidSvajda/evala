import { chromium } from 'playwright';
import { cp,readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Chess } from 'chess.js';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';

await mkdir('test-results',{recursive:true});
const extensionPath=resolve('test-results/remote-bar-extension');
await cp('dist',extensionPath,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(extensionPath,'manifest.json'),'utf8'));
// Grant only the test localhost host up front, so headless Chrome needs no
// interactive optional-permission dialog. Production requests it on Connect.
manifest.host_permissions.push('http://127.0.0.1/*');
await writeFile(resolve(extensionPath,'manifest.json'),JSON.stringify(manifest));
const context=await chromium.launchPersistentContext(resolve('test-results/remote-bar-profile'),{executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,viewport:{width:1440,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--enable-unsafe-extension-debugging']});
const page=context.pages()[0];let backend;
try{
  const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:extensionPath});
  backend=createAnalysisServer({token:'remote-bar-test',origins:[`chrome-extension://${id}`]});let calls=0;
  backend.on('request',req=>{if(req.url==='/api/analyze')calls++;});
  await new Promise(done=>backend.listen(0,'127.0.0.1',done));
  await page.goto(`chrome-extension://${id}/study.html`);
  await page.locator('#toggle-settings').click();await page.locator('#backend').selectOption('server');
  await page.locator('#server-url').fill(`http://127.0.0.1:${backend.address().port}`);await page.locator('#server-url').dispatchEvent('change');
  await page.locator('#server-token').fill('remote-bar-test');await page.locator('#server-token').dispatchEvent('change');
  await page.locator('#test-server').click();await page.waitForFunction(()=>document.querySelector('#server-status').textContent.startsWith('Připojeno'));
  await page.locator('#bar-server').check();await page.waitForFunction(()=>document.querySelector('#server-status').textContent.includes('zapnutý i pro evaluation bar'));
  const chess=new Chess(),fen=chess.fen();let pieces='';
  for(const row of chess.board())for(const p of row)if(p)pieces+=`<div class="piece ${p.color}${p.type} square-${'abcdefgh'.indexOf(p.square[0])+1}${p.square[1]}"></div>`;
  await context.route('https://www.chess.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>body{margin:120px 240px}wc-chess-board{display:block;position:relative;width:560px;height:560px}</style></head><body><wc-chess-board>${pieces}</wc-chess-board><script>document.querySelector('wc-chess-board').game={getFEN:()=>${JSON.stringify(fen)}};</script></body></html>`}));
  await page.goto('https://www.chess.com/game/live/123456789');
  await page.waitForFunction(()=>document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state==='done',{}, {timeout:30000});
  assert.ok(calls>=1);assert.match(await page.locator('evala-bar .engine-name').textContent(),/server/);
  chess.move('e4');
  await page.evaluate(fen=>{const b=document.querySelector('wc-chess-board');b.game.getFEN=()=>fen;b.querySelector('.square-52').classList.replace('square-52','square-54');},chess.fen());
  const background=context.serviceWorkers()[0];let status,deadline=Date.now()+15000;
  do{const [tab]=await background.evaluate(()=>chrome.tabs.query({active:true,currentWindow:true}));status=await background.evaluate(id=>chrome.tabs.sendMessage(id,{type:'evala-status'}),tab.id);if(status.fen===chess.fen()&&status.state==='done')break;await new Promise(done=>setTimeout(done,100));}while(Date.now()<deadline);
  assert.equal(status.fen,chess.fen());assert.equal(status.state,'done');assert.equal(status.settings.backend,'server');assert.ok(calls>=2);
  console.log('PASS: Connect → session token → live Chess.com bar → actual remote Full Stockfish → automatic re-evaluation after e2e4.');
}finally{await context.close();if(backend){backend.closeAllConnections();await new Promise(done=>backend.close(done));}}
