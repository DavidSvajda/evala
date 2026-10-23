import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from '../scripts/serve.mjs';
import { DEMO_PGN } from '../src/study/game.js';

await mkdir('test-results',{recursive:true});
const server=createServer(0);await new Promise(done=>server.on('listening',done));
const browser=await chromium.launch({executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/study.html?username=Schweits`);
  await page.locator('#pgn-input').fill(DEMO_PGN.replace('[White "Bílý"]','[White "Schweits"]'));
  await page.locator('#import-pgn').click();
  await page.locator('#toggle-settings').click();await page.locator('#profile').selectOption('quick');
  await page.locator('#study-time').fill('100');await page.locator('#study-time').dispatchEvent('change');await page.locator('#study-lines').selectOption('3');await page.locator('#close-settings').click();
  await page.locator('#review-game').click();
  await page.waitForFunction(()=>document.querySelector('#review-state').textContent==='Uloženo',{}, {timeout:90000});
  await page.locator('.move-button').first().click();
  for(const size of [{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:1280,height:640}]){
    await page.setViewportSize(size);
    const before=await page.locator('#study-board').boundingBox();
    for(let i=0;i<20;i++)await page.keyboard.press('ArrowRight');
    for(let i=0;i<8;i++)await page.keyboard.press('ArrowLeft');
    const after=await page.locator('#study-board').boundingBox();assert.deepEqual(after,before,'keyboard must keep board stationary');
    assert.equal(await page.evaluate(()=>scrollY),0);assert.ok(after.y+after.height<size.height-24);
    assert.ok(await page.locator('.board-mark').count());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight),true,'desktop workspace must fit viewport');
    assert.equal(await page.locator('.position-workspace').evaluate(el=>el.scrollHeight<=el.clientHeight),true,'export controls and graph must remain inside the center panel');
    await page.screenshot({path:`test-results/workspace-${size.width}x${size.height}.png`,fullPage:true});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#first-move').click();await page.locator('#study-board [data-square=e2]').focus();
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.square),'e2','board rebuild must retain keyboard focus');
  await page.keyboard.press('End');assert.equal(await page.locator('#last-move').isDisabled(),true);
  await page.locator('#view-analytics').click();await page.locator('#insight-username').fill('Schweits');await page.locator('#insights-form').getByRole('button').click();
  await page.getByRole('heading',{name:'Co procvičit',exact:true}).waitFor();
  assert.match(await page.locator('.result-labels').textContent(),/0 proher/);
  assert.ok(await page.locator('[data-moment]').count(),'insights must link real engine mistakes');
  await page.screenshot({path:'test-results/analytics-desktop.png',fullPage:true});
  await page.locator('#insight-color').selectOption('b');await page.getByRole('heading',{name:'Žádné odpovídající partie'}).waitFor();await page.locator('#insight-color').selectOption('all');
  const target=await page.locator('[data-moment]').first().textContent();assert.ok(target);
  await page.locator('[data-moment]').first().click();assert.equal(await page.locator('.workspace').isVisible(),true);assert.ok(await page.locator('.board-mark').count());
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile board must fit width');
  await page.screenshot({path:'test-results/workspace-mobile.png',fullPage:true});
  await page.locator('#view-analytics').click();await page.screenshot({path:'test-results/analytics-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile analytics must fit width');
  assert.deepEqual(errors,[]);
  console.log('PASS: real Stockfish review, four desktop viewport sizes without page scroll, keyboard/focus stability, board badges, player analytics, filters, training links and mobile layouts');
}finally{await browser.close();await new Promise(done=>server.close(done));}
