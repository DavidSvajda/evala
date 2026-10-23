import { Chess } from 'chess.js';
import { StudyEngine,searchSettings } from './uci.js';
import { RemoteEngine,serverAddress } from './remote.js';
import { parsePgnCollection,DEMO_PGN,lineToSan,annotatedPgn } from './game.js';
import { reviewGame,summarize } from './review.js';
import { loadLibrary,saveGame,removeGame,getPreferences,savePreferences } from './storage.js';
import { importUsername } from './import.js';
import { StudyBoard } from './board.js';
import { START_FEN } from '../core/position.js';
import { scoreText,whitePercent } from '../core/evaluation.js';
import { brand,icons } from '../ui/icons.js';
import { readSettings as readBarSettings,writeSettings as writeBarSettings } from '../core/settings.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stroke=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
$('#brand').innerHTML=brand;$('#review-arrow').innerHTML=icons.arrow;$('#close-settings').innerHTML=icons.close;
$('#flip-board').innerHTML=stroke('<path d="M5 7h12l-3-3M19 17H7l3 3M17 7l-3 3M7 17l3-3"/>');
$('#first-move').innerHTML=stroke('<path d="M7 5v14m10-13-7 6 7 6"/>');$('#previous-move').innerHTML=stroke('<path d="m15 5-7 7 7 7"/>');
$('#next-move').innerHTML=stroke('<path d="m9 5 7 7-7 7"/>');$('#last-move').innerHTML=stroke('<path d="M17 5v14M7 6l7 6-7 6"/>');
let library=[],selected=null,ply=0,flipped=false,branch=null,promotionMove=null;
const hostedServer=!!document.querySelector('meta[name="evala-backend"][content="server"]');
let options=getPreferences(hostedServer?{backend:'server',serverUrl:location.origin}:{}),job=null,importController=null,inspectController=null,inspectResult=null;
let reviewer=null,inspector=null,reviewerKey='',inspectorKey='',saveAt=0,renderQueued=false;
let serverVerified=false;
const barServerOption=document.createElement('label');barServerOption.className='check-row';barServerOption.hidden=!globalThis.chrome?.runtime?.id;
barServerOption.innerHTML='<span>Použít server také pro evaluation bar</span><input id="bar-server" type="checkbox">';
$('#server-fields').append(barServerOption);
if(globalThis.chrome?.runtime?.id){
  const note=document.createElement('p');note.className='hint';note.textContent='Pro bar se token uchová v paměti rozšíření do restartu prohlížeče. Potom spojení ověř znovu.';$('#server-fields').append(note);
  readBarSettings().then(saved=>$('#bar-server').checked=saved.backend==='server'&&saved.serverUrl===options.serverUrl);
}
async function configureBarServer(enabled){
  if(enabled&&!serverVerified)throw new Error('Nejdřív ověř spojení se serverem.');
  const response=await chrome.runtime.sendMessage(enabled?{target:'evala-server-config',origin:serverAddress(options.serverUrl),token:$('#server-token').value}:{target:'evala-server-config',clear:true});
  if(response?.error)throw new Error(response.error);
  const saved=await readBarSettings();await writeBarSettings({...saved,backend:enabled?'server':'local',serverUrl:enabled?serverAddress(options.serverUrl):'',serverVersion:Date.now()});
}
$('#bar-server').addEventListener('change',async event=>{try{await configureBarServer(event.target.checked);$('#server-status').textContent=event.target.checked?'Server je zapnutý i pro evaluation bar.':'Evaluation bar opět počítá lokálně.';}catch(e){event.target.checked=!event.target.checked;$('#server-status').textContent=e.message;}});
const board=new StudyBoard($('#study-board'),{onMove:makeBoardMove});
const profiles={quick:{time:300,depth:14,hash:32},balanced:{time:750,depth:18,hash:64},deep:{time:2000,depth:22,hash:128}};
const settingsFields={'engine-choice':'engine',profile:'profile','study-depth':'depth','study-time':'time','study-lines':'multipv','study-hash':'hash','study-arrows':'arrows',backend:'backend','server-url':'serverUrl'};
function error(message=''){$('#app-error').textContent=message;}
function queueRender(){if(!renderQueued){renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;renderPosition();});}}
function activeFen(){return branch?branch.fens[branch.index]:selected?.fens[ply]||START_FEN;}
function currentResult(){const fen=activeFen();return inspectResult?.fen===fen?inspectResult.result:branch?null:selected?.analysis?.positions?.[ply]||null;}
function settings(){return {...options,...searchSettings(options),engine:options.backend==='server'?'full':options.engine,serverUrl:options.serverUrl,backend:options.backend};}
function engineKey(){return JSON.stringify([options.backend,options.backend==='server'?options.serverUrl:options.engine,$('#server-token').value]);}
function engine(role){
  const key=engineKey();
  let value=role==='review'?reviewer:inspector,last=role==='review'?reviewerKey:inspectorKey;
  if(!value||key!==last){
    value?.dispose();
    value=options.backend==='server'?new RemoteEngine(options.serverUrl,$('#server-token').value):new StudyEngine(()=>new Worker(new URL(`engine/stockfish-19-${options.engine==='lite'?'lite-':''}single.js`,location.href)));
    if(role==='review'){reviewer=value;reviewerKey=key;}else{inspector=value;inspectorKey=key;}
  }
  return value;
}
function syncSettings(){
  for(const [id,key] of Object.entries(settingsFields)){
    const el=$('#'+id);if(el.type==='checkbox')el.checked=!!options[key];else el.value=options[key];
  }
  $('#server-fields').hidden=options.backend!=='server';
  $('#engine-choice').disabled=options.backend==='server';
  $('#engine-badge').textContent=`Stockfish 19 · ${options.backend==='server'?'server Full NNUE':options.engine==='lite'?'Lite':'Full NNUE'}`;
}
for(const [id,key] of Object.entries(settingsFields))$('#'+id).addEventListener('change',()=>{
  const el=$('#'+id);options[key]=el.type==='checkbox'?el.checked:['depth','time','multipv','hash'].includes(key)?Number(el.value):el.value;
  if(key==='serverUrl')serverVerified=false;
  if(key==='profile'&&profiles[options.profile])Object.assign(options,profiles[options.profile]);
  else if(['time','depth','hash'].includes(key))options.profile='custom';
  options={...options,...searchSettings(options)};
  if(job)job.controller.abort();inspectController?.abort();inspectResult=null;
  try{savePreferences(options);}catch{error('Nastavení se nepodařilo uložit. Pro tuto kartu zůstane aktivní.');}
  syncSettings();renderPosition();renderReview();
});
$('#server-token').value=sessionStorage.getItem('evala-server-token')||'';
$('#server-token').addEventListener('change',()=>{serverVerified=false;sessionStorage.setItem('evala-server-token',$('#server-token').value);});
$('#test-server').addEventListener('click',async()=>{
  try{
    const base=serverAddress($('#server-url').value);options.serverUrl=base;
    if(globalThis.chrome?.runtime?.id&&chrome.permissions){
      const u=new URL(base);const allowed=await chrome.permissions.request({origins:[u.protocol+'//'+u.hostname+'/*']});
      if(!allowed)throw new Error('Prohlížeč nepovolil přístup k tomuto serveru.');
    }
    $('#server-status').textContent='Ověřuji spojení…';
    const response=await fetch(base+'/api/health',{headers:$('#server-token').value?{Authorization:'Bearer '+$('#server-token').value}:{},signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`Server odmítl spojení (${response.status}). Zkontroluj token a povolený origin.`);
    const info=await response.json();if(!info.ok)throw new Error('Server nemá podporované rozhraní Evala.');
    serverVerified=true;
    $('#server-status').textContent=`Připojeno · ${info.engine} · ${info.slots} výpočetní slot(y)`;savePreferences(options);
    if($('#bar-server').checked&&globalThis.chrome?.runtime?.id)await configureBarServer(true);
  }catch(e){$('#server-status').textContent=e.message;}
});
$('#toggle-settings').addEventListener('click',()=>{$('#study-settings').hidden=!$('#study-settings').hidden;if(!$('#study-settings').hidden)$('#study-settings').scrollIntoView({block:'nearest',behavior:'smooth'});});
$('#close-settings').addEventListener('click',()=>$('#study-settings').hidden=true);
$('#toggle-library').addEventListener('click',()=>{$('.workspace').classList.toggle('library-open');if($('.workspace').classList.contains('library-open'))$('.library').scrollIntoView({block:'start',behavior:'smooth'});});

async function store(game){try{await saveGame(game);}catch(e){error(e.message);}}
function renderLibrary(){
  $('#library-count').textContent=library.length;
  const fragment=document.createDocumentFragment();
  for(const game of library){
    const button=document.createElement('button');button.className='game-item';button.setAttribute('aria-current',String(selected?.id===game.id));
    button.innerHTML=`<strong>${esc(game.headers.White||'Bílý')} <span class="versus">vs ${esc(game.headers.Black||'Černý')}</span></strong><span>${esc(game.headers.Result||'*')} · ${Math.ceil(game.moves.length/2)} tahů${game.headers.Date?' · '+esc(game.headers.Date):''}</span>${game.analysis?.complete?'<span class="game-analysed">Rozbor uložen</span>':game.analysis?'<span class="game-analysed">Částečný rozbor</span>':''}`;
    button.addEventListener('click',()=>selectGame(game));fragment.append(button);
  }
  $('#game-list').replaceChildren(fragment);
}
function selectGame(game){
  inspectController?.abort();inspectResult=null;selected=game;ply=0;branch=null;promotionMove=null;$('#promotion').hidden=true;
  sessionStorage.setItem('evala-current-game',game.id);error();renderLibrary();renderAll();
}
async function addPgn(text){
  const {games,errors}=parsePgnCollection(text);let added=0;
  for(const game of [...games].reverse()){
    const existing=library.find(g=>g.id===game.id&&g.initialFen===game.initialFen&&g.moves.map(m=>m.uci).join(' ')===game.moves.map(m=>m.uci).join(' '));
    if(existing)continue;
    if(library.length>=200)throw new Error('Knihovna má limit 200 partií. Exportuj starší partie a uvolni místo.');
    library.unshift(game);await store(game);added++;
  }
  $('#import-status').textContent=`${added} nových partií${errors.length?' · '+errors.join(' '):games.length>added?' · duplicity přeskočeny':''}`;
  const first=library.find(g=>g.id===games[0].id);if(first)selectGame(first);else renderLibrary();
  $('#import-panel').open=false;return games;
}
$('#import-pgn').addEventListener('click',async()=>{try{await addPgn($('#pgn-input').value);$('#pgn-input').value='';}catch(e){$('#import-status').textContent=e.message;}});
$('#pgn-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>2_000_000)throw new Error('Soubor je větší než 2 MB.');await addPgn(await file.text());}catch(e){$('#import-status').textContent=e.message;}event.target.value='';
});
$('#demo-game').addEventListener('click',()=>addPgn(DEMO_PGN).catch(e=>error(e.message)));
const suggestedUser=new URLSearchParams(location.search).get('username');
$('#username').value=options.lastUsername||(/^[A-Za-z0-9_-]{2,40}$/.test(suggestedUser||'')?suggestedUser:'');$('#platform').value=options.lastPlatform||'chesscom';
$('#username-form').addEventListener('submit',async event=>{
  event.preventDefault();if(importController){importController.abort();return;}
  importController=new AbortController();$('#import-username').textContent='Zrušit import';$('#import-status').textContent='Načítám veřejné dokončené partie…';
  try{
    const username=$('#username').value,platform=$('#platform').value;
    const pgn=await importUsername(username,platform,{signal:importController.signal,onProgress:text=>$('#import-status').textContent=text});
    await addPgn(pgn);options.lastUsername=username;options.lastPlatform=platform;savePreferences(options);
  }catch(e){$('#import-status').textContent=e.name==='AbortError'?'Import byl zrušen.':e.message;}
  finally{importController=null;$('#import-username').textContent='Načíst posledních 20';}
});

