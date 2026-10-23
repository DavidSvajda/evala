import { Chess } from 'chess.js';
const names={p:'pěšec',n:'jezdec',b:'střelec',r:'věž',q:'dáma',k:'král'};
export class StudyBoard{
  constructor(element,{onMove,onLineMove}={}){
    this.element=element;this.onMove=onMove;this.flipped=false;this.selected=null;
    element.setAttribute('role','group');element.setAttribute('aria-label','Interaktivní analytická šachovnice');
    this.grid=document.createElement('div');this.grid.className='square-grid';element.append(this.grid);
    this.arrows=document.createElementNS('http://www.w3.org/2000/svg','svg');this.arrows.setAttribute('viewBox','0 0 800 800');this.arrows.classList.add('board-arrows');this.arrows.setAttribute('aria-hidden','true');element.append(this.arrows);
    this.grid.addEventListener('click',event=>{const button=event.target.closest('[data-square]');if(button)this.click(button.dataset.square);});
  }
  set(fen,{lastMove=null,arrow=null,mark=null,flipped=this.flipped}={}){
    this.chess=new Chess(fen);this.flipped=flipped;this.lastMove=lastMove;this.arrow=arrow;this.mark=mark;this.selected=null;this.paint();
  }
  paint(){
    const legal=this.selected?this.chess.moves({square:this.selected,verbose:true}):[];
    const fragment=document.createDocumentFragment();
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const file=this.flipped?7-x:x,rank=this.flipped?y:7-y,square='abcdefgh'[file]+(rank+1),piece=this.chess.get(square);
      const button=document.createElement('button');button.type='button';button.dataset.square=square;
      button.className='square '+((file+rank)%2?'light':'dark');
      if(this.lastMove&&(this.lastMove.from===square||this.lastMove.to===square))button.classList.add('last-move');
      if(this.selected===square)button.classList.add('selected');
      if(legal.some(m=>m.to===square))button.classList.add(piece?'legal-capture':'legal');
      button.setAttribute('aria-label',`${square}${piece?' '+(piece.color==='w'?'bílý ':'černý ')+names[piece.type]:''}`);
      if(piece){const image=document.createElement('img');image.src=`pieces/${piece.color}${piece.type.toUpperCase()}.svg`;image.alt='';image.draggable=false;button.append(image);}
      if(this.mark&&this.lastMove?.to===square){
        const badge=document.createElement('span');badge.className='board-mark '+this.mark.kind;
        badge.textContent=this.mark.symbol||'✓';badge.title=this.mark.label;badge.setAttribute('aria-label',this.mark.label);
        button.append(badge);button.classList.add('marked-square');button.setAttribute('aria-label',button.getAttribute('aria-label')+' · '+this.mark.label);
      }
      if(y===7){const label=document.createElement('span');label.className='file-label';label.textContent=square[0];button.append(label);}
      if(x===7){const label=document.createElement('span');label.className='rank-label';label.textContent=square[1];button.append(label);}
      fragment.append(button);
    }
    const focused=this.grid.contains(document.activeElement)?document.activeElement.dataset.square:null;
    this.grid.replaceChildren(fragment);this.paintArrow();
    if(focused)this.grid.querySelector(`[data-square="${focused}"]`)?.focus({preventScroll:true});
  }
  coords(square){let x='abcdefgh'.indexOf(square[0]),y=8-Number(square[1]);if(this.flipped){x=7-x;y=7-y;}return [x*100+50,y*100+50];}
  paintArrow(){
    this.arrows.replaceChildren();if(!this.arrow||!this.arrow.match(/^[a-h][1-8][a-h][1-8]/))return;
    const [x1,y1]=this.coords(this.arrow.slice(0,2)),[x2,y2]=this.coords(this.arrow.slice(2,4));
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;
    const line=document.createElementNS(this.arrows.namespaceURI,'path');
    line.setAttribute('d',`M${x1},${y1}L${x2-ux*20},${y2-uy*20}M${x2-ux*40-uy*20},${y2-uy*40+ux*20}L${x2},${y2}L${x2-ux*40+uy*20},${y2-uy*40-ux*20}`);
    line.setAttribute('fill','none');line.setAttribute('stroke','#c17b20');line.setAttribute('stroke-width','16');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');line.setAttribute('opacity','.84');this.arrows.append(line);
  }
  click(square){
    if(this.selected){
      const legal=this.chess.moves({square:this.selected,verbose:true}).filter(m=>m.to===square);
      if(legal.length){this.onMove?.({from:this.selected,to:square,promotions:legal.map(m=>m.promotion).filter(Boolean)});this.selected=null;return;}
    }
    const piece=this.chess.get(square);
    this.selected=piece?.color===this.chess.turn()?square:null;this.paint();
  }
}
