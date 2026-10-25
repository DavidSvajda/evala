// Local, aggregate-only feasibility check. No data is uploaded or activated.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {estimateGamePerformance} from '../src/study/review.js';
const [input,output,pool='chesscom',speed='blitz']=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/calibrate-performance.mjs account-export.json report.json [chesscom|lichess] [blitz|rapid|bullet|classical]');
const data=JSON.parse(await readFile(input,'utf8')),rows=[],seen=new Set();
for(const game of data.games||[]){
  const source=JSON.stringify([game.headers?.Site,game.headers?.Link]).toLowerCase();if(!source.includes(pool==='chesscom'?'chess.com':'lichess.org'))continue;
  const clock=String(game.headers.TimeControl||'').match(/^(\d+)\+(\d+)$/);if(!clock)continue;
  const seconds=Number(clock[1])+40*Number(clock[2]),category=seconds<180?'bullet':seconds<600?'blitz':seconds<1800?'rapid':'classical';if(category!==speed)continue;
  for(const color of ['w','b']){const p=estimateGamePerformance(game,color);if(!p.value)continue;
    const name=game.headers[color==='w'?'White':'Black'];if(!name||/[?]/.test(name))continue;
    const group=createHash('sha256').update(pool+':'+name.toLowerCase()).digest('hex');
    const key=game.id+':'+color;if(seen.has(key))continue;seen.add(key);rows.push({quality:p.quality,rating:p.baseline,group});
  }
}
const train=rows.filter(r=>parseInt(r.group.slice(0,2),16)%5!==0),test=rows.filter(r=>parseInt(r.group.slice(0,2),16)%5===0),players=new Set(rows.map(r=>r.group)).size;
const report={pool,speed,samples:rows.length,players,holdout:test.length,activated:false,calibrated:false,reason:'Need at least 200 observations, 50 players, 30 held-out observations and four populated rating bands.'};
const bands=new Map();rows.forEach(r=>bands.set(Math.floor(r.rating/400),(bands.get(Math.floor(r.rating/400))||0)+1));
if(rows.length>=200&&players>=50&&test.length>=30&&[...bands.values()].filter(n=>n>=10).length>=4){
  const mx=train.reduce((s,r)=>s+r.quality,0)/train.length,my=train.reduce((s,r)=>s+r.rating,0)/train.length;
  const variance=train.reduce((s,r)=>s+(r.quality-mx)**2,0),slope=train.reduce((s,r)=>s+(r.quality-mx)*(r.rating-my),0)/variance,intercept=my-slope*mx;
  const rmse=Math.sqrt(test.reduce((s,r)=>s+(r.rating-(intercept+slope*r.quality))**2,0)/test.length),baseline=Math.sqrt(test.reduce((s,r)=>s+(r.rating-my)**2,0)/test.length);
  Object.assign(report,{slope,intercept,rmse,baselineRmse:baseline,eligibleForReview:Number.isFinite(slope)&&slope>0&&rmse<baseline*.9,reason:'Held-out players; reference is PGN player rating, not independent ground truth for single-game strength. Review required before activation.'});
}
await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
