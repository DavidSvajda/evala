import { Chess } from 'chess.js';

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

/**
 * Detects the most dangerous direct opponent threat in the position.
 * Simulates a null-move (if the opponent could move immediately) to expose tactical threats.
 */
export function detectThreats(fen, { lang = 'cs' } = {}) {
  let baseChess;
  try { baseChess=new Chess(fen); } catch { return null; }
  // A free-move probe is meaningless when a check must be answered or play has ended.
  if(baseChess.isCheck()||baseChess.isGameOver())return null;
  const tokens=fen.split(' '),currentTurn=tokens[1],opponentTurn=currentTurn==='w'?'b':'w';
  tokens[1]=opponentTurn;tokens[3]='-';
  let opponentChess;
  try { opponentChess=new Chess(tokens.join(' ')); } catch { return null; }
  const moves = opponentChess.moves({ verbose: true });
  const threats = [];


  for (const m of moves) {
    // 1. Checkmate in 1
    if (m.san.includes('#')) {
      threats.push({
        severity: 100,
        type: 'mate',
        from: m.from,
        to: m.to,
        uci: m.from + m.to + (m.promotion || ''),
        san: m.san,
        desc: lang === 'en'
          ? `Immediate checkmate threat with ${m.san}!`
          : `Okamžitá hrozba matu tahem ${m.san}!`
      });
      continue;
    }

    // 2. Capturing an undefended piece or high value piece
    if (m.captured) {
      const victimSquare = m.to;
      const victimValue = PIECE_VALUES[m.captured] || 100;
      const isDefended = baseChess.isAttacked(victimSquare, currentTurn);

      if (!isDefended) {
        // Free piece hanging
        threats.push({
          severity: 50 + victimValue / 20,
          type: 'hanging',
          from: m.from,
          to: m.to,
          uci: m.from + m.to + (m.promotion || ''),
          san: m.san,
          desc: lang === 'en'
            ? `If given another move, the opponent can capture on ${victimSquare}: ${m.san}.`
            : `Soupeř může příštím tahem sebrat nekrytou figuru na ${victimSquare}: ${m.san}.`
        });
      }
    }

    // 3. Fork threat
    if (['n', 'p', 'b', 'q'].includes(m.piece) && !m.captured) {
      // simulate opponent move and see if it attacks 2 high value pieces
      opponentChess.move(m);
      const attackedPieces = [];
      for (const [fileIndex, file] of [...'abcdefgh'].entries()) {
        for (let rank = 1; rank <= 8; rank++) {
          const sq = file + rank;
          const piece = baseChess.get(sq);
          if (piece && piece.color === currentTurn && opponentChess.attackers(sq, opponentTurn).includes(m.to)) {
            attackedPieces.push({ sq, piece: piece.type });
          }
        }
      }
      opponentChess.undo();

      if (attackedPieces.filter(p => PIECE_VALUES[p.piece] >= 300).length >= 2) {
        threats.push({
          severity: 35,
          type: 'fork',
          from: m.from,
          to: m.to,
          uci: m.from + m.to + (m.promotion || ''),
          san: m.san,
          desc: lang === 'en'
            ? `Tactical fork threat with ${m.san} attacking multiple pieces`
            : `Taktická vidlička tahem ${m.san} s napadením více figur`
        });
      }
    }
  }

  threats.sort((a, b) => b.severity - a.severity);
  return threats[0] || null;
}

/**
 * Evaluates the psychological and practical sharpness/complexity of the position.
 * Distinguishes razor-sharp "only-move" positions from flexible, forgiving positions.
 */
export function assessSharpness(lines = [], { lang = 'cs' } = {}) {
  const en=lang==='en',normal={type:'normal',label:'',detail:''};
  if(lines.length<2||lines.slice(0,2).some(line=>!Number.isFinite(line.value)||(line.depth||0)<12))return normal;
  const [first,second]=lines;
  if(first.kind==='mate'||second.kind==='mate')return normal;
  const gap=Math.abs(first.value-second.value);
  return gap>=180
    ? {type:'sharp',label:en?'Large gap between candidates':'Velký rozdíl mezi variantami',detail:en?'The first engine line scores substantially better than the second. This is not a measure of human difficulty.':'První varianta enginu vychází výrazně lépe než druhá. Nejde o měření obtížnosti pro člověka.'}
    : gap<=30
      ? {type:'calm',label:en?'Similar candidate evaluations':'Podobné hodnocení variant',detail:en?'The two engine lines differ by at most 0.30 pawns.':'První dvě varianty se liší nejvýše o 0,30 pěšce.'}
      : {type:'dynamic',label:en?'Compare the candidates':'Porovnej varianty',detail:en?'The engine finds a difference between the candidate moves.':'Engine našel rozdíl mezi možnými pokračováními.'};
}

/**
 * Calculates Silman-inspired positional imbalances:
 * Material balance, Bishop pair, King safety, Passed pawns, Pawn structure.
 */
