// Versioned incremental transport. Scores, PVs and proof certificates are
// unchanged; only changed array entries cross the wire between full snapshots.
export function reviewProgressEncoder(){
  const positions=[],moves=[];let first=true;
  return ({report,...progress})=>{
    const patch={reset:first,meta:{key:report.key,version:report.version,engine:report.engine,options:report.options,startedAt:report.startedAt,complete:report.complete,finishedAt:report.finishedAt,refined:report.refined,refinedPositions:report.refinedPositions},positions:[],moves:[]};
    first=false;
    for(const [i,position] of report.positions.entries())if(positions[i]!==position){positions[i]=position;patch.positions.push([i,position]);}
    for(const [i,mark] of report.moves.entries()){
      const signature=JSON.stringify(mark);if(moves[i]!==signature){moves[i]=signature;patch.moves.push([i,mark]);}
    }
    return {type:'progress',...progress,patch};
  };
}

export function applyReviewProgress(game,message){
  // Older servers remain usable while clients and containers roll over.
  if(message.report){game.analysis=message.report;return;}
  const p=message.patch;if(!p)return;
  if(!p.meta||!Array.isArray(p.positions)||!Array.isArray(p.moves)||p.positions.length>game.fens.length||p.moves.length>game.moves.length)throw new Error('Neplatná aktualizace rozboru.');
  const valid=(entries,size)=>entries.every(entry=>Array.isArray(entry)&&entry.length===2&&Number.isInteger(entry[0])&&entry[0]>=0&&entry[0]<size);
  if(!valid(p.positions,game.fens.length)||!valid(p.moves,game.moves.length))throw new Error('Neplatná pozice v rozboru.');
  if(p.reset||!game.analysis||game.analysis.key!==p.meta.key)game.analysis={positions:[],moves:[]};
  Object.assign(game.analysis,p.meta);
  for(const [i,value] of p.positions)game.analysis.positions[i]=value;
  for(const [i,value] of p.moves)game.analysis.moves[i]=value;
}
