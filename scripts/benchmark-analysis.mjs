// One small A/B diagnostic, not a chess-strength benchmark. No user games.
import {StudyEngine} from '../src/study/uci.js';
import {nodeWorker} from '../server/worker.mjs';
import {parsePgn,DEMO_PGN} from '../src/study/game.js';
const game=parsePgn(DEMO_PGN),gameKey=game.initialFen+'|'+game.moves.map(m=>m.uci).join(' '),settings={time:400,depth:12,multipv:2,hash:64};
async function sample(resetHash){
  let searches=0;const scope=resetHash?undefined:{};
  const engine=new StudyEngine(()=>{
    const worker=nodeWorker(),send=worker.postMessage;
    worker.postMessage=c=>{if(resetHash&&c.startsWith('setoption name Hash'))return;if(c.startsWith('go ')){searches++;if(resetHash)send('setoption name Hash value 64');}send(c);};return worker;
  });
  try{
    await engine.boot();const started=performance.now(),scores=[];
    for(let i=0;i<8;i++){
      const result=await engine.search({gameKey,cacheScope:scope,fen:game.fens[i],history:{initialFen:game.initialFen,moves:game.moves.slice(0,i).map(m=>m.uci)},settings});
      scores.push({depth:result.depth,cp:result.value,lines:result.lines.length,nodes:result.nodes});
    }
    const ms=Math.round(performance.now()-started),repeatStart=performance.now(),priorSearches=searches;
    for(let i=0;i<8;i++)await engine.search({gameKey,cacheScope:scope,fen:game.fens[i],history:{initialFen:game.initialFen,moves:game.moves.slice(0,i).map(m=>m.uci)},settings});
    return {ms,minDepth:Math.min(...scores.map(s=>s.depth)),minLines:Math.min(...scores.map(s=>s.lines)),nodes:scores.reduce((n,s)=>n+s.nodes,0),repeatMs:Math.round(performance.now()-repeatStart),repeatSearches:searches-priorSearches};
  }finally{engine.dispose();}
}
const baseline=await sample(true),optimized=await sample(false);
console.log(JSON.stringify({positions:8,settings,engine:process.env.STOCKFISH_PATH?'native Stockfish 19':'single-thread WASM Stockfish 19',baseline,optimized,speedup:Number((baseline.ms/optimized.ms).toFixed(2)),note:'One local diagnostic; equal search limits, not a strength guarantee or an Azure SLA.'},null,2));
