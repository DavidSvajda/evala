import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { DEMO_PGN,parsePgn,parsePgnCollection,lineToSan,annotatedPgn } from '../src/study/game.js';
import { parseStudyInfo,StudyEngine } from '../src/study/uci.js';
import { classifyMove,expectedPercent,sacrificeCandidates,reviewGame,brilliantEligible } from '../src/study/review.js';
import { nodeWorker } from '../server/worker.mjs';
import { serverAddress } from '../src/study/remote.js';

test('PGN import, collection, variations and annotated export round-trip',()=>{
  const game=parsePgn(DEMO_PGN);assert.equal(game.moves.length,33);assert.equal(new Chess(game.fens.at(-1)).isCheckmate(),true);
  assert.equal(game.moves[16].uci,'c1g5');
  assert.equal(parsePgnCollection(DEMO_PGN+'\n\n'+DEMO_PGN).games.length,2);
  const reimport=parsePgn(annotatedPgn(game));assert.equal(reimport.id,game.id);
  assert.match(lineToSan(game.initialFen,['e2e4','e7e5','g1f3']),/1\.e4 e5 2\.Nf3/);
  assert.throws(()=>parsePgn('[Variant "Crazyhouse"]\n\n1. e4 *'),/variant/);
  assert.throws(()=>parsePgn('1. e9 *'),/PGN/);
});

test('MultiPV and WDL retain each line and normalize Black to White',()=>{
  const info=parseStudyInfo('info depth 17 multipv 3 score cp 120 wdl 450 400 150 nodes 10000 nps 123456 time 700 pv e7e5 g1f3','b');
  assert.equal(info.multipv,3);assert.equal(info.value,-120);assert.deepEqual(info.wdl,[150,400,450]);assert.deepEqual(info.pv,['e7e5','g1f3']);
  assert.equal(parseStudyInfo('info depth 12 score cp 200 upperbound'),null);
});

test('move quality is symmetric, and high evaluations do not invent brilliants',()=>{
  const before={kind:'cp',value:0,lines:[{pv:['e2e4']}]},after={kind:'cp',value:-800};
  assert.equal(classifyMove({color:'w',uci:'d2d4'},before,after).kind,'blunder');
  assert.equal(classifyMove({color:'b',uci:'e7e5'},before,{kind:'cp',value:800}).kind,'blunder');
  assert.equal(classifyMove({color:'w',uci:'e2e4'},before,before).kind,'best');
  assert.equal(expectedPercent({kind:'cp',value:0}),50);
  const game=parsePgn(DEMO_PGN);assert.ok(sacrificeCandidates(game.moves[30]).some(c=>c.capture==='d7b8'));
  assert.equal(brilliantEligible({color:'w'},{kind:'mate',value:3,lines:[{kind:'mate',value:3},{kind:'cp',value:0}]},{kind:'mate',value:2}),true,'a forced win must not hide a sacrifice if alternatives do not win');
  assert.equal(brilliantEligible({color:'w'},{lines:[{kind:'mate',value:3},{kind:'mate',value:4}]},{kind:'mate',value:2}),false,'an already won alternative excludes the brilliant label');
});

test('server URLs prohibit credentials and insecure remote HTTP',()=>{
  assert.equal(serverAddress('https://chess.example/anything'),'https://chess.example');
  assert.equal(serverAddress('http://127.0.0.1:8080'),'http://127.0.0.1:8080');
  assert.throws(()=>serverAddress('http://public.example'),/HTTPS/);
  assert.throws(()=>serverAddress('https://user:pass@example.com'),/HTTPS/);
});

test('full Stockfish 19 returns real MultiPV and safely cancels an active search',async()=>{
  const engine=new StudyEngine(()=>nodeWorker());
  try{
    const result=await engine.search({fen:'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',settings:{depth:14,time:300,multipv:3}});
    assert.ok(result.value>500);assert.equal(result.lines.length,3);assert.ok(result.lines.every(l=>l.pv.length&&l.depth>0));
    const controller=new AbortController();
    const pending=engine.search({fen:new Chess().fen(),settings:{depth:30,time:10000,multipv:3}},{signal:controller.signal});
    setTimeout(()=>controller.abort(),70);
    await assert.rejects(pending,{name:'AbortError'});
    const next=await engine.search({fen:new Chess().fen(),settings:{depth:8,time:100,multipv:1}});assert.ok(next.depth>0);
  }finally{engine.dispose();}
});
