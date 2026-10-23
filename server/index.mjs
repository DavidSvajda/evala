import http from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,sep,extname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chess.js';
import { StudyEngine,searchSettings } from '../src/study/uci.js';
import { validPosition } from '../src/core/position.js';
import { nodeWorker } from './worker.mjs';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.json':'application/json','.txt':'text/plain; charset=utf-8'};
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function createAnalysisServer({token=process.env.API_TOKEN||'',concurrency=Number(process.env.ENGINE_CONCURRENCY||1),origins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean),root=resolve('dist')}={}){
  const limit=Math.max(1,Math.min(4,Math.floor(concurrency)||1));
  const slots=Array.from({length:limit},()=>({engine:new StudyEngine(()=>nodeWorker()),busy:false}));
  const originsSet=new Set(origins),rates=new Map();
  const authorized=req=>!token||equal(req.headers.authorization||'','Bearer '+token);
  const json=(res,status,object)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(object));};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const origin=req.headers.origin;
    const sameOrigin=origin&&(()=>{try{return new URL(origin).host===req.headers.host;}catch{return false;}})();
    if(origin&&!sameOrigin&&!originsSet.has(origin)){json(res,403,{error:'Origin is not allowed. Configure ALLOWED_ORIGINS.'});return;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'});res.end();return;}
    let url;try{url=new URL(req.url,'http://localhost');}catch{json(res,400,{error:'Bad URL'});return;}
    if(url.pathname==='/api/health'){
      if(!authorized(req)){json(res,401,{error:'Invalid token'});return;}
      json(res,200,{ok:true,engine:'Stockfish 19 Full',slots:limit,busy:slots.filter(s=>s.busy).length});return;
    }
    if(url.pathname==='/api/analyze'){
      if(req.method!=='POST'){json(res,405,{error:'Use POST'});return;}
      if(!authorized(req)){json(res,401,{error:'Invalid token'});return;}
      const now=Date.now(),ip=req.socket.remoteAddress;
      const rate=rates.get(ip)||{start:now,count:0};
      if(now-rate.start>60000){rate.start=now;rate.count=0;}
      if(++rate.count>300){json(res,429,{error:'Too many requests'});return;}
      rates.set(ip,rate);if(rates.size>1000)for(const [key,value] of rates)if(now-value.start>60000)rates.delete(key);
      const slot=slots.find(s=>!s.busy);
      if(!slot){res.setHeader('Retry-After','2');json(res,429,{error:'All engines are busy. Retry shortly.'});return;}
      slot.busy=true;
      const controller=new AbortController();
      let body='',sent=false;
      const timeout=setTimeout(()=>controller.abort(),30000);
      const send=data=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(data)+'\n');};
      res.on('close',()=>{if(!res.writableFinished)controller.abort();});
      try{
        for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)throw new Error('Request exceeds 64 KB');}
        const request=JSON.parse(body);
        if(!validPosition(request.fen))throw new Error('Invalid FEN');
        if(request.history){
          const {initialFen,moves}=request.history;
          if(!validPosition(initialFen)||!Array.isArray(moves)||moves.length>600)throw new Error('Invalid history');
          const chess=new Chess(initialFen);
          for(const uci of moves){if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error('Invalid UCI move');chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});}
          if(chess.fen()!==new Chess(request.fen).fen())throw new Error('History does not match FEN');
        }
        const opts=searchSettings(request.settings);
        request.settings={...opts,time:Math.min(opts.time,5000),hash:Math.min(opts.hash,128),depth:Math.min(opts.depth,28),engine:'full'};
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});sent=true;
        let last=0;
        const result=await slot.engine.search(request,{signal:controller.signal,onInfo:info=>{if(Date.now()-last>100){last=Date.now();send({type:'info',result:info});}}});
        send({type:'done',result});res.end();
      }catch(error){
        if(sent){send({type:'error',message:error.name==='AbortError'?'Výpočet byl zrušen.':error.message});res.end();}
        else if(!res.destroyed)json(res,400,{error:error.message});
      }finally{clearTimeout(timeout);slot.busy=false;}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return;}
    try{
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/study.html':url.pathname));
      if(!path.startsWith(root+sep)||(await stat(path)).isDirectory()){json(res,404,{error:'Not found'});return;}
      let data=await readFile(path);
      if(path.endsWith(sep+'study.html'))data=Buffer.from(data.toString('utf8').replace('</head>','<meta name="evala-backend" content="server"></head>'));
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'none'",'Cache-Control':path.endsWith('.wasm')?'public, max-age=86400':'no-cache'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch{json(res,404,{error:'Not found'});}
  });
  server.requestTimeout=35000;server.headersTimeout=10000;
  server.on('close',()=>slots.forEach(s=>s.engine.dispose()));
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8080);
  if(!['127.0.0.1','localhost','::1'].includes(host)&&!process.env.API_TOKEN)throw new Error('Set API_TOKEN before binding a public interface.');
  const server=createAnalysisServer();server.listen(port,host,()=>console.log(`Evala server listening on ${host}:${port}. Engine: Stockfish 19 Full.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