function renderReview(){
  const running=job?.game.id===selected?.id;
  $('#review-game').disabled=!selected||!!job&&!running;
  $('#review-game').classList.toggle('running',!!running);
  $('#review-game').innerHTML=`${running?'Pozastavit rozbor':selected?.analysis?.complete?'Znovu rozebrat':selected?.analysis?'Pokračovat v rozboru':'Rozebrat partii'}<span>${running?icons.pause:icons.arrow}</span>`;
  $('#review-state').textContent=running?'Probíhá':selected?.analysis?.complete?'Uloženo':selected?.analysis?'Částečný rozbor':'Připraveno';
  if(!running)$('#review-progress').hidden=true;
  if(selected){
    const positions=selected.fens.length,seconds=Math.ceil(positions*options.time/1000);
    $('#review-estimate').textContent=`První průchod: ${positions} pozic × ${options.time/1000} s ≈ ${seconds<60?seconds+' s':Math.ceil(seconds/60)+' min'} + načtení enginu. Kritické tahy se ověří znovu.${selected.analysis?' Uložený rozbor: '+(selected.analysis.engine==='lite'?'Lite':'Full')+'.':''}`;
  }
}
$('#review-game').addEventListener('click',async()=>{
  if(job){job.controller.abort();return;}
  if(!selected)return;
  if(options.backend==='server')try{serverAddress(options.serverUrl);}catch(e){error(e.message);$('#study-settings').hidden=false;return;}
  const game=selected;
  if(game.analysis?.complete)game.analysis=null;
  const controller=new AbortController();job={controller,game};error();renderReview();
  const visibility=()=>{if(document.hidden&&options.backend==='local')controller.abort();};
  document.addEventListener('visibilitychange',visibility);
  try{
    $('#review-progress').hidden=false;$('#progress-text').textContent=options.backend==='server'?'Připojuji server…':options.engine==='full'?'Načítám plný engine (~100 MB)…':'Načítám Lite engine…';
    await reviewGame(game,engine('review'),settings(),{signal:controller.signal,onUpdate:({phase,index,total,elapsed,processed})=>{
      if(selected?.id===game.id){
        $('#review-progress').hidden=false;$('#progress').value=phase==='positions'?index/total*85:phase==='refine'?85+index/Math.max(1,total)*10:phase==='done'?100:97;
        const remaining=phase==='positions'&&processed>1?` · zbývá přibližně ${Math.ceil((game.fens.length-index)*elapsed/processed/1000)} s`:'';
        $('#progress-text').textContent=phase==='positions'?`Pozice ${index}/${total}${remaining}`:phase==='refine'?`Ověřuji kritické momenty ${index}/${total}`:phase==='brilliant'?'Ověřuji oběti a brilantní kandidáty…':'Rozbor dokončen';
        renderPosition();renderMoves();renderSummary();renderGraph();
      }
      if(performance.now()-saveAt>1500){saveAt=performance.now();store(game);}
    }});
    await store(game);renderLibrary();
  }catch(e){await store(game);if(e.name==='AbortError'){if(selected?.id===game.id)$('#review-estimate').textContent='Rozbor pozastaven. Hotové pozice zůstaly uložené; pokračuj stejným profilem.';}else error(e.message);}
  finally{job=null;document.removeEventListener('visibilitychange',visibility);renderReview();renderLibrary();}
});

