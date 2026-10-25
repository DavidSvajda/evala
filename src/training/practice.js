import { Chess } from 'chess.js';
import { phaseOf,errorReason,timeClass } from '../study/analytics.js';

export const ownColor=(game,name)=>['w','b'].find(c=>game.headers[c==='w'?'White':'Black']?.toLowerCase()===name.trim().toLowerCase());
export const ownScore=(score,color)=>score?.kind==='cp'?score.value*(color==='w'?1:-1):score?.kind==='mate'?Math.sign(score.value)*(color==='w'?1:-1)*10000:null;
export const positionKey=fen=>fen.split(' ').slice(0,4).join(' ');
export function cleanLearning(value,moves){
  const notes={};
  for(const [key,n] of Object.entries(value?.notes||{}).slice(0,200)){
    if(!/^\d+$/.test(key)||Number(key)>moves.length||!n||typeof n!=='object')continue;
    notes[key]={text:typeof n.text==='string'?n.text.slice(0,1200):'',critical:n.critical===true,plan:typeof n.plan==='string'?n.plan.slice(0,800):''};
  }
  const attempts=(Array.isArray(value?.attempts)?value.attempts:[]).filter(a=>a&&['mixed','defense','conversion','opening'].includes(a.mode)&&Number.isInteger(a.ply)&&a.ply>=0&&a.ply<moves.length&&Number.isFinite(a.at)&&Number.isFinite(a.loss)).slice(-100).map(a=>({mode:a.mode,ply:a.ply,at:Math.min(Date.now(),Math.max(0,a.at)),loss:Math.max(0,Math.min(20000,a.loss)),steps:Math.min(40,Math.max(1,Number(a.steps)||1)),result:a.result==='success'?'success':'practice'}));
  return {notes,attempts,selfAnalysis:value?.selfAnalysis===true};
}
export function practicePositions(games,username,mode='mixed'){
  const pool=[],seen=new Set();
  for(const game of games){
    const color=ownColor(game,username);if(!color)continue;
    for(const [ply,m] of game.moves.entries()){
      const score=game.analysis?.positions?.[ply],mark=game.analysis?.moves?.[ply],value=ownScore(score,color);
      if(m.color!==color||!score||score.depth<14||!score.lines?.[0]?.pv?.length||value===null||new Chess(m.fenBefore).isGameOver())continue;
      if(mode==='conversion'&&!(value>=200&&value<=700&&ply>=12))continue;
      if(mode==='defense'&&!(value>=-180&&value<=60&&score.lines?.[1]?.depth>=14&&ownScore(score.lines[1],color)<value-80))continue;
      if(mode==='opening'&&ply>=20)continue;
      if(mode==='mixed'&&(ply<8||Math.abs(value)>250||score.kind!=='cp'))continue;
      const key=positionKey(m.fenBefore);if(seen.has(key))continue;seen.add(key);
      pool.push({game,ply,color,fen:m.fenBefore,value,score,mark,quiet:!/[x+#]/.test(m.san)&&Math.abs(value)<80&&Math.abs(ownScore(score.lines?.[1],color)-value)<50});
    }
  }
  return pool;
}
export function openingRepertoire(games,username){
  const positions=new Map();
  for(const game of games){const color=ownColor(game,username);if(!color)continue;
    for(const [ply,m] of game.moves.slice(0,20).entries()){
      if(m.color!==color)continue;
      const key=positionKey(m.fenBefore),row=positions.get(key)||{fen:m.fenBefore,game,ply,color,count:0,moves:{},replies:{}};
      row.count++;row.moves[m.san]=(row.moves[m.san]||0)+1;
      const reply=game.moves[ply+1]?.san;if(reply)row.replies[reply]=(row.replies[reply]||0)+1;
      positions.set(key,row);
    }
  }
  return [...positions.values()].sort((a,b)=>b.count-a.count||a.ply-b.ply).slice(0,30);
}
export function weaknessEvidence(games,username){
  const eligible=games.filter(g=>ownColor(g,username)&&g.analysis?.complete).sort((a,b)=>{
    const date=g=>Date.parse((g.headers.UTCDate||g.headers.Date||'').replaceAll('.','-'))||g.createdAt||0;return date(b)-date(a);
  });
  const groups=new Map();
  for(const game of eligible){const color=ownColor(game,username),speed=timeClass(game.headers.TimeControl);const bucket=groups.get(speed)||[];bucket.push({game,color});groups.set(speed,bucket);}
  return [...groups].map(([speed,entries])=>{
    const sample=items=>{const buckets={};for(const {game,color} of items)for(const [ply,m] of game.moves.entries()){
      const mark=game.analysis.moves[ply];if(m.color!==color||!mark)continue;
      const phase=phaseOf(m.fenBefore),b=buckets[phase]||={moves:0,errors:0,examples:[]};b.moves++;
      if(mark.loss>=10){b.errors++;if(b.examples.length<3)b.examples.push({game,ply:ply+1,reason:errorReason(m,game.analysis.positions[ply],game.analysis.positions[ply+1])});}
    }return buckets;};
    return {speed,recentGames:Math.min(10,entries.length),priorGames:Math.max(0,Math.min(10,entries.length-10)),recent:sample(entries.slice(0,10)),prior:sample(entries.slice(10,20))};
  });
}
