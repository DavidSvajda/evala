import { importUsername } from './import.js';
import { parsePgnCollection } from './game.js';
import { remoteReview,connectPublicServer } from './remote.js';
import { reviewGame } from './review.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PlayerReport{
  constructor({library,addPgn,save,engine,settings,onChange,onPlayer,onOpen}){
    Object.assign(this,{library,addPgn,save,engine,settings,onChange,onPlayer,onOpen});this.games=[];this.checked=new Set();this.running=false;this.controller=null;
    $('#report-form').addEventListener('submit',event=>{event.preventDefault();this.load();});
    $('#report-analyze').addEventListener('click',()=>this.run());
    $('#report-cancel').addEventListener('click',()=>this.controller?.abort());
    $('#report-all').addEventListener('change',event=>{this.checked=new Set(event.target.checked?this.games.map(g=>g.id):[]);this.render();this.onChange();});
    $('#report-share').addEventListener('click',async()=>{
      const url=new URL(location.href);url.search='';url.hash='';
      try{await navigator.clipboard.writeText(url.href);$('#report-share-status').textContent='Odkaz zkopírován.';}
      catch{$('#report-share-status').textContent=url.href;}
    });
    $('#report-edit').addEventListener('click',()=>{$('.player-setup').classList.remove('report-complete');$('#report-complete-bar').hidden=true;$('#report-selection-details').open=true;});
  }
  restore(ids){
    this.games=this.library().filter(g=>ids?.includes(g.id));this.checked=new Set(this.games.map(g=>g.id));
    if(this.games.length){this.render();if(this.games.every(g=>g.analysis?.complete))this.compact();}
  }
  compact(){
    $('#report-complete-summary').textContent=`${$('#report-username').value} · ${this.checked.size} vybraných partií`;
    $('.player-setup').classList.add('report-complete');$('#report-complete-bar').hidden=false;
  }
  async load(){
    if(this.running)return;const controller=new AbortController();this.controller=controller;
    $('.player-setup').classList.remove('report-complete');$('#report-complete-bar').hidden=true;
    $('#load-report').disabled=true;$('#report-status').textContent='Načítám dokončené partie…';
    try{
      const username=$('#report-username').value.trim(),platform=$('#report-platform').value,limit=Number($('#report-count').value);
      const pgn=await importUsername(username,platform,{limit,signal:controller.signal,onProgress:text=>$('#report-status').textContent=text});
      const {games}=parsePgnCollection(pgn);await this.addPgn(pgn);
      this.games=games.map(g=>this.library().find(saved=>saved.id===g.id)).filter(Boolean);this.checked=new Set(this.games.map(g=>g.id));
      this.onPlayer(username,platform);this.render();
      $('#report-status').textContent=`Načteno ${this.games.length} z ${limit} požadovaných partií. Vyber, které chceš rozebrat.`;
    }catch(e){$('#report-status').textContent=e.name==='AbortError'?'Načítání zrušeno.':e.message;}
    finally{$('#load-report').disabled=false;this.controller=null;}
  }
  render(){
    $('#report-selection').hidden=!this.games.length;
    $('#report-game-list').innerHTML=this.games.map(game=>`<label class="report-game"><input type="checkbox" data-game="${game.id}" ${this.checked.has(game.id)?'checked':''} ${this.running?'disabled':''}><span><strong>${esc(game.headers.White)} <span>—</span> ${esc(game.headers.Black)}</strong><small>${esc(game.headers.Result)} · ${Math.ceil(game.moves.length/2)} tahů · ${esc(game.headers.Date||'')}</small></span><button type="button" class="text-button" data-open="${game.id}">${game.analysis?.complete?'Rozebráno':'Otevřít'}</button></label>`).join('');
    $('#report-all').disabled=this.running;
    $('#report-game-list').querySelectorAll('[data-game]').forEach(input=>input.onchange=()=>{input.checked?this.checked.add(input.dataset.game):this.checked.delete(input.dataset.game);this.updateCount();this.onChange();});
    $('#report-game-list').querySelectorAll('[data-open]').forEach(button=>button.onclick=()=>this.onOpen(this.library().find(g=>g.id===button.dataset.open)));
    this.updateCount();
  }
  updateCount(){
    $('#report-selected').textContent=`${this.checked.size} / ${this.games.length} vybráno`;
    $('#report-all').checked=!!this.games.length&&this.checked.size===this.games.length;$('#report-all').indeterminate=this.checked.size>0&&this.checked.size<this.games.length;
    $('#report-analyze').textContent=`Rozebrat vybrané (${this.checked.size})`;$('#report-analyze').disabled=this.running||!this.checked.size;
    const pending=this.games.filter(g=>this.checked.has(g.id)&&!g.analysis?.complete),profile=$('#report-profile').value;
    const seconds=Math.ceil(pending.reduce((n,g)=>n+g.fens.length,0)*(profile==='balanced'?.5:.15)*1.4);
    $('#report-estimate').textContent=pending.length?`${pending.length} partií bez hotového rozboru · odhad ${seconds<60?seconds+' s':Math.ceil(seconds/60)+' min'} + fronta. Během rozboru nech kartu otevřenou.`:'Hotové rozbory se použijí z knihovny.';
  }
  async run(){
    if(this.running)return;const games=this.games.filter(g=>this.checked.has(g.id));if(!games.length)return;
    const controller=new AbortController();this.controller=controller;this.running=true;this.onChange();this.render();
    $('#report-form').querySelectorAll('input,select').forEach(el=>el.disabled=true);
    $('#report-progress').hidden=false;$('#report-cancel').hidden=false;$('#load-report').disabled=true;
    let completed=0;
    try{
      const settings=this.settings(),profile=$('#report-profile').value;
      if(settings.publicServer)await connectPublicServer(settings.serverUrl,{signal:controller.signal});
      for(const game of games){
        if(controller.signal.aborted)throw new DOMException('Zrušeno','AbortError');
        const update=({phase,index,total})=>{
          const fraction=phase==='positions'?index/total*.85:phase==='queued'?0:phase==='done'?1:.9;
          $('#report-meter').value=(completed+fraction)/games.length*100;
          $('#report-progress-text').textContent=`Partie ${completed+1}/${games.length} · ${phase==='queued'?'čeká ve frontě':phase==='positions'?`pozice ${index}/${total}`:phase==='done'?'ukládám':'ověřuji kritické tahy'}`;
        };
        if(!game.analysis?.complete){
          if(settings.backend==='server')await remoteReview(settings.serverUrl,settings.token,game,{profile,signal:controller.signal,onUpdate:update});
          else await reviewGame(game,this.engine(),{...settings,time:profile==='balanced'?500:150,depth:profile==='balanced'?20:16,multipv:profile==='balanced'?3:2,refineLimit:profile==='balanced'?4:2,verifySacrifices:profile==='balanced'},{signal:controller.signal,onUpdate:update});
          await this.save(game);
        }
        completed++;$('#report-meter').value=completed/games.length*100;this.onChange();
      }
      $('#report-progress-text').textContent=`Hotovo · ${completed} partií v přehledu.`;$('#report-status').textContent='Rozbor uložen. Níže najdeš priority a konkrétní pozice.';
      $('#report-selection-details').open=false;
      this.compact();
    }catch(e){$('#report-progress-text').textContent=e.name==='AbortError'?`Pozastaveno · ${completed}/${games.length} hotovo. Dokončené rozbory jsou uložené.`:e.message;}
    finally{this.running=false;this.controller=null;$('#report-cancel').hidden=true;$('#load-report').disabled=false;$('#report-form').querySelectorAll('input,select').forEach(el=>el.disabled=false);this.render();this.onChange();}
  }
}
