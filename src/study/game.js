import { Chess } from 'chess.js';
import { validPosition } from '../core/position.js';

export const DEMO_PGN = `[Event "Ukázková partie"]
[White "Bílý"]
[Black "Černý"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

function fingerprint(text) {
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h,16777619); }
  return (h >>> 0).toString(16);
}

export function parsePgn(pgn) {
  if (typeof pgn !== 'string' || pgn.length > 2_000_000) throw new Error('PGN je prázdné nebo větší než 2 MB. Rozděl soubor na menší části.');
  const chess = new Chess();
  try { chess.loadPgn(pgn); } catch { throw new Error('PGN obsahuje neplatný tah nebo zápis. Zkus původní export PGN z webu.'); }
  const headers = chess.getHeaders();
  if (headers.Variant && !/^(standard|chess)$/i.test(headers.Variant)) throw new Error('Podporujeme standardní šachy. Tato partie používá jinou variantu.');
  const history = chess.history({verbose:true});
  if (!history.length) throw new Error('V PGN nejsou žádné tahy.');
  if (history.length > 600) throw new Error('Limit je 600 půltahů na partii.');
  const initialFen = history[0].before;
  if (!validPosition(initialFen)) throw new Error('Neplatná výchozí pozice partie.');
  const moves = history.map(m=>({san:m.san,uci:m.from+m.to+(m.promotion||''),color:m.color,from:m.from,to:m.to,piece:m.piece,captured:m.captured||null,promotion:m.promotion||null,fenBefore:m.before,fenAfter:m.after}));
  const canonical = initialFen+'|'+moves.map(m=>m.uci).join(' ');
  return {id:fingerprint(canonical),pgn:chess.pgn(),headers,initialFen,moves,fens:[initialFen,...moves.map(m=>m.fenAfter)],createdAt:Date.now(),analysis:null};
}

export function parsePgnCollection(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) throw new Error('Soubor je větší než 2 MB. Importuj menší výběr partií.');
  const parts = text.replace(/^\uFEFF/,'').trim().split(/(?=^\[Event\s)/m).filter(s=>s.trim());
  if(parts.length>100)throw new Error('Importuj nejvýše 100 partií najednou.');
  const games=[],errors=[];
  for(const [i,part] of parts.entries()) {
    try{ games.push(parsePgn(part)); }catch(error){errors.push(`Partie ${i+1}: ${error.message}`);}
  }
  if(!games.length)throw new Error(errors[0]||'Vlož PGN nebo vyber soubor s partií.');
  return {games,errors};
}

export function lineToSan(fen, pv, limit=12) {
  const chess=new Chess(fen),result=[];
  for(const uci of pv.slice(0,limit)) {
    try{
      const number=chess.moveNumber(),turn=chess.turn();
      const move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});
      result.push(`${turn==='w'?number+'.':result.length===0?number+'…':''}${move.san}`);
    }catch{break;}
  }
  return result.join(' ');
}

export function annotatedPgn(game) {
  const chess=new Chess(game.initialFen);
  Object.entries(game.headers).forEach(([k,v])=>chess.setHeader(k,v));
  chess.setHeader('Annotator','Evala / Stockfish 19');
  for(const [i,move] of game.moves.entries()) {
    chess.move(move.san);
    const result=game.analysis?.positions?.[i+1],mark=game.analysis?.moves?.[i];
    if(!result)continue;
    const value=result.kind==='mate'?`#${result.value}`:(result.value/100).toFixed(2);
    const before=game.analysis.positions[i];
    const best=before?.lines?.[0]?.pv;
    chess.setComment(`[%eval ${value}] ${mark?.label||''}${mark?.note?' '+mark.note:''}${best?.length?' | Engine: '+lineToSan(move.fenBefore,best,8):''}`.replace(/[{}]/g,''));
  }
  return chess.pgn({maxWidth:90});
}
