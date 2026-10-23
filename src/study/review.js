import { Chess } from 'chess.js';
import { lineToSan } from './game.js';

export const REVIEW_VERSION=2;
const values={p:100,n:320,b:330,r:500,q:900,k:0};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function expectedPercent(score){
  if(!score)return null;
  if(score.kind==='mate')return score.value>0?100:score.value<0?0:50;
  return 50+50*(2/(1+Math.exp(-.00368208*score.value))-1);
}
function material(chess,color){return chess.board().flat().filter(Boolean).reduce((sum,p)=>sum+(p.color===color?1:-1)*values[p.type],0);}

export function classifyMove(move,before,after){
  if(!before||!after)return null;
  const sign=move.color==='w'?1:-1;
  const loss=Math.max(0,(expectedPercent(before)-expectedPercent(after))*sign);
  const accuracy=clamp(103.1668*Math.exp(-.04354*loss)-3.1669,0,100);
  const best=before.lines?.[0]?.pv?.[0]===move.uci;
  const base={loss,accuracy,best,depth:Math.min(before.depth||0,after.depth||0)};
  if(best&&loss<5)return {...base,kind:'best',label:'Nejlepší',symbol:'★',note:'Zahraný tah odpovídá první variantě enginu.'};
  if(loss<2)return {...base,kind:'excellent',label:'Výborný',symbol:'✓',note:'Zachovává téměř celé hodnocení pozice.'};
  if(loss<5)return {...base,kind:'good',label:'Dobrý',symbol:'',note:'Rozumné pokračování s malou ztrátou hodnocení.'};
  if(loss<10)return {...base,kind:'inaccuracy',label:'Nepřesnost',symbol:'?!',note:'Existovalo přesnější pokračování.'};
  if(loss<20)return {...base,kind:'mistake',label:'Chyba',symbol:'?',note:'Tah citelně zhoršil vyhlídky v pozici.'};
  return {...base,kind:'blunder',label:'Hrubá chyba',symbol:'??',note:'Velká ztráta hodnocení. Projdi si doporučenou variantu.'};
}

export function brilliantEligible(move,before,after){
  const own=score=>move.color==='w'?expectedPercent(score):100-expectedPercent(score);
  const alternative=before?.lines?.[1];
  return !!alternative && own(alternative)<85 && own(after)>=45;
}

// Conservative static exchange test: a free recapture is not a sacrifice.
// This only nominates a candidate; an additional engine search must confirm it.
export function sacrificeCandidates(move){
  const chess=new Chess(move.fenAfter),owner=move.color,baseline=material(chess,owner),candidates=[];
  if(move.piece==='p'||move.promotion)return candidates;
  for(const capture of chess.moves({verbose:true}).filter(m=>m.captured&&values[m.captured]>=300)){
    chess.move(capture);
    const capturedFen=chess.fen();
    let bestMaterial=material(chess,owner);
    for(const recapture of chess.moves({verbose:true}).filter(m=>m.to===capture.to&&m.captured)){
      chess.move(recapture);bestMaterial=Math.max(bestMaterial,material(chess,owner));chess.undo();
    }
    if(baseline-bestMaterial>=200)candidates.push({capture:capture.from+capture.to+(capture.promotion||''),fen:capturedFen,materialLoss:baseline-bestMaterial});
    chess.undo();
  }
  return candidates.sort((a,b)=>b.materialLoss-a.materialLoss).slice(0,2);
}

export function summarize(game){
  const list=game.analysis?.moves||[];
  return Object.fromEntries(['w','b'].map(color=>{
    const marks=list.filter((m,i)=>m&&game.moves[i].color===color);
    return [color,{accuracy:marks.length?marks.reduce((n,m)=>n+m.accuracy,0)/marks.length:null,count:marks.length,blunders:marks.filter(m=>m.kind==='blunder').length,mistakes:marks.filter(m=>m.kind==='mistake').length,brilliants:marks.filter(m=>m.kind==='brilliant').length}];
  }));
}

