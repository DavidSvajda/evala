import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export function nodeWorker({enginePath=process.env.STOCKFISH_PATH}={}){
  const child=enginePath?spawn(enginePath,[],{stdio:['pipe','pipe','pipe'],windowsHide:true}):spawn(process.execPath,[resolve('node_modules/stockfish/bin/stockfish-19-single.js')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let buffer='',stopped=false,configured=false;
  const threads=Math.max(1,Math.min(16,Math.floor(Number(process.env.ENGINE_THREADS))||1));
  const worker={onmessage:null,onerror:null,postMessage:command=>{if(!stopped){if(enginePath&&!configured&&command==='isready'){configured=true;child.stdin.write(`setoption name Threads value ${threads}\n`);}child.stdin.write(command+'\n');}},terminate:()=>{stopped=true;child.kill();}};
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);worker.onmessage?.({data:line});}});
  child.on('error',error=>worker.onerror?.({message:error.message}));
  child.on('exit',code=>{if(!stopped)worker.onerror?.({message:`Proces enginu skončil (${code}).`});});
  child.stdin.on('error',()=>{});
  return worker;
}
