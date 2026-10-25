import { randomBytes } from 'node:crypto';
import { parsePgn } from '../src/study/game.js';
import { reviewGame } from '../src/study/review.js';
import { reviewProgressEncoder } from '../src/study/review-stream.js';

export const REPORT_PROFILES={
  quick:{time:150,depth:16,multipv:2,hash:64,refineLimit:2,verifySacrifices:false},
  balanced:{time:500,depth:20,multipv:3,hash:64,refineLimit:4,verifySacrifices:true},
};
export function createPublicReviews({slots,enabled=false,isOwner=()=>false,budgetSeconds=1800}={}){
  const sessions=new Map(),starts=new Map(),queue=[];
  const ownerScope={};
  const cacheScope=req=>isOwner(req)?ownerScope:session(req);
  let day='',used=0;
  const budget=()=>{const today=new Date().toISOString().slice(0,10);if(today!==day){day=today;used=0;}return Math.max(0,budgetSeconds-used);};
  const cookie=req=>String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('evala_session='))?.slice(14);
  const session=req=>{const s=sessions.get(cookie(req));return s&&s.expires>Date.now()?s:null;};
  const error=(message,status=429)=>Object.assign(new Error(message),{status});
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  function reserve(req,seconds,game=false){
    if(isOwner(req))return;
    const s=session(req);if(!enabled||!s)throw error('Obnov stránku a připoj se znovu.',401);
    budget();if(s.day!==day){s.day=day;s.games=0;s.seconds=0;}
    if(game&&s.games>=100)throw error('Dnešní limit je 100 partií pro jedno připojení.');
    if(used+seconds>budgetSeconds)throw error('Dnešní výpočetní kapacita je vyčerpaná. Zkus to zítra.');
    used+=seconds;s.seconds+=seconds;if(game)s.games++;
  }
  function pump(){
    for(const slot of slots){if(slot.busy)continue;const next=queue.shift();if(!next)break;next.cleanup();slot.busy=true;next.resolve({engine:slot.engine,release:()=>{slot.busy=false;pump();}});}
  }
  function acquire(signal){
    if(signal?.aborted)return Promise.reject(new DOMException('Výpočet zrušen.','AbortError'));
    if(queue.length>=3)return Promise.reject(error('Fronta je plná. Zkus rozbor za chvíli.'));
    return new Promise((resolve,reject)=>{
      const entry={resolve,reject,cleanup:()=>{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}};
      const abort=()=>{const index=queue.indexOf(entry);if(index>=0)queue.splice(index,1);entry.cleanup();reject(new DOMException('Výpočet zrušen.','AbortError'));};
      const timeout=setTimeout(()=>{abort();},120000);signal?.addEventListener('abort',abort,{once:true});queue.push(entry);pump();
    });
  }
  async function handle(req,res,url){
    if(url.pathname==='/api/session'&&enabled){
      if(req.method!=='GET'&&req.method!=='POST'){json(res,405,{error:'Use GET or POST'});return true;}
      if(!session(req)){
        const now=Date.now(),ip=req.socket.remoteAddress;let rate=starts.get(ip);
        if(!rate||now-rate.start>3600000){rate={start:now,count:0};starts.set(ip,rate);}
        if(++rate.count>40){json(res,429,{error:'Příliš mnoho nových připojení. Zkus to později.'});return true;}
        for(const [id,s] of sessions)if(s.expires<now)sessions.delete(id);
        if(sessions.size>=500){json(res,503,{error:'Služba je nyní vytížená.'});return true;}
        const id=randomBytes(24).toString('hex');sessions.set(id,{expires:now+8*3600000,games:0,seconds:0,day});
        const secure=req.socket.encrypted||String(req.headers['x-forwarded-proto']).split(',')[0]==='https';
        res.setHeader('Set-Cookie',`evala_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);
      }
      json(res,200,{ok:true,publicReports:true,maxGames:100,remainingSeconds:Math.floor(budget()),profiles:Object.keys(REPORT_PROFILES)});return true;
    }
    if(url.pathname!=='/api/review-game')return false;
    if(!isOwner(req)&&(!enabled||!session(req))){json(res,401,{error:'Otevři aplikaci a obnov připojení.'});return true;}
    if(req.method!=='POST'){json(res,405,{error:'Use POST'});return true;}
    const controller=new AbortController();let lease,sent=false;
    const timeout=setTimeout(()=>controller.abort(),180000);
    res.on('close',()=>{if(!res.writableFinished)controller.abort();});
    const send=value=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(value)+'\n');};
    let heartbeat;
    try{
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>300000)throw error('PGN je příliš velké.',400);}
      const request=JSON.parse(body),game=parsePgn(request.pgn);
      if(!['1-0','0-1','1/2-1/2'].includes(game.headers.Result))throw error('Rozbor přijímá dokončené partie.',400);
      const options={...REPORT_PROFILES[request.profile==='balanced'?'balanced':'quick'],engine:'full',backend:'server',cacheScope:cacheScope(req)};
      options.time=Math.max(100,Math.min(options.time,Math.floor(90000/game.fens.length)));
      const estimate=game.fens.length*options.time/1000+options.refineLimit*4*options.time/1000+(options.verifySacrifices?15:0);
      reserve(req,estimate,true);
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'});sent=true;
      send({type:'progress',phase:'queued',index:0,total:game.fens.length});
      heartbeat=setInterval(()=>send({type:'heartbeat'}),10000);
      lease=await acquire(controller.signal);
      const encode=reviewProgressEncoder();
      await reviewGame(game,lease.engine,options,{signal:controller.signal,onUpdate:progress=>send(request.streamVersion===2?encode(progress):{type:'progress',...progress})});
      game.analysis.profile=request.profile==='balanced'?'balanced':'quick';
      send({type:'game',game});res.end();
    }catch(e){if(sent){send({type:'error',message:e.name==='AbortError'?'Rozbor byl přerušen. Hotové partie zůstaly uložené.':e.message});res.end();}else json(res,e.status||400,{error:e.message});}
    finally{clearTimeout(timeout);clearInterval(heartbeat);lease?.release();}
    return true;
  }
  return {enabled,handle,session,reserve,acquire,pump,cacheScope};
}
