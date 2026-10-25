// Bounded UI check: one browser, fixture engine, no game-wide calculations.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {Chess} from 'chess.js';
import {parsePgn,DEMO_PGN} from '../src/study/game.js';
import {createAnalysisServer} from '../server/index.mjs';
const server=createAnalysisServer({token:'learning-smoke',publicReports:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.setDefaultTimeout(6000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE:',e.message);});let lastFen='',engineScore=0;
await page.route('**/api/analyze',async route=>{
  const {fen}=route.request().postDataJSON();lastFen=fen;const chess=new Chess(fen),pv=[];
  for(let i=0;i<4;i++){const move=chess.moves({verbose:true})[0];if(!move)break;pv.push(move.from+move.to+(move.promotion||''));chess.move(move);}
  const result={kind:'cp',value:engineScore,depth:18,time:5,lines:[{kind:'cp',value:engineScore,depth:18,pv}],terminal:new Chess(fen).isGameOver()};
  await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'done',result})+'\n'});
});
try{
  await page.goto(base+'/study.html#/home');
  const g=parsePgn(DEMO_PGN);g.headers.White='Schweits';g.pgn=g.pgn.replace('[White "Bílý"]','[White "Schweits"]');
  g.analysis={complete:true,positions:g.fens.map((fen,i)=>({kind:'cp',value:i===12?300:20,depth:18,lines:[{kind:'cp',value:i===12?300:20,depth:18,pv:[g.moves[i]?.uci||'a2a3']},{kind:'cp',value:i===14?-200:0,depth:18,pv:[]}]})),moves:g.moves.map(()=>({kind:'brilliant',loss:0,accuracy:100}))};
  await page.evaluate(async g=>{
    localStorage.setItem('evala-display:guest',JSON.stringify({onboardingComplete:true,chessUsername:'Schweits'}));localStorage.setItem('evala-study-options',JSON.stringify({lastUsername:'Schweits'}));
    const db=await new Promise((r,j)=>{const q=indexedDB.open('evala-study',1);q.onupgradeneeded=()=>q.result.createObjectStore('games',{keyPath:'id'});q.onsuccess=()=>r(q.result);q.onerror=j;});
    await new Promise((r,j)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').put(g);tx.oncomplete=r;tx.onerror=j;});db.close();
  },g);
  await page.reload();await page.goto(base+'/study.html#/analysis');await page.locator('#learning-notes').waitFor();await page.locator('#next-move').click();
  await page.locator('#position-notes-detail > summary').click();await page.locator('#position-note').fill('Candidate d4');await page.locator('#critical-note').check();await page.locator('#save-position-note').click();await page.waitForFunction(()=>document.querySelector('#note-status').textContent.includes('uložena'));
  await page.locator('#compare-move').click();assert.equal(await page.locator('.compare-line').count(),2);await page.locator('.compare-line').last().click();await page.locator('#return-game').click();
  await page.locator('#self-analysis').click();assert.equal(await page.locator('.study-eval').isVisible(),false);assert.equal(await page.locator('#analyze-position').isDisabled(),true);assert.equal(await page.locator('#study-board .board-mark').count(),0);
  await page.locator('#self-analysis').click();assert.equal(await page.locator('.study-eval').isVisible(),true);
  await page.locator('#position-notes-detail > details > summary').click();await page.locator('#share-notes input').check();
  const downloaded=page.waitForEvent('download');await page.locator('#share-pgn').click();const file=await downloaded;assert.match(await readFile(await file.path(),'utf8'),/Candidate d4/);
  await page.reload();await page.goto(base+'/study.html#/analysis');assert.equal(await page.locator('#position-note').inputValue(),'');await page.locator('#position-notes-detail > summary').click();await page.locator('#next-my-critical').click();assert.equal(await page.locator('#position-note').inputValue(),'Candidate d4');
  await page.goto(base+'/study.html#/practice');assert.ok(await page.locator('.repertoire-row').count()>0);
  for(const mode of ['mixed','defense','conversion','opening']){
    await page.locator('#practice-mode').selectOption(mode);engineScore=mode==='conversion'?300:0;await page.locator('#practice-next').click();await page.waitForFunction(()=>document.querySelector('#practice-status').textContent==='Zahraj tah na šachovnici.');
    let nextFen=lastFen;
    for(let step=1;step<=(['defense','conversion'].includes(mode)?8:1);step++){
      const before=new Chess(nextFen),m=before.moves({verbose:true})[0];
      for(const sq of [m.from,m.to])await page.locator(`#practice-board [data-square="${sq}"]`).click();
      if(m.promotion)await page.locator(`[data-promote="${m.promotion}"]`).click();
      await page.waitForFunction(step=>document.querySelector('#practice-result')?.textContent.includes(`· ${step}/`),step);
      if(await page.locator('#practice-playback').isVisible())break;
      const reply=new Chess(lastFen);if(!reply.isGameOver())reply.move(reply.moves({verbose:true})[0]);nextFen=reply.fen();
    }
    await page.locator('#practice-playback').waitFor();
  }
  await mkdir('.local-data/learning-check',{recursive:true});await page.screenshot({path:'.local-data/learning-check/desktop.png'});
  await page.locator('#toggle-language').click();await page.setViewportSize({width:390,height:844});await page.goto(base+'/study.html#/practice');await page.getByRole('heading',{name:'Practice room',exact:true}).waitFor();await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.local-data/learning-check/mobile.png',fullPage:true});
  await page.goto(base+'/study.html#/settings');await page.locator('#review-budget').selectOption('5');await page.locator('#pause-reviews').click();assert.ok((await page.locator('#review-pause-status').textContent())!=='—');await page.locator('#resume-reviews').click();assert.equal(await page.locator('#review-pause-status').textContent(),'—');
  assert.deepEqual(errors,[]);console.log('PASS: notes/reload/private PGN, self-analysis, comparison, four drill modes (fixture engine), repertoire, English/mobile, review limits.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
