import { Chess } from 'chess.js';

export const PHASES={opening:'Zahájení',middlegame:'Střední hra',endgame:'Koncovka'};
export const QUALITY={brilliant:'Brilantní',great:'Skvělý',best:'Nejlepší',excellent:'Výborný',good:'Dobrý',inaccuracy:'Nepřesnost',mistake:'Chyba',blunder:'Hrubá chyba',miss:'Promarněná šance',sacrifice:'Oběť'};
const REASONS={mate:'Minutý mat',king:'Obrana proti matu',material:'Ztráta materiálu',opportunity:'Nevyužitá příležitost',other:'Další chyby'};
const PIECES={p:'Pěšci',n:'Jezdci',b:'Střelci',r:'Věže',q:'Dáma',k:'Král'};
const points={p:0,n:3,b:3,r:5,q:9,k:0};
const avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export function errorInterval(errors,total){
  if(!total)return null;const z=1.96,p=errors/total,d=1+z*z/total;
  const center=(p+z*z/(2*total))/d,margin=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;
  return [Math.max(0,(center-margin)*100),Math.min(100,(center+margin)*100)];
}
export function errorReason(move,before,after){
  const sign=move.color==='w'?1:-1;
  if(before?.kind==='mate'&&before.value*sign>0)return 'mate';
  if(after?.kind==='mate'&&after.value*sign<0)return 'king';
  const material=chess=>chess.board().flat().filter(Boolean).reduce((n,p)=>n+(p.color===move.color?1:-1)*({p:1,n:3,b:3,r:5,q:9,k:0}[p.type]),0);
  const chess=new Chess(move.fenAfter),start=material(chess);let played=0;
  for(const uci of (after?.lines?.[0]?.pv||[]).slice(0,2)){try{chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});played++;}catch{break;}}
  if(played&&start-material(chess)>=2)return 'material';
  return 'other';
}
export function phaseOf(fen){
  const parts=fen.split(' '),material=[...parts[0]].reduce((n,p)=>n+(points[p.toLowerCase()]||0),0);
  return material<=26?'endgame':Number(parts[5])<=10?'opening':'middlegame';
}
export function timeClass(control=''){
  const match=control.match(/^(\d+)(?:\+(\d+))?$/);if(!match)return 'unknown';
  const seconds=Number(match[1])+40*Number(match[2]||0);
  return seconds<180?'bullet':seconds<600?'blitz':seconds<1500?'rapid':'classical';
}
export function openingOf(game){
  const h=game.headers;
  if(h.Opening)return h.Opening+(h.Variation?' · '+h.Variation:'');
  if(h.ECOUrl){try{const slug=new URL(h.ECOUrl).pathname.split('/').filter(Boolean).at(-1);if(slug)return slug.replace(/-/g,' ');}catch{}}
  if(h.ECO)return 'ECO '+h.ECO;
  return 'Tahová řada: '+game.moves.slice(0,4).map((m,i)=>(i%2===0?Math.floor(i/2)+1+'.':'')+m.san).join(' ');
}
function advantage(score,color){if(!score)return null;const sign=color==='w'?1:-1;return score.kind==='mate'?Math.sign(score.value)*sign*10000:score.value*sign;}
function outcome(game,color){const result=game.headers.Result;return result==='1/2-1/2'?'draw':result===(color==='w'?'1-0':'0-1')?'win':['1-0','0-1'].includes(result)?'loss':null;}
function bucket(){return {games:0,win:0,draw:0,loss:0,moves:0,errors:0,accuracies:[],losses:[]};}
function addGame(b,result){b.games++;b[result]++;}
function addMove(b,mark){b.moves++;b.errors+=mark.loss>=10?1:0;b.accuracies.push(mark.accuracy);b.losses.push(mark.loss);}
function finish(b){return {...b,accuracy:avg(b.accuracies),averageLoss:avg(b.losses),errorRate:b.moves?100*b.errors/b.moves:null,interval:errorInterval(b.errors,b.moves),score:b.games?100*(b.win+b.draw/2)/b.games:null};}