export async function reviewGame(game,engine,options,{signal,onUpdate}={}){
  const key=JSON.stringify({version:REVIEW_VERSION,engine:options.engine,backend:options.backend,server:options.backend==='server'?options.serverUrl:'',depth:options.depth,time:options.time,multipv:options.multipv});
  if(game.analysis?.key!==key)game.analysis={key,version:REVIEW_VERSION,positions:[],moves:[],complete:false,engine:options.engine,options:{depth:options.depth,time:options.time,multipv:options.multipv},startedAt:Date.now()};
  const report=game.analysis,start=performance.now();let processed=0;
  const publish=(phase,index,total)=>{
    report.moves=game.moves.map((move,i)=>classifyMove(move,report.positions[i],report.positions[i+1]));
    for(const [i,mark] of (report.specials||[]))if(report.moves[i])report.moves[i]={...report.moves[i],...mark};
    onUpdate?.({phase,index,total,processed,elapsed:performance.now()-start,report});
  };
  for(let i=0;i<game.fens.length;i++){
    if(signal?.aborted)throw new DOMException('Rozbor byl pozastaven.','AbortError');
    if(report.positions[i]){publish('positions',i+1,game.fens.length);continue;}
    const history={initialFen:game.initialFen,moves:game.moves.slice(0,i).map(m=>m.uci)};
    report.positions[i]=await engine.search({fen:game.fens[i],history,settings:options},{signal});
    processed++;publish('positions',i+1,game.fens.length);
  }
  // Recheck only critical positions, bounded to avoid hours of extra work.
  const critical=report.moves.map((mark,i)=>({mark,i})).filter(({mark})=>mark&&mark.loss>=5).sort((a,b)=>b.mark.loss-a.mark.loss).slice(0,8);
  report.refined ||= [];
  for(const [n,{i}] of critical.entries()){
    if(report.refined.includes(i))continue;
    for(const index of [i,i+1])report.positions[index]=await engine.search({fen:game.fens[index],history:{initialFen:game.initialFen,moves:game.moves.slice(0,index).map(m=>m.uci)},settings:{...options,time:Math.min(5000,options.time*2),depth:Math.min(30,options.depth+2)}},{signal});
    report.refined.push(i);publish('refine',n+1,critical.length);
  }
  const nominees=report.moves.map((mark,i)=>({mark,i})).filter(({mark,i})=>mark?.loss<2&&mark.best&&game.moves[i].piece!=='p');
  let verified=0;report.specials ||= [];
  for(const [scan,{mark,i}] of nominees.entries()){
    if(signal?.aborted)throw new DOMException('Rozbor byl pozastaven.','AbortError');
    if(scan&&scan%12===0)await new Promise(done=>setTimeout(done,0));
    if(verified>=6)break;
    const move=game.moves[i],sign=move.color==='w'?1:-1;
    const ownExpected=score=>move.color==='w'?expectedPercent(score):100-expectedPercent(score);
    // The second-best continuation matters: a winning best move can be the
    // only way to win. A winning score BEFORE it is not enough to reject it.
    if(!brilliantEligible(move,report.positions[i],report.positions[i+1]))continue;
    const sacrifices=sacrificeCandidates(move);if(!sacrifices.length)continue;
    const candidate=sacrifices[0];verified++;
    publish('brilliant',verified,Math.min(6,nominees.length));
    const proof=await engine.search({fen:candidate.fen,history:{initialFen:game.initialFen,moves:[...game.moves.slice(0,i+1).map(m=>m.uci),candidate.capture]},settings:{...options,time:Math.max(1200,options.time*2),depth:Math.max(18,options.depth),multipv:1}},{signal});
    const stable=proof.depth>=14&&ownExpected(proof)>=45&&ownExpected(report.positions[i+1])-ownExpected(proof)<8;
    const special={kind:stable?'brilliant':'sacrifice',label:stable?'Brilantní*':'Zajímavá oběť',symbol:stable?'!!':'!?',note:stable?'Vlastní klasifikace Evala: nejlepší tah, skutečná oběť materiálu a engine ověřil kompenzaci po přijetí oběti. Není to odznak Chess.com.':'Kandidát na oběť. Hlubší výpočet zatím nepotvrdil všechny podmínky pro brilantní tah.',proof:{capture:candidate.capture,score:proof,continuation:lineToSan(candidate.fen,proof.lines?.[0]?.pv||[],8)}};
    report.specials=report.specials.filter(([index])=>index!==i);report.specials.push([i,special]);
    publish('brilliant',verified,Math.min(6,nominees.length));
  }
  report.complete=true;report.finishedAt=Date.now();publish('done',game.fens.length,game.fens.length);
  return report;
}