export function analyzeImbalances(fen, { lang = 'cs' } = {}) {
  const chess = new Chess(fen);
  const board = chess.board();
  const imbalances = [];

  let whiteBishops = 0, blackBishops = 0;
  let whiteKnights = 0, blackKnights = 0;
  let whiteRooks = 0, blackRooks = 0;
  let whiteQueen = 0, blackQueen = 0;
  let whitePawns = 0, blackPawns = 0;

  for (const row of board) {
    for (const square of row) {
      if (!square) continue;
      if (square.color === 'w') {
        if (square.type === 'b') whiteBishops++;
        if (square.type === 'n') whiteKnights++;
        if (square.type === 'r') whiteRooks++;
        if (square.type === 'q') whiteQueen++;
        if (square.type === 'p') whitePawns++;
      } else {
        if (square.type === 'b') blackBishops++;
        if (square.type === 'n') blackKnights++;
        if (square.type === 'r') blackRooks++;
        if (square.type === 'q') blackQueen++;
        if (square.type === 'p') blackPawns++;
      }
    }
  }

  // 1. Bishop pair advantage
  if (whiteBishops >= 2 && blackBishops < 2) {
    imbalances.push(lang === 'en' ? 'White holds the bishop pair' : 'Bílý má výhodu dvojice střelců');
  } else if (blackBishops >= 2 && whiteBishops < 2) {
    imbalances.push(lang === 'en' ? 'Black holds the bishop pair' : 'Černý má výhodu dvojice střelců');
  }

  // 2. Minor piece exchange imbalance
  if (whiteBishops > blackBishops && whiteKnights < blackKnights) {
    imbalances.push(lang === 'en' ? 'Bishop vs Knight dynamic' : 'Souboj střelce proti jezdci');
  }

  // 3. Passed pawns
  for (const [fileIndex, file] of [...'abcdefgh'].entries()) {
    for (let rank = 2; rank <= 7; rank++) {
      const piece = chess.get(file + rank);
      if (!piece || piece.type !== 'p') continue;

      // check if passed
      const color = piece.color;
      const forwardRanks = color === 'w' ? [rank + 1, 8] : [1, rank - 1];
      const adjacentFiles = ['abcdefgh'[fileIndex - 1], file, 'abcdefgh'[fileIndex + 1]].filter(Boolean);

      let isPassed = true;
      for (const f of adjacentFiles) {
        for (let r = Math.min(...forwardRanks); r <= Math.max(...forwardRanks); r++) {
          const oppPawn = chess.get(f + r);
          if (oppPawn && oppPawn.type === 'p' && oppPawn.color !== color) {
            isPassed = false;
            break;
          }
        }
        if (!isPassed) break;
      }

      if (isPassed && ((color === 'w' && rank >= 5) || (color === 'b' && rank <= 4))) {
        imbalances.push(
          lang === 'en'
            ? `Dangerous passed pawn on ${file}${rank}`
            : `Nebezpečný volný pěšec na ${file}${rank}`
        );
      }
    }
  }

  return imbalances.slice(0, 3);
}

/**
 * Explains only the move evidence supplied by the engine.
 * Explains root strategic reasons (loose piece, pawn weakness, tempo loss, king safety).
 */
export function generateGmAdvice(move, mark, fenBefore, fenAfter, { lang = 'cs', bestSan = '', before, after } = {}) {
  const en=lang==='en';
  if(!mark)return en?'Analyse this move to compare the continuations.':'Spusť rozbor a porovnej pokračování.';
  if(mark.kind==='brilliant')return en
    ? `${move.san}: the engine verified compensation after accepting the material sacrifice.`
    : `${move.san}: engine ověřil kompenzaci po přijetí oběti materiálu.`;
  if(mark.kind==='great')return en
    ? `${move.san} scores substantially better than the second engine candidate.`
    : `${move.san} vychází výrazně lépe než druhá varianta enginu.`;
  if(mark.kind==='best')return en?`${move.san} matches the engine’s first choice.`:`${move.san} odpovídá první volbě enginu.`;
  const sign=move.color==='w'?1:-1;
  if(before?.kind==='mate'&&before.value*sign>0&&!(after?.kind==='mate'&&after.value*sign>0))return en
    ? `The move missed a forced mate.${bestSan?' Compare '+bestSan+'.':''}`
    : `Tah minul vynucený mat.${bestSan?' Porovnej pokračování '+bestSan+'.':''}`;
  const loss=Number.isFinite(mark.loss)?Math.round(mark.loss):null;
  if(['blunder','mistake','inaccuracy','miss'].includes(mark.kind))return en
    ? `${move.san} reduced the position’s engine score.${bestSan?' Compare '+bestSan+'.':''}${loss!==null?' Expected-score loss: '+loss+' percentage points.':''}`
    : `${move.san} zhoršil hodnocení pozice.${bestSan?' Porovnej pokračování '+bestSan+'.':''}${loss!==null?' Ztráta očekávaného skóre: '+loss+' procentních bodů.':''}`;
  return en?`${move.san} keeps most of the position’s engine evaluation.`:`${move.san} zachovává většinu hodnocení pozice.`;
}

/**
 * Text-to-speech grandmaster debrief.
 * Uses browser's native window.speechSynthesis without external latency or cost.
 */
export function speakGmVoice(text, { lang = 'cs' } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === 'en' ? 'en-US' : 'cs-CZ';
  utterance.rate = 1.05;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}
