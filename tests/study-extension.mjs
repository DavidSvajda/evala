import { chromium } from 'playwright';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const context=await chromium.launchPersistentContext(resolve('test-results/study-extension-profile'),{executablePath:process.env.EVALA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,viewport:{width:1440,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--enable-unsafe-extension-debugging']});
const page=context.pages()[0],errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:resolve('dist')});
  await page.goto(`chrome-extension://${id}/study.html?username=Schweits`);
  assert.equal(await page.locator('#username').inputValue(),'Schweits');
  await page.locator('#import-username').click();
  await page.waitForFunction(()=>Number(document.querySelector('#library-count').textContent)>=20,{}, {timeout:40000});
  assert.match(await page.locator('#game-title').textContent(),/Schweits/);
  assert.match(await page.locator('.game-item').first().textContent(),/Schweits/);
  await page.locator('#toggle-settings').click();await page.locator('#profile').selectOption('quick');await page.locator('#study-time').fill('100');await page.locator('#study-time').dispatchEvent('change');await page.locator('#study-lines').selectOption('2');await page.locator('#close-settings').click();
  await page.locator('#analyze-position').click();
  await page.waitForFunction(()=>document.querySelector('#inspect-status').textContent.startsWith('Hotovo'),{}, {timeout:30000});
  assert.equal(await page.locator('.engine-line').count(),2);
  assert.deepEqual(errors,[]);
  console.log('PASS: installed MV3 study app imported real Schweits games through official API and ran Full NNUE MultiPV under extension CSP.');
}finally{await context.close();}