export function analyzeLibrary(games,{username='',color='all',time='all',result='all'}={}){
  const name=username.trim().toLowerCase(),overall=bucket(),colors={w:bucket(),b:bucket()},phases=Object.fromEntries(Object.keys(PHASES).map(key=>[key,bucket()]));
  const openings=new Map(),quality={},moments=[],records=[],terminations=new Map(),reasons={};
  const pieces=Object.fromEntries(Object.keys(PIECES).map(key=>[key,bucket()]));
  const intervals=Array.from({length:5},(_,i)=>({...bucket(),name:i===4?'41+':`${i*10+1}–${i*10+10}`,index:i}));
  const windows=new Map();
  let analyzedGames=0,matched=0,converted=0,winning=0,comebacks=0,disadvantaged=0,clockMoves=0,clockErrors=0;
  for(const game of games){
    const ownColor=game.headers.White?.toLowerCase()===name?'w':game.headers.Black?.toLowerCase()===name?'b':null;
    if(!ownColor)continue;matched++;
    const outcomeValue=outcome(game,ownColor);
    if(!outcomeValue||(color!=='all'&&ownColor!==color)||(time!=='all'&&timeClass(game.headers.TimeControl)!==time)||(result!=='all'&&result!==outcomeValue))continue;
    const entry={game,color:ownColor,result:outcomeValue,opening:openingOf(game)};records.push(entry);
    addGame(overall,outcomeValue);addGame(colors[ownColor],outcomeValue);
    const openingKey=ownColor+'|'+entry.opening;
    if(!openings.has(openingKey))openings.set(openingKey,{...bucket(),name:entry.opening,color:ownColor,example:game.id});
    const opening=openings.get(openingKey);addGame(opening,outcomeValue);
    let everWinning=false,everLosing=false,hasAnalysis=false;
    const base=Number(game.headers.TimeControl?.match(/^(\d+)/)?.[1]||0),pressure=Math.min(60,Math.max(10,base*.1));
    for(let i=0;i<game.moves.length;i++){
      const move=game.moves[i];if(move.color!==ownColor)continue;
      const mark=game.analysis?.moves?.[i],score=advantage(game.analysis?.positions?.[i],ownColor);
      if(score!==null){everWinning ||= score>=200;everLosing ||= score<=-200;}
      if(!mark||!Number.isFinite(mark.accuracy)||!Number.isFinite(mark.loss))continue;
      hasAnalysis=true;const phase=phaseOf(move.fenBefore),number=Number(move.fenBefore.split(' ')[5]),interval=Math.min(4,Math.floor((number-1)/10));
      addMove(overall,mark);addMove(colors[ownColor],mark);addMove(phases[phase],mark);addMove(opening,mark);addMove(pieces[move.piece],mark);addMove(intervals[interval],mark);
      quality[mark.kind]=(quality[mark.kind]||0)+1;
      if(move.clockAfter!==null&&Number.isFinite(move.clockAfter)&&base){if(move.clockAfter<=pressure){clockMoves++;clockErrors+=mark.loss>=10?1:0;}}
      if(mark.loss>=10){
        const reason=mark.kind==='miss'&&game.analysis?.positions?.[i]?.kind!=='mate'?'opportunity':errorReason(move,game.analysis?.positions?.[i],game.analysis?.positions?.[i+1]);
        reasons[reason]=(reasons[reason]||0)+1;
        const moment={gameId:game.id,ply:i+1,move:move.san,number,color:ownColor,phase,reason,mark,opponent:game.headers[ownColor==='w'?'Black':'White'],date:game.headers.Date};moments.push(moment);
        const key=game.id+'|'+interval;
        if(!windows.has(key))windows.set(key,{...moment,range:intervals[interval].name,errors:0,loss:0});
        const window=windows.get(key);window.errors++;window.loss+=mark.loss;
      }
    }
    if(hasAnalysis)analyzedGames++;
    if(everWinning){winning++;if(outcomeValue==='win')converted++;}
    if(everLosing){disadvantaged++;if(outcomeValue==='win')comebacks++;}
    const end=new Chess(game.fens.at(-1));
    const termination=end.isCheckmate()?'Mat':end.isStalemate()?'Pat':/time|čas/i.test(game.headers.Termination||'')?'Čas':/resign|vzdal/i.test(game.headers.Termination||'')?'Vzdání':'Jiné / neuvedeno';
    if(!terminations.has(termination))terminations.set(termination,{name:termination,...bucket()});addGame(terminations.get(termination),outcomeValue);
  }
  const phaseList=Object.entries(phases).map(([key,value])=>({key,name:PHASES[key],...finish(value)}));
  const weakest=phaseList.filter(p=>p.moves>=20).sort((a,b)=>b.errorRate-a.errorRate||b.averageLoss-a.averageLoss)[0];
  const insights=[];
  if(weakest&&weakest.errors)insights.push({title:'Nejvyšší chybovost: '+weakest.name.toLowerCase(),text:`${weakest.errors} chyb z ${weakest.moves} vyhodnocených tahů (${Math.round(weakest.errorRate)} %). Projdi nejhorší pozici, najdi soupeřovu hrozbu a porovnej dva vlastní tahy.`,moment:moments.filter(m=>m.phase===weakest.key).sort((a,b)=>b.mark.loss-a.mark.loss)[0]});
  if(reasons.material>=2)insights.push({title:'Materiál po soupeřově odpovědi',text:`V ${reasons.material} chybách engine ukazuje materiální ztrátu nejméně 2 bodů v prvních dvou půltazích varianty. Před tahem zkontroluj soupeřova braní a možnost dobrat zpět.`,moment:moments.find(m=>m.reason==='material')});
  if(reasons.mate>=2)insights.push({title:'Dokončení matového útoku',text:`${reasons.mate} tahů minulo nalezený mat. V tréninkové pozici projdi všechny šachy a ověř každou obranu soupeře.`,moment:moments.find(m=>m.reason==='mate')});
  if(winning)insights.push({title:'Proměňování výhod',text:`${converted} výher z ${winning} partií, ve kterých jsi měl alespoň +2,0. Vyhodnocené pozice z ${analyzedGames} partií; částečný rozbor může výhodu přehlédnout.`});
  const weakOpening=[...openings.values()].filter(o=>o.games>=3).sort((a,b)=>finish(a).score-finish(b).score)[0];
  if(weakOpening&&finish(weakOpening).score<50)insights.push({title:'Zahájení k procvičení',text:`${weakOpening.name}: ${weakOpening.win} výher, ${weakOpening.draw} remíz, ${weakOpening.loss} proher (${weakOpening.color==='w'?'bílými':'černými'}).`});
  if(clockMoves>=5)insights.push({title:'Hra v časové tísni',text:`${clockErrors} chyb z ${clockMoves} vyhodnocených tahů s nízkým časem po tahu (10 % základního času, nejméně 10 a nejvýše 60 sekund).`});
  moments.sort((a,b)=>b.mark.loss-a.mark.loss);
  return {username,matched,records,overall:finish(overall),colors:Object.fromEntries(Object.entries(colors).map(([key,b])=>[key,finish(b)])),phases:phaseList,openings:[...openings.values()].map(finish).sort((a,b)=>b.games-a.games),quality,moments,insights,analyzedGames,winning,converted,comebacks,disadvantaged,terminations:[...terminations.values()],reasons,intervals:intervals.map(finish),pieces:Object.entries(pieces).map(([key,b])=>({key,name:PIECES[key],...finish(b)})),windows:[...windows.values()].sort((a,b)=>b.errors-a.errors||b.loss-a.loss).slice(0,8)};
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=value=>value===null?'—':value.toFixed(1)+' %';
const resultBar=b=>`<div class="result-bar" aria-label="${b.win} výher, ${b.draw} remíz, ${b.loss} proher">${['win','draw','loss'].map(k=>`<span class="${k}" style="width:${b.games?b[k]/b.games*100:0}%"></span>`).join('')}</div>`;
export function renderAnalytics(root,report,onPosition){
  const r=report,b=r.overall;
  if(!r.username.trim()){root.innerHTML='<div class="analytics-empty"><h2>Začni svou přezdívkou</h2><p>Načti poslední partie a vyber je pro společný rozbor. Výsledky i tréninkové pozice se uloží do tohoto prohlížeče.</p></div>';return;}
  if(!b.games){root.innerHTML=`<div class="analytics-empty"><h2>${r.matched?'Žádné odpovídající partie':'Připraveno pro tvůj rozbor'}</h2><p>${r.matched?'Změň filtr barvy, tempa nebo výsledku.':'Nahoře načti partie podle přezdívky. Výsledky uvidíš ihned; chyby a doporučení přibudou po rozboru.'}</p></div>`;return;}
  root.innerHTML=`<div class="analytics-overview"><div><h2>${esc(r.username)}</h2><p>${b.games} dokončených partií · ${r.analyzedGames} s vyhodnocenými tahy · ${b.moves} tahů vyhodnoceno</p></div><button class="quiet-button" id="export-insights">Exportovat JSON</button></div>
  <div class="analytics-results">${resultBar(b)}<div class="result-labels"><span><i class="win"></i>${b.win} výher</span><span><i class="draw"></i>${b.draw} remíz</span><span><i class="loss"></i>${b.loss} proher</span><span>Skóre ${percent(b.score)} · průměr tahů ${percent(b.accuracy)}</span></div></div>
  <div class="analytics-columns"><section><h3>Co procvičit</h3>${r.insights.length?r.insights.map((item,i)=>`<article class="insight"><h4>${esc(item.title)}</h4><p>${esc(item.text)}</p>${item.moment?`<button class="text-button" data-insight="${i}">Otevřít konkrétní pozici →</button>`:''}</article>`).join(''):'<p class="muted">Rozebereš-li partie, objeví se tu chyby podle fáze a pozice k procvičení.</p>'}
  <h3>Fáze hry</h3><table><thead><tr><th>Fáze</th><th>Tahy</th><th>Skóre tahů</th><th>Chyby</th></tr></thead><tbody>${r.phases.map(p=>`<tr><td>${p.name}</td><td>${p.moves}</td><td>${percent(p.accuracy)}</td><td>${p.errors}${p.moves?' / '+Math.round(p.errorRate)+' %':''}</td></tr>`).join('')}</tbody></table>
  <p class="data-note">Koncovka: nejvýše 26 bodů materiálu bez pěšců a králů. Jinak zahájení do 10. tahu, poté střední hra. Chyba = ztráta alespoň 10 procentních bodů podle převodu hodnocení.</p>
  <h3>Kdy přicházejí chyby</h3><table><thead><tr><th>Tahy partie</th><th>Tvé tahy</th><th>Chyby / 100</th><th>Rozmezí 95 %</th></tr></thead><tbody>${r.intervals.map(item=>`<tr><td>${item.name}</td><td>${item.moves}</td><td>${item.errorRate===null?'—':item.errorRate.toFixed(1)}</td><td>${item.interval?item.interval.map(v=>Math.round(v)).join('–'):'—'}</td></tr>`).join('')}</tbody></table><p class="data-note">Rozmezí vyjadřuje nejistotu odhadu (Wilson). Malé vzorky neber jako stabilní slabinu.</p>
  <h3>Bílými a černými</h3><table><thead><tr><th>Barva</th><th>Partie</th><th>V / R / P</th><th>Skóre</th></tr></thead><tbody>${['w','b'].map(c=>`<tr><td>${c==='w'?'Bílými':'Černými'}</td><td>${r.colors[c].games}</td><td>${r.colors[c].win} / ${r.colors[c].draw} / ${r.colors[c].loss}</td><td>${percent(r.colors[c].score)}</td></tr>`).join('')}</tbody></table>
  <h3>Jak partie končí</h3><table><thead><tr><th>Zakončení</th><th>Výhry</th><th>Remízy</th><th>Prohry</th></tr></thead><tbody>${r.terminations.map(t=>`<tr><td>${esc(t.name)}</td><td>${t.win}</td><td>${t.draw}</td><td>${t.loss}</td></tr>`).join('')}</tbody></table></section>
  <section><h3>Zahájení a výsledky</h3><div class="table-scroll"><table><thead><tr><th>Zahájení / tahová řada</th><th>Barva</th><th>Partie</th><th>V / R / P</th><th>Skóre</th></tr></thead><tbody>${r.openings.map(o=>`<tr><td>${esc(o.name)}${o.games<3?'<small>Malý vzorek</small>':''}</td><td>${o.color==='w'?'B':'Č'}</td><td>${o.games}</td><td>${o.win} / ${o.draw} / ${o.loss}</td><td>${percent(o.score)}</td></tr>`).join('')}</tbody></table></div>
  <h3>Co je vidět ve variantách</h3><div class="pattern-list">${Object.entries(REASONS).map(([key,label])=>`<button class="pattern-row" data-pattern="${key}" ${!r.reasons[key]?'disabled':''}><span>${label}</span><strong>${r.reasons[key]||0}</strong><span>→</span></button>`).join('')}</div><p class="data-note">Jde o rozpoznané následky v krátké variantě enginu. Neodhalují samy o sobě příčinu tvého rozhodnutí.</p>
  <h3>Úseky s více chybami</h3><div class="training-list">${r.windows.map((w,i)=>`<button data-window="${i}"><span class="training-number">${w.range}</span><span>${w.errors} ${w.errors===1?'chyba':'chyb'}<small>vs ${esc(w.opponent)} · ${esc(w.date||'')}</small></span><span>→</span></button>`).join('')||'<p class="muted">Úseky přibudou po vyhodnocení tahů.</p>'}</div>
  <details class="analytics-detail"><summary>Kvalita tahů a práce s figurami</summary><div class="quality-distribution">${Object.entries(QUALITY).map(([key,label])=>`<div><span class="quality-dot ${key}"></span><span>${label}</span><strong>${r.quality[key]||0}</strong></div>`).join('')}</div><table><thead><tr><th>Figura</th><th>Tahy</th><th>Skóre tahů</th><th>Chyby</th></tr></thead><tbody>${r.pieces.map(p=>`<tr><td>${p.name}</td><td>${p.moves}</td><td>${percent(p.accuracy)}</td><td>${p.errors}</td></tr>`).join('')}</tbody></table></details>
  <h3>Pozice k procvičení</h3><p class="data-note">Největší ztráty hodnocení v tvých vyhodnocených tazích. Kliknutím otevřeš partii v daném tahu.</p><div class="training-list">${r.moments.slice(0,12).map((m,i)=>`<button data-moment="${i}"><span class="training-number">${m.number}${m.color==='w'?'.':'…'} ${esc(m.move)}</span><span>${esc(m.mark.label)} · ${PHASES[m.phase]}<small>vs ${esc(m.opponent)} · ${esc(m.date||'')}</small></span><span>→</span></button>`).join('')||'<p class="muted">Zatím nejsou vyhodnocené chyby.</p>'}</div></section></div>
  <p class="data-note analytics-method">Skóre výsledků = (výhry + ½ remíz) / partie. Skóre tahů je vlastní výpočet Evala, nikoli přesnost Chess.com. Částečné rozbory jsou zahrnuty jen svými hotovými tahy. Způsob ukončení se doplňuje pouze z konečné pozice nebo PGN.</p>`;
  root.querySelectorAll('[data-moment]').forEach(button=>button.onclick=()=>onPosition(r.moments[Number(button.dataset.moment)]));
  root.querySelectorAll('[data-insight]').forEach(button=>button.onclick=()=>onPosition(r.insights[Number(button.dataset.insight)].moment));
  root.querySelectorAll('[data-window]').forEach(button=>button.onclick=()=>onPosition(r.windows[Number(button.dataset.window)]));
  root.querySelectorAll('[data-pattern]').forEach(button=>button.onclick=()=>onPosition(r.moments.find(m=>m.reason===button.dataset.pattern)));
  root.querySelector('#export-insights').onclick=()=>{
    const {records,...safe}=r;const url=URL.createObjectURL(new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='evala-prehled.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}
