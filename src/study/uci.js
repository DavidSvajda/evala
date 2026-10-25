import { Chess } from 'chess.js';
import { validPosition, terminalScore } from '../core/position.js';

export function parseStudyInfo(line,turn='w') {
  const score=line.match(/\bscore (cp|mate) (-?\d+)/);
  if(!line.startsWith('info ')||!score||/\b(lowerbound|upperbound)\b/.test(line))return null;
  const n=key=>Number(line.match(new RegExp(`\\b${key} (\\d+)`))?.[1]||0);
  const wdl=line.match(/\bwdl (\d+) (\d+) (\d+)/);
  return {kind:score[1],value:Number(score[2])*(turn==='w'?1:-1),depth:n('depth'),nodes:n('nodes'),nps:n('nps'),time:n('time'),multipv:n('multipv')||1,pv:(line.match(/\bpv (.+)$/)?.[1]||'').trim().split(/\s+/).filter(s=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)),wdl:wdl?(turn==='w'?wdl.slice(1).map(Number):wdl.slice(1).map(Number).reverse()):null};
}

export function searchSettings(input={}) {
  const cap=(v,d,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.round(Number(v)))):d;
  return {depth:cap(input.depth,18,6,30),time:cap(input.time,750,100,10000),hash:cap(input.hash,64,16,256),multipv:cap(input.multipv,3,1,5),engine:input.engine==='lite'?'lite':'full'};
}

