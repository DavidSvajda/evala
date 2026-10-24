import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

await mkdir('test-results',{recursive:true});
const executablePath = process.env.EVALA_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const context = await chromium.launchPersistentContext(resolve('test-results/extension-profile'), {
  executablePath, headless:true, viewport:{width:1440,height:1000},
  ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--enable-unsafe-extension-debugging'],
});
const page = context.pages()[0];
const errors = [];
page.on('pageerror',error=>errors.push(error.message));
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked',{path:resolve(process.env.EVALA_EXTENSION_DIR || 'dist')});
  console.log(`Loaded real MV3 extension ${id}`);
  const popup = await context.newPage();
  popup.on('pageerror', error => errors.push(error.message));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.locator('#settings [data-preset="balanced"]').waitFor();
  assert.equal(await popup.locator('#depth').inputValue(), '18');
  assert.equal(await popup.locator('.power').getAttribute('aria-label'), 'Pozastavit engine');
  if (process.env.EVALA_EXTENSION_DIR === 'dist-bar') assert.equal(await popup.locator('.study-link').count(), 0);
  await popup.screenshot({path:'test-results/extension-popup.png'});
  await popup.close();
  console.log('PASS: popup settings initialize without JavaScript errors');
  // Same extension iframe/worker/storage path as the installed product.
  await page.goto(`chrome-extension://${id}/demo.html`);
  await page.waitForFunction(()=>document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state==='done',{}, {timeout:30000});
  assert.ok(!['—',''].includes(await page.locator('evala-bar .value').textContent()));
  console.log('PASS: extension-origin WASM + CSP + chrome.storage');

  const fen = 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const chess = new Chess(fen);
  let pieces='';
  for(const row of chess.board()) for(const p of row) if(p) pieces+=`<div class="piece ${p.color}${p.type} square-${'abcdefgh'.indexOf(p.square[0])+1}${p.square[1]}" style="left:${'abcdefgh'.indexOf(p.square[0])*12.5}%;top:${(8-Number(p.square[1]))*12.5}%"></div>`;
  await context.route('https://www.chess.com/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Chess.com adapter fixture</title><style>body{background:#302e2b;margin:120px 240px}wc-chess-board{display:block;position:relative;width:560px;height:560px;background:#bbb}.piece{position:absolute;width:12.5%;height:12.5%}</style></head><body><wc-chess-board>${pieces}</wc-chess-board><script>document.querySelector('wc-chess-board').game={getFEN:()=>${JSON.stringify(fen)}};</script></body></html>`}));
  await page.goto('https://www.chess.com/game/live/123456789');
  await page.waitForFunction(()=>document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state==='done',{}, {timeout:30000});
  assert.match(await page.locator('evala-bar .value').textContent(),/^\+/);
  console.log('PASS: Chess.com live-game route → MAIN bridge → content → background → offscreen → Stockfish worker');
  // Simulate two actual board mutations on the live game route, without reloading.
  for(const [san,from,to,top] of [['e4','square-52','square-54','50%'],['e5','square-57','square-55','37.5%']]) {
    chess.move(san);
    const expected=chess.fen();
    await page.evaluate(({expected,from,to,top})=>{
      const b=document.querySelector('wc-chess-board');
      b.game.getFEN=()=>expected;
      const p=b.querySelector('.'+from);p.classList.replace(from,to);p.style.top=top;
    },{expected,from,to,top});
    const background=context.serviceWorkers()[0];
    let status;
    const deadline=Date.now()+15000;
    do {
      const [tab]=await background.evaluate(()=>chrome.tabs.query({active:true,currentWindow:true}));
      status=await background.evaluate(id=>chrome.tabs.sendMessage(id,{type:'evala-status'}),tab.id);
      if(status.fen===expected && status.state==='done')break;
      await new Promise(done=>setTimeout(done,100));
    }while(Date.now()<deadline);
    assert.equal(status.fen,expected,`live ${san} must update FEN automatically`);
    assert.equal(status.state,'done');
    assert.ok(status.score.value>500,'White perspective must remain consistent after both sides move');
  }
  console.log('PASS: live game automatically re-evaluates e2e4 and e7e5 with correct turn/sign, no manual FEN and no page reload');
  await page.screenshot({path:'test-results/chesscom-extension.png'});

  const names={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
  pieces='';
  for(const row of chess.board()) for(const p of row) if(p) pieces+=`<piece class="${p.color==='w'?'white':'black'} ${names[p.type]}" style="left:${'abcdefgh'.indexOf(p.square[0])*12.5}%;top:${(8-Number(p.square[1]))*12.5}%"></piece>`;
  await context.route('https://lichess.org/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><title>Lichess adapter fixture</title><style>body{background:#262421;margin:120px 240px}cg-board{display:block;position:relative;width:560px;height:560px;background:#bbb}piece{position:absolute;width:12.5%;height:12.5%}</style></head><body><div class="cg-wrap orientation-white"><cg-board data-fen="${chess.fen()}">${pieces}</cg-board></div></body></html>`}));
  await page.goto('https://lichess.org/analysis');
  await page.waitForFunction(()=>document.querySelector('evala-bar')?.shadowRoot.querySelector('.rail').dataset.state==='done',{}, {timeout:30000});
  assert.match(await page.locator('evala-bar .value').textContent(),/^\+/);
  console.log('PASS: Lichess board adapter + actual extension pipeline');
  assert.deepEqual(errors,[]);
} finally { await context.close(); }
