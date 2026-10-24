import { account, accountRequest } from './account.js';
let opening;
let owner='guest';
const saves=new Map();
export let lastSyncStatus={message:'',error:false};
export function setStorageIdentity(user){owner=user?.id||'guest';opening=null;}
function database(){
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open(owner==='guest'?'evala-study':'evala-study-'+owner,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('games',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Prohlížeč nepovolil lokální knihovnu. Zkontroluj nastavení úložiště.'));
  });
  return opening;
}
async function localGames(db){return new Promise((resolve,reject)=>{const tx=db.transaction('games'),r=tx.objectStore('games').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function localSave(db,game){return new Promise((resolve,reject)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').put(game);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('Partii se nepodařilo uložit. Exportuj PGN a uvolni místo v prohlížeči.'));});}
const syncStatus=(message,error=false)=>{lastSyncStatus={message,error};document.dispatchEvent(new CustomEvent('evala:sync',{detail:lastSyncStatus}));};
export async function loadLibrary(){
  const active=owner,db=await database(),local=await localGames(db);
  if(account.user&&active===account.user.id){
    try{
      const {games:remote}=await accountRequest('library');
      const byId=new Map(local.map(g=>[g.id,g]));
      for(const item of remote){
        const saved=byId.get(item.id);
        if(saved?._syncPending)continue;
        if(!saved||saved._remoteVersion!==item.version){const {game}=await accountRequest('library/'+item.id);game._storageOwner=active;await localSave(db,game);byId.set(item.id,game);}
      }
      const remoteIds=new Set(remote.map(g=>g.id));
      for(const saved of local)if(!remoteIds.has(saved.id)&&saved._remoteVersion&&!saved._syncPending){await new Promise((resolve,reject)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(saved.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});byId.delete(saved.id);}
      syncStatus('Synchronizováno');return [...byId.values()].sort((a,b)=>b.createdAt-a.createdAt);
    }catch(error){syncStatus(error.message,true);}
  }
  return local.map(g=>({...g,_storageOwner:active})).sort((a,b)=>b.createdAt-a.createdAt);
}
export async function saveGame(game){
  const active=owner;if(game._storageOwner&&game._storageOwner!==active)return;
  game._storageOwner=active;
  const db=await database();game._syncPending=active!=='guest';await localSave(db,game);
  if(!account.user||active!==account.user.id||game.analysis&&!game.analysis.complete)return;
  const key=active+':'+game.id,previous=saves.get(key)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
    if(owner!==active||account.user?.id!==active)return;
    try{const {version}=await accountRequest('library/'+game.id,{method:'PUT',body:game});game._remoteVersion=version;game._syncPending=false;await localSave(db,game);syncStatus('Synchronizováno');}
    catch(error){syncStatus(error.message,true);}
  });saves.set(key,task);await task;if(saves.get(key)===task)saves.delete(key);
}
export async function removeGame(id){const db=await database();if(account.user)await accountRequest('library/'+id,{method:'DELETE'});return new Promise((resolve,reject)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function migrateGuestGames(){
  if(!account.user)return 0;
  const request=indexedDB.open('evala-study',1),db=await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>request.result.createObjectStore('games',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const games=await localGames(db);db.close();const existing=new Set((await accountRequest('library')).games.map(g=>g.id));let count=0;
  for(const game of games){if(existing.has(game.id))continue;delete game._remoteVersion;delete game._storageOwner;await saveGame(game);if(game._syncPending)throw new Error(lastSyncStatus.message||'Partie čekají na synchronizaci. Zkontroluj připojení a zkus to znovu.');count++;}return count;
}

export const STUDY_DEFAULTS={engine:'full',depth:18,time:750,multipv:3,hash:64,profile:'balanced',arrows:true,backend:'local',serverUrl:''};
export function getPreferences(defaults={}){try{return {...STUDY_DEFAULTS,...defaults,...JSON.parse(localStorage.getItem('evala-study-options')||'{}')};}catch{return {...STUDY_DEFAULTS,...defaults};}}
export function savePreferences(settings){const {token,...safe}=settings;localStorage.setItem('evala-study-options',JSON.stringify(safe));}