export class StudyEngine {
  constructor(makeWorker){this.makeWorker=makeWorker;this.worker=null;this.ready=null;this.active=null;this.tail=Promise.resolve();this.configured={};this.cache=[];this.cacheBytes=0;}
  boot(){
    if(this.ready)return this.ready;
    this.ready=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.fail(new Error('Engine se nenačetl do 45 sekund. Zkontroluj instalaci a volnou paměť.')),45000);
      this.rejectBoot=error=>{clearTimeout(timer);reject(error);};
      try{
        this.worker=this.makeWorker();
        this.worker.onerror=e=>this.fail(new Error(e.message||'Engine se nepodařilo spustit. Zkus menší Lite engine nebo obnov stránku.'));
        this.worker.onmessage=e=>{
          const line=String(e.data).trim();
          if(line==='uciok'){this.worker.postMessage('setoption name UCI_ShowWDL value true');this.worker.postMessage('isready');}
          else if(line==='readyok'){
            if(this.barrier){const barrier=this.barrier;this.barrier=null;barrier.resolve();}
            else{clearTimeout(timer);this.rejectBoot=null;resolve();}
          }
          else this.onLine(line);
        };
        this.worker.postMessage('uci');
      }catch(error){clearTimeout(timer);reject(error);}
    });
    return this.ready;
  }
  search(request,{signal,onInfo}={}){
    const run=async()=>{
      if(signal?.aborted)throw new DOMException('Výpočet byl zrušen.','AbortError');
      if(!validPosition(request.fen))throw new Error('Engine odmítl neplatnou pozici.');
      const terminal=terminalScore(request.fen);
      if(terminal)return {...terminal,lines:[],wdl:terminal.kind==='mate'?(terminal.value>0?[1000,0,0]:[0,0,1000]):[0,1000,0]};
      const settings=searchSettings(request.settings),scope=request.cacheScope;
      // Server-issued scope objects isolate result reuse between sessions.
      // Full history and all search settings are part of the exact input key.
      const cacheKey=scope&&typeof scope==='object'?JSON.stringify([request.fen,request.history||null,settings]):null;
      const hit=cacheKey&&this.cache.find(e=>e.scope===scope&&e.key===cacheKey&&e.expires>Date.now());
      if(hit){const result=JSON.parse(hit.json);onInfo?.(result);return result;}
      await this.boot();
      if(signal?.aborted)throw new DOMException('Výpočet byl zrušen.','AbortError');
      const gameKey=request.gameKey??request.history?.initialFen??request.fen;
      if(this.gameKey!==gameKey||this.gameScope!==scope){
        await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>this.fail(new Error('Engine neodpovídá. Spusť rozbor znovu.')),10000);
          this.barrier={resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}};
          this.worker.postMessage('ucinewgame');this.worker.postMessage('isready');
        });
        this.gameKey=gameKey;this.gameScope=scope;
      }
      if(signal?.aborted)throw new DOMException('Výpočet byl zrušen.','AbortError');
      const result=await new Promise((resolve,reject)=>{
        const abort=()=>{
          if(!this.active)return;
          this.active.aborted=true;
          this.worker.postMessage('stop');
          this.active.stopTimer=setTimeout(()=>this.fail(new Error('Engine neodpovídá. Spusť rozbor znovu.')),3000);
        };
        const cleanup=()=>signal?.removeEventListener('abort',abort);
        this.active={resolve,reject,onInfo,cleanup,lines:new Map(),turn:request.fen.split(' ')[1],aborted:false};
        signal?.addEventListener('abort',abort,{once:true});
        // In SF19 assigning Hash again reallocates and clears the TT, even at
        // the same size. Preserve it between related positions and searches.
        for(const [name,value] of [['Hash',settings.hash],['MultiPV',settings.multipv]]){
          if(this.configured[name]!==value){this.worker.postMessage(`setoption name ${name} value ${value}`);this.configured[name]=value;}
        }
        // Replaying history lets Stockfish account for repetition, unlike a bare FEN.
        const history=request.history;
        const position=history && validPosition(history.initialFen) && Array.isArray(history.moves) && history.moves.length<=600 && history.moves.every(m=>/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
          ?`position fen ${history.initialFen}${history.moves.length?' moves '+history.moves.join(' '):''}`:`position fen ${request.fen}`;
        this.worker.postMessage(position);
        this.worker.postMessage(`go depth ${settings.depth} movetime ${settings.time}`);
        this.active.watchdog=setTimeout(()=>this.fail(new Error('Časový limit enginu byl překročen. Zkus kratší profil.')),settings.time+12000);
      });
      // A time-limited, shallow result may never replace a requested depth.
      if(cacheKey&&result.depth>=settings.depth&&result.lines.length>=settings.multipv&&result.lines.every(l=>l.depth>=settings.depth)){
        const json=JSON.stringify(result),bytes=(json.length+cacheKey.length)*2;
        if(bytes<=262144){
          this.cache.push({scope,key:cacheKey,json,bytes,expires:Date.now()+15*60000});this.cacheBytes+=bytes;
          while(this.cache.length>64||this.cacheBytes>2*1024*1024)this.cacheBytes-=this.cache.shift().bytes;
        }
      }
      return result;
    };
    const promise=this.tail.catch(()=>{}).then(run);
    this.tail=promise;
    return promise;
  }
  onLine(line){
    if(/CRITICAL ERROR|Aborted\(/.test(line)){this.fail(new Error('Engine odmítl pozici. Použij standardní šachy.'));return;}
    const active=this.active;if(!active)return;
    if(line.startsWith('bestmove')){
      this.active=null;active.cleanup();clearTimeout(active.watchdog);clearTimeout(active.stopTimer);
      if(active.aborted){active.reject(new DOMException('Výpočet byl zrušen.','AbortError'));return;}
      const lines=[...active.lines.values()].sort((a,b)=>a.multipv-b.multipv);
      const first=lines[0];
      if(!first){active.reject(new Error('Engine nevrátil hodnocení. Zkus výpočet znovu.'));return;}
      active.resolve({...first,lines,bestmove:line.split(' ')[1]});return;
    }
    if(active.aborted)return;
    const info=parseStudyInfo(line,active.turn);
    if(info){active.lines.set(info.multipv,info);active.onInfo?.({...info,lines:[...active.lines.values()].sort((a,b)=>a.multipv-b.multipv)});}
  }
  fail(error){
    this.rejectBoot?.(error);this.rejectBoot=null;
    this.barrier?.reject(error);this.barrier=null;this.gameKey=undefined;this.gameScope=undefined;
    if(this.active){this.active.cleanup();clearTimeout(this.active.watchdog);clearTimeout(this.active.stopTimer);this.active.reject(error);this.active=null;}
    this.worker?.terminate();this.worker=null;this.ready=null;this.configured={};this.cache=[];this.cacheBytes=0;
  }
  dispose(){this.fail(new DOMException('Výpočet byl zrušen.','AbortError'));}
}
