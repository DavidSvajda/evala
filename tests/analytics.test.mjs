import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePgn } from '../src/study/game.js';
import { classifyMove } from '../src/study/review.js';
import { analyzeLibrary,phaseOf,timeClass,errorInterval,errorReason } from '../src/study/analytics.js';

test('player insights use only the named player, completed results and evaluated own moves',()=>{
  const white=parsePgn('[White "Schweits"]\n[Black "Opponent"]\n[Result "0-1"]\n[TimeControl "600"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  white.analysis={positions:[{kind:'cp',value:250},{kind:'cp',value:0},{kind:'cp',value:0},{kind:'mate',value:-1},{kind:'mate',value:-1}],moves:[{accuracy:40,loss:20,kind:'blunder'},{accuracy:100,loss:0,kind:'best'},{accuracy:10,loss:40,kind:'blunder'},{accuracy:100,loss:0,kind:'best'}]};
  const black=parsePgn('[White "Other"]\n[Black "Schweits"]\n[Result "0-1"]\n[TimeControl "180+2"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  const unfinished=parsePgn('[White "Schweits"]\n[Black "Other"]\n\n1. e4 e5 *');
  const report=analyzeLibrary([white,black,unfinished],{username:'sChWeItS'});
  assert.equal(report.overall.games,2);assert.equal(report.overall.win,1);assert.equal(report.overall.loss,1);
  assert.equal(report.overall.moves,2);assert.equal(report.overall.accuracy,25);assert.equal(report.analyzedGames,1);
  assert.equal(report.moments[0].ply,3);assert.equal(report.moments[0].gameId,white.id);
  assert.equal(report.winning,1);assert.equal(report.converted,0);
  assert.equal(report.intervals[0].moves,2);assert.equal(report.windows[0].errors,2);
  assert.equal(report.pieces.find(p=>p.key==='p').moves,2);
  assert.equal(report.terminations[0].name,'Mat');
  assert.equal(analyzeLibrary([white,black],{username:'Schweits',color:'b'}).overall.games,1);
  assert.equal(analyzeLibrary([white,black],{username:'Schweits',time:'rapid'}).overall.games,1);
  assert.equal(analyzeLibrary([white],{username:'Nobody'}).overall.games,0);
});
test('uncertainty and material motifs do not invent precise claims from no data',()=>{
  assert.equal(errorInterval(0,0),null);assert.ok(errorInterval(1,5)[1]>errorInterval(20,100)[1]);
  const move=parsePgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0').moves.at(-1);
  assert.equal(errorReason(move,{kind:'mate',value:1},{kind:'mate',value:0}),'mate');
  assert.equal(errorReason(move,{kind:'cp',value:0},{kind:'cp',value:100,lines:[]}),'other');
});
test('phase, time controls and missing data are explicit',()=>{
  assert.equal(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),'opening');
  assert.equal(phaseOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 11'),'middlegame');
  assert.equal(phaseOf('8/5k2/8/8/8/8/2K5/8 w - - 0 4'),'endgame');
  assert.equal(timeClass('60+1'),'bullet');assert.equal(timeClass('180+2'),'blitz');assert.equal(timeClass('600'),'rapid');assert.equal(timeClass('1/86400'),'unknown');
  const g=parsePgn('[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 {[%clk 0:04:59.5]} e5 1-0');
  assert.equal(g.moves[0].clockAfter,299.5);assert.equal(g.moves[1].clockAfter,null);
  const r=analyzeLibrary([g],{username:'A'});assert.equal(r.overall.accuracy,null);assert.equal(r.analyzedGames,0);assert.equal(r.insights.length,0);
});
test('great and missed opportunity require engine evidence and are color symmetric',()=>{
  const score=value=>({kind:'cp',value,depth:18});
  const before={...score(0),lines:[{...score(0),pv:['e2e4']},{...score(-500),pv:['d2d4']}]};
  assert.equal(classifyMove({color:'w',uci:'e2e4'},before,score(0)).kind,'great');
  assert.equal(classifyMove({color:'w',uci:'e2e4'},{...before,depth:8},score(0)).kind,'best');
  assert.equal(classifyMove({color:'w',uci:'a2a3'},{kind:'mate',value:2,depth:18},score(0)).kind,'miss');
  assert.equal(classifyMove({color:'b',uci:'a7a6'},{kind:'mate',value:-2,depth:18},score(0)).kind,'miss');
  assert.equal(classifyMove({color:'w',uci:'a2a3'},score(400),score(0),{previous:score(0)}).kind,'miss');
});
