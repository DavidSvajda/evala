export function serverAddress(value){
  let url;try{url=new URL(value);}catch{throw new Error('Zadej platnou HTTPS adresu serveru.');}
  if(url.username||url.password||!['https:','http:'].includes(url.protocol)||(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Server musí používat HTTPS. HTTP je povoleno jen pro localhost.');
  return url.origin;
}
export class RemoteEngine{
  constructor(base,token){this.base=serverAddress(base);this.token=token;this.pending=new Set();}
  async search(request,{signal,onInfo}={}){
    const controller=new AbortController();this.pending.add(controller);
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,45000);
    if(signal?.aborted)controller.abort();
    try{
      const response=await fetch(this.base+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},body:JSON.stringify(request),signal:controller.signal});
      if(!response.ok)throw new Error(response.status===401?'Server odmítl API token.':response.status===429?'Server je vytížený. Počkej chvíli a spusť rozbor znovu.':`Server vrátil chybu ${response.status}.`);
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
      const consume=line=>{if(!line.trim())return;const message=JSON.parse(line);if(message.type==='error')throw new Error(String(message.message).slice(0,300));if(message.type==='info')onInfo?.(checkedResult(message.result));if(message.type==='done')result=checkedResult(message.result);};
      for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>2_000_000)throw new Error('Server poslal příliš velkou odpověď.');let index;while((index=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(done)break;}
      if(buffer.trim())consume(buffer);
      if(!result)throw new Error('Server ukončil spojení bez výsledku.');
      return result;
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);this.pending.delete(controller);}
  }
  dispose(){for(const controller of this.pending)controller.abort();this.pending.clear();}
}

export function checkedResult(data){
  const score=s=>{
    if(!s||!['cp','mate'].includes(s.kind)||!Number.isFinite(s.value))throw new Error('Server vrátil neplatné hodnocení.');
    const number=key=>Number.isFinite(s[key])?Math.max(0,Math.min(1e12,s[key])):0;
    return {kind:s.kind,value:Math.max(-1e7,Math.min(1e7,s.value)),depth:number('depth'),time:number('time'),nps:number('nps'),nodes:number('nodes'),multipv:number('multipv')||1,terminal:s.terminal===true,pv:Array.isArray(s.pv)?s.pv.slice(0,100).filter(m=>typeof m==='string'&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m)):[],wdl:Array.isArray(s.wdl)&&s.wdl.length===3&&s.wdl.every(Number.isFinite)?s.wdl:null};
  };
  const result=score(data);result.lines=Array.isArray(data.lines)?data.lines.slice(0,5).map(score):[];return result;
}
