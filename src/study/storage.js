let opening;
function database(){
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open('evala-study',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('games',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Prohlížeč nepovolil lokální knihovnu. Zkontroluj nastavení úložiště.'));
  });
  return opening;
}
export async function loadLibrary(){const db=await database();return await new Promise((resolve,reject)=>{const tx=db.transaction('games'),r=tx.objectStore('games').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.createdAt-a.createdAt));r.onerror=()=>reject(r.error);});}
export async function saveGame(game){const db=await database();return await new Promise((resolve,reject)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').put(game);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Partii se nepodařilo uložit. Exportuj PGN a uvolni místo v prohlížeči.'));});}
export async function removeGame(id){const db=await database();return await new Promise((resolve,reject)=>{const tx=db.transaction('games','readwrite');tx.objectStore('games').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

export const STUDY_DEFAULTS={engine:'full',depth:18,time:750,multipv:3,hash:64,profile:'balanced',arrows:true,backend:'local',serverUrl:''};
export function getPreferences(defaults={}){try{return {...STUDY_DEFAULTS,...defaults,...JSON.parse(localStorage.getItem('evala-study-options')||'{}')};}catch{return {...STUDY_DEFAULTS,...defaults};}}
export function savePreferences(settings){const {token,...safe}=settings;localStorage.setItem('evala-study-options',JSON.stringify(safe));}
