import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile,mkdir,mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair,SignJWT,jwtVerify } from 'jose';
import { Chess } from 'chess.js';
import { createAnalysisServer } from '../server/index.mjs';
import { createDocumentStore } from '../server/document-store.mjs';
import { startPuzzle } from '../src/training/logic.js';

const bank=JSON.parse(await readFile('public/data/puzzles.json','utf8')).puzzles;
const keys=await generateKeyPair('RS256'),client='fixture.apps.googleusercontent.com';
const server=createAnalysisServer({token:'test-owner',publicReports:true,accounts:{store:createDocumentStore({directory:await mkdtemp(join(tmpdir(),'evala-browser-'))}),googleClientId:client,verifyGoogle:async token=>(await jwtVerify(token,keys.publicKey,{audience:client,issuer:'https://accounts.google.com'})).payload}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});
const errors=[];let workers=0,wasm=0;
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('worker',()=>workers++);page.on('request',r=>{if(r.url().endsWith('.wasm'))wasm++;});
async function route(name){await page.goto(base+'/study.html#/'+name);await page.locator(`main[data-page="${name}"]`).waitFor();await page.locator('#home-board img').first().waitFor({state:'attached'});}
async function playMove(uci){await page.locator(`#puzzle-board [data-square="${uci.slice(0,2)}"]`).click();await page.locator(`#puzzle-board [data-square="${uci.slice(2,4)}"]`).click();if(uci[4])await page.locator(`#puzzle-promotion [data-piece="${uci[4]}"]`).click();}
async function signIn(target){
  const config=await target.evaluate(async()=>await(await fetch('/api/account/config')).json());
  const credential=await new SignJWT({sub:'fixture-player',email:'player@example.test',email_verified:true,name:'Ukázkový účet',nonce:config.challenge}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience(client).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);
  const status=await target.evaluate(async({credential,challenge})=>{const response=await fetch('/api/account/google',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':challenge},body:JSON.stringify({credential})});return response.status;},{credential,challenge:config.challenge});assert.equal(status,200);await target.reload();
}
try{
  await route('home');assert.equal(await page.locator('#sidebar-user').textContent(),'Host');
  await route('games');await page.locator('#pgn-input').fill('[Event "Ukázková partie"]\n[White "Friend"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');await page.locator('#import-pgn').click();
  await page.locator('.game-item').first().waitFor();await page.locator('.game-item').first().click();
  await page.locator('#review-game').click();await page.waitForFunction(()=>document.querySelector('#review-state').textContent==='Uloženo',{}, {timeout:60000});
  assert.equal(await page.locator('#summary [data-color="w"]').evaluateAll(buttons=>buttons.reduce((n,b)=>n+Number(b.textContent),0)),2);
  await page.locator('#summary [data-jump-kind="blunder"][data-color="w"]').click();assert.match(await page.locator('#position-label').textContent(),/g4/);
  await page.keyboard.press('Home');const initial=await page.locator('#position-label').textContent();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#position-label').textContent(),initial);
  await page.locator('#analysis-lines-tab').click();await page.locator('.game-note>summary').click();await page.locator('#game-note').fill('Zkontrolovat slabou diagonálu ke králi.');await page.locator('#game-note').blur();
  assert.equal(workers,0);assert.equal(wasm,0);
  await route('settings');await page.locator('[data-board-theme="walnut"]').click();await page.locator('#linked-username').fill('Friend');await page.locator('#save-chess-profile').click();
  await page.reload();await page.waitForFunction(()=>document.body.dataset.boardTheme==='walnut');assert.equal(await page.locator('body').getAttribute('data-board-theme'),'walnut');
  await route('puzzles');await page.waitForFunction(()=>document.querySelector('#puzzle-status').textContent==='Najdi nejlepší tah');
  let id=(await page.locator('#puzzle-number').textContent()).replace('Úloha ','').trim(),puzzle=bank.find(p=>p.id===id);assert.ok(puzzle);
  assert.equal((await page.locator('#puzzle-level').textContent()).replace(/\D/g,''),String(puzzle.rating));
  for(let i=1;i<puzzle.moves.length;i+=2)await playMove(puzzle.moves[i]);
  await page.waitForFunction(()=>document.querySelector('.puzzle-feedback').dataset.state==='success');assert.equal(await page.locator('#session-solved').textContent(),'1');
  await page.locator('#next-puzzle').click();await page.waitForFunction(()=>document.querySelector('#puzzle-status').textContent==='Najdi nejlepší tah');
  id=(await page.locator('#puzzle-number').textContent()).replace('Úloha ','').trim();puzzle=bank.find(p=>p.id===id);
  const wrong=new Chess(startPuzzle(puzzle).fen).moves({verbose:true}).map(m=>m.from+m.to+(m.promotion||'')).find(m=>m!==puzzle.moves[1]);await playMove(wrong);
  await page.waitForFunction(()=>document.querySelector('.puzzle-feedback').dataset.state==='incorrect');await page.locator('#puzzle-hint').click();await page.locator('#puzzle-reveal').click();await page.locator('#replay-solution').waitFor();
  await signIn(page);await page.waitForFunction(()=>document.querySelector('#sidebar-user').textContent==='Ukázkový účet');
  await route('account');await page.locator('#import-guest-games').click();await page.waitForFunction(()=>document.querySelector('#nav-game-count').textContent==='1');await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:'.impeccable/review/account-signed-in.png',fullPage:true});
  await route('settings');await page.locator('[data-board-theme="blue"]').click();await page.waitForTimeout(800);
  const other=await browser.newContext({viewport:{width:1440,height:900}}),second=await other.newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(base+'/study.html');await second.locator('#home-board img').first().waitFor({state:'attached'});await signIn(second);await second.locator('#home-board img').first().waitFor({state:'attached'});
  assert.equal(await second.locator('#nav-game-count').textContent(),'1');assert.equal(await second.locator('body').getAttribute('data-board-theme'),'blue');
  await second.goto(base+'/study.html#/games');await second.locator('.game-item').first().click();await second.locator('#analysis-lines-tab').click();await second.locator('.game-note>summary').click();assert.equal(await second.locator('#game-note').inputValue(),'Zkontrolovat slabou diagonálu ke králi.');assert.equal(await second.locator('#review-state').textContent(),'Uloženo');await other.close();
  await route('account');await page.locator('#logout-account').click();await page.waitForFunction(()=>document.querySelector('#sidebar-user').textContent==='Host');
  await route('games');assert.equal(await page.locator('.game-item').count(),1);
  await route('analysis');const wide=await page.locator('#study-board').boundingBox();await page.locator('#toggle-sidebar').click();await page.waitForFunction(width=>document.querySelector('#study-board').getBoundingClientRect().width>width+30,wide.width);await page.screenshot({path:'.impeccable/review/analysis-collapsed.png',fullPage:true});await page.locator('#toggle-sidebar').click();
  await page.locator('#toggle-language').click();await page.waitForFunction(()=>document.documentElement.lang==='en');
  const missing=new Set();
  for(const name of ['home','games','analysis','puzzles','insights','settings','account']){
    await route(name);
    const found=await page.locator(`main[data-page="${name}"]`).evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),missing=[];while(walker.nextNode()){const node=walker.currentNode,p=node.parentElement;if(p?.closest('textarea,script,style,[data-i18n-ignore],#game-title,#game-subtitle,.summary-name,.recent-players strong,.analytics-overview h2,.player-name,.line-san,.move-san'))continue;if(p?.getClientRects().length&&/[ěščřžýáíéůúďťňĚŠČŘŽÝÁÍÉŮÚĎŤŇ]/.test(node.nodeValue))missing.push(node.nodeValue.trim());}return missing.filter(Boolean);});found.forEach(t=>missing.add(t));
  }
  if(missing.size)console.log('UNTRANSLATED:',JSON.stringify([...missing]));assert.deepEqual([...missing],[],'English pages must not leave Czech interface copy');
  await route('home');assert.equal(await page.locator('.overview-page h1').textContent(),'Overview');await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:'.impeccable/review/english-desktop.png',fullPage:true});
  await page.locator('#toggle-language').click();await page.waitForFunction(()=>document.documentElement.lang==='cs');
  await route('settings');await page.locator('[data-board-theme="sage"]').click();await page.locator('#toast').waitFor({state:'hidden'});
  await mkdir('.impeccable/review',{recursive:true});
  for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const name of ['home','games','analysis','puzzles','insights','settings']){
      await route(name);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} overflow at ${viewport.width}`);
      const filename=viewport.width===1440&&name==='home'?'desktop':viewport.width===390&&name==='home'?'mobile':`${name}-${viewport.width}`;
      await page.screenshot({path:`.impeccable/review/${filename}.png`,fullPage:true});
      if(name==='analysis'){await page.locator('#analysis-moves-tab').click();await page.screenshot({path:`.impeccable/review/analysis-moves-${viewport.width}.png`,fullPage:true});await page.locator('#analysis-summary-tab').click();}
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: routed pages, real hosted Stockfish review, keyboard, notes, legal multi-move puzzles, wrong moves/hints, persistence, signed account fixtures, isolated cross-device sync, guest restoration, themes, and responsive layouts. Google signature verification uses a local test key; real Google sign-in is verified separately.');
}finally{await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
