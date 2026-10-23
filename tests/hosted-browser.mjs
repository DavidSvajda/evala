import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server/index.mjs';

const server=createAnalysisServer({token:'hosted-browser-test'});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox']});
try{
  const page=await browser.newPage();let workers=0,wasm=0,requests=0;
  const errors=[];
  page.on('worker',()=>workers++);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('.wasm'))wasm++;if(request.url().endsWith('/api/analyze'))requests++;});
  await page.goto(base);
  await page.locator('#backend').waitFor({state:'visible'});
  assert.equal(await page.locator('#backend').inputValue(),'server');
  assert.equal(await page.locator('#server-url').inputValue(),base);
  await page.locator('#server-token').fill('hosted-browser-test');await page.locator('#server-token').dispatchEvent('change');
  await page.locator('#test-server').click();
  await page.waitForFunction(()=>document.querySelector('#server-status').textContent.startsWith('Připojeno'));
  await page.locator('#profile').selectOption('quick');
  await page.locator('#study-time').fill('100');await page.locator('#study-time').dispatchEvent('change');
  await page.locator('#study-lines').selectOption('2');
  await page.locator('#close-settings').click();
  await page.locator('#pgn-input').fill('[White "Hosted"]\n[Black "Server"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.locator('#import-pgn').click();await page.locator('#review-game').click();
  await page.waitForFunction(()=>document.querySelector('#review-state').textContent==='Uloženo',{}, {timeout:60000});
  assert.ok(requests>=4);assert.equal(workers,0);assert.equal(wasm,0);assert.deepEqual(errors,[]);
  console.log('PASS: hosted app defaults to remote engine, reviews through real API, starts no local Worker and downloads no WASM');
}finally{await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done));}
