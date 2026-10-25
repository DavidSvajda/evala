import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';

const receipt=JSON.parse(await readFile('.local-data/deployment/deployment.json','utf8'));
const base=process.env.EVALA_PUBLIC_URL||receipt.url;
const browser=await chromium.launch({executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));let workers=0;page.on('worker',()=>workers++);
try{
  await page.goto(base+'/study.html#/home');await page.locator('#home-board img').first().waitFor({state:'attached'});
  const config=await page.evaluate(async()=>await(await fetch('/api/account/config')).json());assert.equal(config.enabled,true);assert.equal(config.persistent,true);assert.ok(config.googleClientId.endsWith('.apps.googleusercontent.com'));
  await page.goto(base+'/study.html#/games');await page.locator('#pgn-input').fill('[Event "Production QA fixture"]\n[White "Fixture"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');await page.locator('#import-pgn').click();await page.locator('.game-item').first().click();
  await page.locator('#review-game').click();await page.waitForFunction(()=>document.querySelector('#review-state').textContent==='Uloženo',{}, {timeout:120000});
  assert.equal(await page.locator('#summary [data-color="w"]').evaluateAll(nodes=>nodes.reduce((sum,node)=>sum+Number(node.textContent),0)),2);
  await page.locator('#summary [data-jump-kind="blunder"][data-color="w"]').click();assert.match(await page.locator('#position-label').textContent(),/g4/);
  if(process.env.EVALA_EXPECT_COACH==='true'){await page.locator('#gm-retry-btn').click();assert.match(await page.locator('#retry-feedback').textContent(),/Zahraj lepší tah/);}
  await page.goto(base+'/study.html#/puzzles');await page.waitForFunction(()=>document.querySelector('#puzzle-status').textContent==='Najdi nejlepší tah');
  const bank=await page.evaluate(async()=>await(await fetch('/data/puzzles.json')).json()),id=(await page.locator('#puzzle-number').textContent()).replace('Úloha ','').trim(),puzzle=bank.puzzles.find(p=>p.id===id);assert.ok(puzzle);assert.match(await page.locator('#puzzle-level').textContent(),new RegExp(String(puzzle.rating)));
  for(let i=1;i<puzzle.moves.length;i+=2){const uci=puzzle.moves[i];for(const square of [uci.slice(0,2),uci.slice(2,4)])await page.locator(`#puzzle-board [data-square="${square}"]`).click();if(uci[4])await page.locator(`#puzzle-promotion [data-piece="${uci[4]}"]`).click();}
  await page.waitForFunction(()=>document.querySelector('.puzzle-feedback').dataset.state==='success');
  await page.locator('#toggle-language').click();await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.goto(base+'/study.html#/settings');await page.locator('#home-board img').first().waitFor({state:'attached'});assert.equal(await page.locator('.settings-page h1').textContent(),'Settings');
  await page.goto(base+'/study.html#/account');await page.locator('#google-signin iframe').waitFor({timeout:30000});
  await mkdir('.impeccable/review',{recursive:true});
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:width===390?844:768});
    for(const route of ['home','games','analysis','puzzles','insights','settings','account']){
      await page.goto(base+'/study.html#/'+route);await page.locator(`main[data-page="${route}"]`).waitFor();await page.locator('#home-board img').first().waitFor({state:'attached'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`production overflow: ${route} ${width}`);
      if(['analysis','puzzles','account'].includes(route))await page.screenshot({path:`.impeccable/review/production-${route}-${width}.png`,fullPage:true});
    }
  }
  assert.equal(workers,0);assert.deepEqual(errors,[]);
  const result={passed:true,url:base,checks:['production Google configuration and button','real native full-game review','move summary and jump','legal puzzle solution','English persistence','seven routes on desktop and mobile'],actualGoogleHumanLogin:'confirmed by user on 2026-10-25'};
  await mkdir('.local-data/audit-2026-10-25',{recursive:true});await writeFile('.local-data/audit-2026-10-25/production-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