function renderPosition(){
  const fen=activeFen(),result=currentResult(),last=branch?branch.moves[branch.index-1]:selected?.moves[ply-1];
  board.set(fen,{flipped,lastMove:last,arrow:options.arrows?result?.lines?.[0]?.pv?.[0]:null});
  $('.study-eval').classList.toggle('flipped',flipped);$('.eval-white').style.height=whitePercent(result)+'%';$('.eval-score').textContent=scoreText(result);$('.eval-depth').textContent=result?.depth?'d'+result.depth:'';
  $('.study-eval').setAttribute('aria-valuenow',String(result?.kind==='mate'?Math.sign(result.value)*10:Math.max(-10,Math.min(10,(result?.value||0)/100))));$('.study-eval').setAttribute('aria-valuetext',scoreText(result)+' z pohledu bílého');
  $('#game-title').textContent=selected?`${selected.headers.White||'Bílý'} — ${selected.headers.Black||'Černý'}`:'Prostor pro tvoje další zlepšení.';
  $('#game-subtitle').textContent=selected?`${selected.headers.Result||'*'} · ${selected.headers.Event||'Importovaná partie'}${selected.headers.Date?' · '+selected.headers.Date:''}`:'Vyber partii v knihovně nebo importuj PGN.';
  $('#position-label').textContent=branch?`Vlastní varianta · ${branch.index}/${branch.moves.length}`:ply?`${Math.ceil(ply/2)}${ply%2?'.':'…'} ${selected.moves[ply-1].san}`:'Výchozí pozice';
  $('#return-game').hidden=!branch;$('#first-move').disabled=branch?branch.index===0:ply===0;$('#previous-move').disabled=$('#first-move').disabled;
  $('#last-move').disabled=branch?branch.index===branch.moves.length:!selected||ply===selected.moves.length;$('#next-move').disabled=$('#last-move').disabled;
  $('#analyze-position').disabled=!selected;$('#export-pgn').disabled=!selected;$('#delete-game').disabled=!selected||job?.game.id===selected?.id;
  const mark=!branch&&ply?selected?.analysis?.moves?.[ply-1]:null;
  $('#move-classification').innerHTML=mark?`<span class="classification ${esc(mark.kind)}"><span class="class-symbol">${esc(mark.symbol||'✓')}</span>${esc(mark.label)}</span>`:'';
  $('#move-explanation').textContent=branch?'Zkoušíš vlastní pokračování. Tlačítkem Prozkoumat pozici spustíš nový výpočet.':mark?`${mark.note}${mark.proof?.continuation?' Po přijetí oběti: '+mark.proof.continuation:''}`:ply?'Tento tah zatím nemá hodnocení. Spusť rozbor partie.':'Vyber tah nebo spusť rozbor celé partie.';
  renderLines(result,fen);
}
function renderLines(result,fen){
  const lines=result?.lines||[];$('#lines-state').textContent=result?.depth?`d${result.depth} · ${(result.time/1000).toFixed(1)} s`:'—';
  const fragment=document.createDocumentFragment();
  if(!lines.length){const p=document.createElement('p');p.className='panel-empty';p.textContent=result?.terminal?'Konec pozice: '+(result.kind==='mate'?'mat.':'remíza.'):'Pro tuto pozici zatím nejsou varianty. Spusť rozbor nebo prozkoumej pozici.';fragment.append(p);}
  for(const line of lines){
    const button=document.createElement('button');button.className='engine-line';button.title='Kliknutím přehraješ tuto variantu';
    button.innerHTML=`<span class="line-head"><strong>${esc(scoreText(line))}</strong><span>Hloubka ${esc(line.depth)}</span><em>Přehrát variantu</em></span><span class="line-san">${esc(lineToSan(fen,line.pv,14))}</span>`;
    button.addEventListener('click',()=>startBranch(line.pv));fragment.append(button);
  }
  $('#engine-lines').replaceChildren(fragment);
}
function renderMoves(){
  const filter=$('#move-filter').value,fragment=document.createDocumentFragment();
  if(!selected){$('#move-list').innerHTML='<p class="panel-empty">Tady se objeví tahy importované partie.</p>';return;}
  for(let i=0;i<selected.moves.length;i+=2){
    const pair=document.createElement('div');pair.className='move-pair';const number=document.createElement('span');number.className='move-number';number.textContent=(Math.floor(i/2)+1)+'.';pair.append(number);
    let visible=filter==='all';
    for(const index of [i,i+1]){
      const move=selected.moves[index];if(!move)continue;const mark=selected.analysis?.moves?.[index];
      const critical=mark&&['inaccuracy','mistake','blunder','brilliant','sacrifice'].includes(mark.kind);visible ||= !!critical;
      const button=document.createElement('button');button.className='move-button '+(mark?.kind||'');button.dataset.ply=index+1;button.setAttribute('aria-current',String(!branch&&ply===index+1));
      button.title=mark?`${mark.label} · skóre tahu ${mark.accuracy.toFixed(1)} %`:move.san;
      button.innerHTML=`<span>${esc(move.san)}</span><span class="move-symbol">${esc(mark?.symbol||'')}</span>`;button.addEventListener('click',()=>navigate(index+1));pair.append(button);
    }
    if(visible)fragment.append(pair);
  }
  $('#move-list').replaceChildren(fragment);
}
function renderSummary(){
  if(!selected?.analysis?.moves?.some(Boolean)){$('#summary').hidden=true;return;}
  const summary=summarize(selected);$('#summary').hidden=false;
  $('#summary').innerHTML=['w','b'].map(color=>{const s=summary[color];return `<div><span class="player-name">${esc(selected.headers[color==='w'?'White':'Black']||(color==='w'?'Bílý':'Černý'))}</span><strong>${s.accuracy===null?'—':s.accuracy.toFixed(1)+' %'}</strong><span class="player-detail">Průměr skóre tahů<br>${s.blunders} hrubých chyb · ${s.mistakes} chyb${s.brilliants?' · '+s.brilliants+' brilantních*':''}</span></div>`;}).join('');
}
function renderGraph(){
  const positions=selected?.analysis?.positions;if(!positions?.some(Boolean)){$('#eval-graph').innerHTML='<p class="empty-graph">Po rozboru tu uvidíš zvraty a rozhodující momenty.</p>';return;}
  const width=600,height=126,max=Math.max(1,selected.fens.length-1),point=(score,i)=>[i/max*width,score.kind==='mate'?score.value>0?8:118:63-Math.tanh(score.value/500)*55];
  let path='';for(let i=0;i<positions.length;i++){const score=positions[i];if(!score)continue;const [x,y]=point(score,i);path+=(path?'L':'M')+x.toFixed(1)+','+y.toFixed(1);}
  $('#eval-graph').innerHTML=`<svg viewBox="0 0 600 126" preserveAspectRatio="none" role="img" aria-label="Graf hodnocení. Kliknutím přejdeš na tah."><path d="M0 63H600" stroke="#58614e" stroke-width="1"/><path d="M0 20H600M0 106H600" stroke="#343d2d" stroke-width="1"/><path d="${path}" fill="none" stroke="#d5b77a" stroke-width="2" vector-effect="non-scaling-stroke"/><path class="graph-cursor" d="M${ply/max*600} 0V126"/><text x="7" y="14" fill="#b2b6ad" font-size="9">Bílý +</text><text x="7" y="120" fill="#b2b6ad" font-size="9">Černý −</text></svg>`;
  $('#eval-graph svg').addEventListener('click',event=>{const r=event.currentTarget.getBoundingClientRect();navigate(Math.max(0,Math.min(max,Math.round((event.clientX-r.left)/r.width*max))));});
}
function renderAll(){renderPosition();renderMoves();renderSummary();renderGraph();renderReview();}
function navigate(index){inspectController?.abort();inspectResult=null;branch=null;promotionMove=null;$('#promotion').hidden=true;ply=Math.max(0,Math.min(selected?.moves.length||0,index));renderPosition();renderMoves();renderGraph();}
function step(amount){if(branch){inspectController?.abort();inspectResult=null;branch.index=Math.max(0,Math.min(branch.moves.length,branch.index+amount));renderPosition();}else navigate(ply+amount);}
$('#previous-move').addEventListener('click',()=>step(-1));$('#next-move').addEventListener('click',()=>step(1));
$('#first-move').addEventListener('click',()=>branch?step(-branch.moves.length):navigate(0));$('#last-move').addEventListener('click',()=>branch?step(branch.moves.length):navigate(selected?.moves.length||0));
$('#return-game').addEventListener('click',()=>navigate(ply));$('#flip-board').addEventListener('click',()=>{flipped=!flipped;renderPosition();});
$('#move-filter').addEventListener('change',renderMoves);
document.addEventListener('keydown',event=>{if(/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))return;if(event.key==='ArrowRight'){event.preventDefault();step(1);}if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}if(event.key==='Escape'&&branch)navigate(ply);});
function startBranch(pv){
  inspectController?.abort();inspectResult=null;const fen=activeFen(),chess=new Chess(fen),moves=[],fens=[fen];
  for(const uci of pv){try{const m=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});moves.push({from:m.from,to:m.to,san:m.san,uci});fens.push(chess.fen());}catch{break;}}
  if(!moves.length)return;branch={fens,moves,index:1};renderPosition();renderMoves();
}
function makeBoardMove(move){
  if(!selected)return;
  if(move.promotions.length){promotionMove=move;$('#promotion').hidden=false;$('#promotion button').focus();return;}
  commitBoardMove(move);
}
function commitBoardMove(move,promotion){
  inspectController?.abort();inspectResult=null;const chess=new Chess(activeFen());let m;
  try{m=chess.move({from:move.from,to:move.to,promotion});}catch{return;}
  if(!branch)branch={fens:[activeFen()],moves:[],index:0};
  branch.fens=branch.fens.slice(0,branch.index+1);branch.moves=branch.moves.slice(0,branch.index);
  branch.moves.push({from:m.from,to:m.to,san:m.san,uci:m.from+m.to+(m.promotion||'')});branch.fens.push(chess.fen());branch.index++;
  $('#promotion').hidden=true;promotionMove=null;renderPosition();renderMoves();inspectPosition();
}
$('#promotion').addEventListener('click',event=>{const type=event.target.dataset.promotion;if(type&&promotionMove)commitBoardMove(promotionMove,type);});
async function inspectPosition(){
  if(!selected)return;inspectController?.abort();const controller=new AbortController();inspectController=controller;const fen=activeFen();
  $('#inspect-status').textContent='Počítám pokračování…';error();
  try{
    const history=branch?undefined:{initialFen:selected.initialFen,moves:selected.moves.slice(0,ply).map(m=>m.uci)};
    const result=await engine('inspect').search({fen,history,settings:{...settings(),time:Math.max(1500,options.time)}},{signal:controller.signal,onInfo:result=>{if(!controller.signal.aborted&&fen===activeFen()){inspectResult={fen,result};queueRender();}}});
    if(!controller.signal.aborted&&fen===activeFen()){inspectResult={fen,result};renderPosition();$('#inspect-status').textContent=`Hotovo · hloubka ${result.depth} · ${new Intl.NumberFormat('cs-CZ',{notation:'compact'}).format(result.nps||0)} uzlů/s`;}
  }catch(e){if(e.name!=='AbortError'){error(e.message);$('#inspect-status').textContent='Výpočet se nepodařilo dokončit.';}}
}
$('#analyze-position').addEventListener('click',inspectPosition);
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#export-pgn').addEventListener('click',()=>{if(selected)download(annotatedPgn(selected),`evala-${selected.id}.pgn`,'application/x-chess-pgn');});
$('#delete-game').addEventListener('click',async()=>{if(!selected||job?.game.id===selected.id)return;const id=selected.id;try{await removeGame(id);library=library.filter(g=>g.id!==id);selected=null;branch=null;ply=0;if(library[0])selectGame(library[0]);else{renderLibrary();renderAll();}}catch(e){error(e.message);}});

syncSettings();
if(hostedServer&&options.backend==='server'&&!$('#server-token').value){$('#study-settings').hidden=false;$('#server-status').textContent='Pro serverový rozbor zadej svůj API token a ověř spojení.';}
try{library=await loadLibrary();selected=library.find(g=>g.id===sessionStorage.getItem('evala-current-game'))||library[0]||null;}catch(e){error(e.message);}
renderLibrary();renderAll();
window.addEventListener('pagehide',()=>{job?.controller.abort();inspectController?.abort();importController?.abort();reviewer?.dispose();inspector?.dispose();});
