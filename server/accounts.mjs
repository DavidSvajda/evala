import { createHash, randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createDocumentStore } from './document-store.mjs';
import { parsePgn } from '../src/study/game.js';
import { classifyMove,normalizeReview } from '../src/study/review.js';
import { cleanLearning } from '../src/training/practice.js';
import { checkedResult } from '../src/study/remote.js';
import { choosePuzzle, startPuzzle, playPuzzle, recordPuzzle, trainingState,personalPuzzles } from '../src/training/logic.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const equal = (a, b) => {if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const cookie = (req, name) => String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
const publicUser = a => ({ id: a.id, name: a.name, email: a.email, preferences: a.preferences, createdAt: a.createdAt });
function preferences(input = {}) {
  const p = {};
  for (const [key, options] of Object.entries({ boardTheme: ['sage', 'walnut', 'blue', 'slate'], pieceStyle: ['classic', 'letters'], skill: ['beginner', 'club', 'advanced'], difficulty: ['easy', 'normal', 'hard'],language:['cs','en'] })) if (options.includes(input[key])) p[key] = input[key];
  for (const key of ['coordinates', 'legalMoves', 'sound', 'autoNext','sidebarCollapsed','onboardingComplete']) if (typeof input[key] === 'boolean') p[key] = input[key];
  if(['tactics','review','balanced'].includes(input.trainingGoal))p.trainingGoal=input.trainingGoal;
  if(Number.isInteger(input.reviewBudget)&&input.reviewBudget>=1&&input.reviewBudget<=50)p.reviewBudget=input.reviewBudget;
  if(Number.isFinite(input.reviewPausedUntil))p.reviewPausedUntil=Math.max(0,Math.min(Date.now()+30*86400000,input.reviewPausedUntil));
  if(input.lesson&&/^\d{4}-\d{2}-\d{2}$/.test(input.lesson.day)&&Array.isArray(input.lesson.ids)&&input.lesson.ids.length<=6&&input.lesson.ids.every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id))){p.lesson={day:input.lesson.day,ids:input.lesson.ids,done:Array.isArray(input.lesson.done)?input.lesson.done.filter(id=>input.lesson.ids.includes(id)).slice(0,6):[]};}
  if (typeof input.chessUsername === 'string' && /^[A-Za-z0-9_-]{0,40}$/.test(input.chessUsername)) p.chessUsername = input.chessUsername;
  if (['chesscom', 'lichess'].includes(input.chessPlatform)) p.chessPlatform = input.chessPlatform;
  return p;
}
export function createAccounts({ store = createDocumentStore(), googleClientId = process.env.GOOGLE_CLIENT_ID || '', puzzlePath = 'public/data/puzzles.json', verifyGoogle = async token => (await jwtVerify(token, googleKeys, { audience: googleClientId, issuer: ['https://accounts.google.com', 'accounts.google.com'], algorithms: ['RS256'] })).payload } = {}) {
  let bank;
  const puzzles = () => bank ||= readFile(puzzlePath, 'utf8').then(text => JSON.parse(text).puzzles);
  const rates = new Map();
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const setCookie = (req, res, name, value, maxAge) => {
    const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto']).split(',')[0] === 'https';
    res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  };
  const enabled = req => store.durable || /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
  async function body(req, limit = 2_500_000) {
    if (!String(req.headers['content-type']).startsWith('application/json')) throw fail('Požadavek musí být JSON.', 415);
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw fail('Požadavek je příliš velký.', 413); chunks.push(chunk); }
    try { const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value; } catch { throw fail('Neplatný požadavek.'); }
  }
  async function session(req) {
    const value = cookie(req, 'evala_account'); if (!/^[a-f0-9]{64}$/.test(value || '')) return null;
    const { value: s } = await store.get('session:' + hash(value));
    if(!s||s.expires<=Date.now())return null;
    const account=(await store.get('account:'+s.userId)).value;
    return account&&account.authEpoch===s.epoch?{...s,account}:null;
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/account/')) return false;
    try {
      if (url.pathname === '/api/account/config' && req.method === 'GET') {
        const challenge = random(); setCookie(req, res, 'evala_login', challenge, 600);
        json(res, 200, { enabled: enabled(req), googleClientId: enabled(req) ? googleClientId : '', challenge, persistent: store.durable }); return true;
      }
      if (!enabled(req)) throw fail('Přihlášení zatím není dostupné. Můžeš pokračovat bez účtu.', 503);
      if (url.pathname === '/api/account/google' && req.method === 'POST') {
        const ip = req.socket.remoteAddress, now = Date.now();
        const rate = rates.get(ip); const next = !rate || now - rate.start > 60000 ? { start: now, count: 1 } : { ...rate, count: rate.count + 1 };
        rates.set(ip, next); if (rates.size > 1000) for (const [key, item] of rates) if (now - item.start > 60000) rates.delete(key);
        if (next.count > 12) throw fail('Příliš mnoho přihlášení. Zkus to za minutu.', 429);
        if (!googleClientId) throw fail('Přihlášení přes Google ještě není dostupné.', 503);
        const challenge = cookie(req, 'evala_login');
        if (!/^[a-f0-9]{64}$/.test(challenge || '') || !equal(challenge, req.headers['x-csrf-token'])) throw fail('Přihlašovací formulář vypršel. Obnov stránku.', 403);
        const data = await body(req, 12000);
        let claims;
        try { claims = await verifyGoogle(data.credential); } catch { throw fail('Google přihlášení se nepodařilo ověřit.', 401); }
        if (!claims?.sub || typeof claims.email !== 'string' || claims.email_verified !== true || !equal(claims.nonce, challenge)) throw fail('Neplatné potvrzení Google účtu.', 401);
        await store.transact('login:' + hash(challenge), prior => { if (prior) throw fail('Přihlášení již bylo použito. Obnov stránku.', 403); return { usedAt: Date.now() }; });
        const id = hash('google:' + claims.sub);
        const account = await store.transact('account:' + id, prior => prior ? {...prior,authEpoch:prior.authEpoch||randomUUID()} : { id,authEpoch:randomUUID(), name: String(claims.name || claims.email.split('@')[0]).slice(0, 80), email: String(claims.email).slice(0, 254), preferences: {}, games: {}, training: trainingState(), createdAt: Date.now() });
        const raw = random(), csrf = random();
        await store.put('session:' + hash(raw), { userId: id,epoch:account.authEpoch, csrf, expires: Date.now() + 30 * 86400000 });
        setCookie(req, res, 'evala_account', raw, 30 * 86400);
        json(res, 200, { user: publicUser(account), csrf, training: account.training }); return true;
      }
      const s = await session(req);
      if (url.pathname === '/api/account/me' && req.method === 'GET') {
        const account = s?.account;
        json(res, 200, account ? { user: publicUser(account), csrf: s.csrf, training: account.training } : { user: null }); return true;
      }
      if (!s) throw fail('Přihlas se ke svému účtu.', 401);
      if (!['GET', 'HEAD'].includes(req.method) && !equal(req.headers['x-csrf-token'], s.csrf)) throw fail('Obnov stránku a zkus to znovu.', 403);
      if (url.pathname === '/api/account/logout' && req.method === 'POST') {
        await store.remove('session:' + hash(cookie(req, 'evala_account'))); setCookie(req, res, 'evala_account', '', 0); json(res, 200, { ok: true }); return true;
      }
      const accountKey = 'account:' + s.userId;
      const account = s.account;
      const mutateAccount=change=>store.transact(accountKey,a=>{if(!a||a.authEpoch!==s.epoch)throw fail('Přihlas se znovu.',401);return change(a);});
      if (!account) throw fail('Účet nebyl nalezen.', 401);
      if (url.pathname === '/api/account/profile' && req.method === 'PATCH') {
        const data = await body(req, 6000);
        const updated = await mutateAccount(a => {a.preferences={...a.preferences,...preferences(data.preferences)};if(data.startingRating!==undefined){if(a.training.attempted||![400,800,1200,1600,2000,2400,2800].includes(data.startingRating))throw fail('Výchozí úroveň lze změnit pouze před prvním pokusem.');a.training.rating=a.training.initialRating=data.startingRating;}return a;});
        json(res, 200, { user: publicUser(updated),training:updated.training }); return true;
      }
      if (url.pathname === '/api/account/library' && req.method === 'GET') { json(res, 200, { games: Object.values(account.games) }); return true; }
      const gamePath = url.pathname.match(/^\/api\/account\/library\/([a-zA-Z0-9_-]{1,80})$/);
      if (gamePath) {
        const id = gamePath[1], key = `game:${s.userId}:${id}`;
        if (req.method === 'GET') {
          const game = account.games[id] ? (await store.get(key + ':' + account.games[id].version)).value : null;
          if (!account.games[id] || !game) throw fail('Partie nebyla nalezena.', 404);
          json(res, 200, { game: { ...normalizeReview(game), _remoteVersion: account.games[id].version } }); return true;
        }
        if (req.method === 'DELETE') {
          let version;
          await mutateAccount(a => { version = a.games[id]?.version; delete a.games[id]; return a; });
          if (version) await store.remove(key + ':' + version); json(res, 200, { ok: true }); return true;
        }
        if (req.method === 'PUT') {
          const input = await body(req);let game;try{game=parsePgn(input.pgn);}catch{throw fail('Neplatná partie PGN.');}
          if (game.id !== id) throw fail('Partie neodpovídá svému identifikátoru.');
          game.createdAt = Math.max(0, Math.min(Date.now(), Number(input.createdAt) || Date.now()));
          game.notes = typeof input.notes === 'string' ? input.notes.slice(0,4000) : '';
          game.learning=cleanLearning(input.learning||game.learning,game.moves);
          if (input.analysis) {
            const a = input.analysis;
            if (!Array.isArray(a.positions) || a.positions.length > game.fens.length) throw fail('Neplatný rozbor.');
            let positions;try{positions=a.positions.map(p => p ? checkedResult(p) : null);}catch{throw fail('Neplatné hodnocení pozice.');}
            game.analysis = { key: String(a.key || '').slice(0, 1000), version: Number(a.version) || 3, engine: a.engine === 'lite' ? 'lite' : 'full', positions, complete: positions.length === game.fens.length && positions.every(Boolean), moves: game.moves.map((m, i) => classifyMove(m, positions[i], positions[i + 1], { previous: positions[i - 1] })), finishedAt: Math.min(Date.now(), Number(a.finishedAt) || Date.now()) };
            // Recheck the certificate; never trust a client-supplied badge.
            for (let i = 0; i < game.analysis.moves.length; i++) {
              const source = a.moves?.[i], mark = game.analysis.moves[i];
              if(mark&&source?.proof?.version===2&&Array.isArray(source.proof.captures)&&source.proof.captures.length<=3){
                try{mark.proof={version:2,captures:source.proof.captures.map(p=>({capture:String(p.capture).slice(0,5),score:checkedResult(p.score)}))};}catch{/* Invalid proof falls back to ordinary quality. */}
              }
            }
            normalizeReview(game);
          }
          const bytes = Buffer.byteLength(JSON.stringify(game)), version = randomUUID(); let previousVersion;
          await mutateAccount(async a => {
            const previous = a.games[id];
            previousVersion = previous?.version;
            if (previous && input._remoteVersion !== previous.version) throw fail('Partie se změnila na jiném zařízení. Obnov knihovnu.', 409);
            if (!previous && Object.keys(a.games).length >= 200) throw fail('Účet má limit 200 partií.', 413);
            const used = Object.values(a.games).reduce((n, g) => n + (g.bytes || 0), 0) - (previous?.bytes || 0) + bytes;
            if (used > 50_000_000) throw fail('Úložiště účtu je plné. Exportuj a smaž starší partie.', 413);
            // An immutable revision keeps the old index valid if writing the index fails.
            await store.put(key + ':' + version, game);
            a.games[id] = { id, version, bytes, updatedAt: Date.now(), white: game.headers.White, black: game.headers.Black, result: game.headers.Result, analyzed: !!game.analysis?.complete };
            return a;
          });
          if (previousVersion) await store.remove(key + ':' + previousVersion);
          // Reads use the indexed immutable revision, never an uncommitted write.
          json(res, 200, { version }); return true;
        }
        throw fail('Nepodporovaná metoda.', 405);
      }
      if (url.pathname === '/api/account/delete' && req.method === 'POST') {
        for (const game of Object.values(account.games)) await store.remove(`game:${s.userId}:${game.id}:${game.version}`);
        await store.remove(accountKey); await store.remove('session:' + hash(cookie(req, 'evala_account')));
        setCookie(req, res, 'evala_account', '', 0); json(res, 200, { ok: true }); return true;
      }
      if (url.pathname === '/api/account/training' && req.method === 'GET') { json(res, 200, { training: account.training }); return true; }
      if (url.pathname === '/api/account/puzzle/next' && req.method === 'POST') {
        const input = await body(req, 2000), all = await puzzles(); let response;
        const mode = ['rated', 'review', 'daily','personal','lesson'].includes(input.mode) ? input.mode : 'rated';let personal=[];
        if(mode==='personal'){
          const username=account.preferences.chessUsername||'',name=username.toLowerCase(),games=[];
          for(const item of Object.values(account.games).filter(g=>g.analyzed&&[g.white,g.black].some(n=>n?.toLowerCase()===name)).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,30)){
            const game=(await store.get(`game:${s.userId}:${item.id}:${item.version}`)).value;if(game)games.push(game);
          }
          personal=personalPuzzles(games,username);
        }
        await mutateAccount(a => {
          const puzzle = mode==='personal'?(input.puzzleId?personal.find(p=>p.id===input.puzzleId):(personal.find(p=>a.training.history[p.id]?.dueAt<=Date.now())||personal.find(p=>!a.training.recent.includes(p.id))||personal[0])):mode==='lesson'?all.find(p=>p.id===input.puzzleId):choosePuzzle(all, trainingState(a.training), { mode, theme: String(input.theme || 'all'), difficulty: input.difficulty,reviewBudget:a.preferences.reviewBudget||10,reviewPausedUntil:a.preferences.reviewPausedUntil||0 });
          if (!puzzle) { response = { puzzle: null, training: a.training }; return a; }
          const state = startPuzzle(puzzle), challengeId = randomUUID();
          a.activePuzzle = { challengeId, puzzleId: puzzle.id, state, mode,personalPuzzle:puzzle.personal?puzzle:null, expires: Date.now() + 3600000 };
          response = { puzzle: { id: puzzle.id, rating: puzzle.rating,personal:!!puzzle.personal,opponent:puzzle.opponent, challengeId, state }, training: a.training }; return a;
        }); json(res, 200, response); return true;
      }
      if (/^\/api\/account\/puzzle\/(move|hint|solution)$/.test(url.pathname) && req.method === 'POST') {
        const input = await body(req, 2000), all = await puzzles(); let response;
        await mutateAccount(a => {
          const active = a.activePuzzle;
          if (!active || active.challengeId !== input.challengeId || active.expires < Date.now()) throw fail('Úloha vypršela. Načti další.', 409);
          const puzzle = active.personalPuzzle||all.find(p => p.id === active.puzzleId); if (!puzzle) throw fail('Úloha není dostupná.', 404);
          let result, delta = 0;
          if (url.pathname.endsWith('/move')) {try{result=playPuzzle(puzzle,active.state,input.move);}catch{throw fail('Tah není platný nebo je úloha již dokončená.');}}
          else {
            if (active.state.complete) throw fail('Úloha je již dokončená.', 409);
            active.state.hinted = true;
            if (url.pathname.endsWith('/hint')) result = { state: active.state, hint: puzzle.moves[active.state.index].slice(0, 2), message: 'Zkus zahrát označenou figurou.' };
            else result = { state: { ...active.state, complete: true, failed: true }, solution: puzzle.continuation||puzzle.moves.slice(1), message: 'Řešení úlohy.' };
          }
          active.state = result.state;
          if (!active.state.graded && (active.state.complete || active.state.failed || active.state.hinted)) {
            const grade = recordPuzzle(a.training, puzzle, active.state.complete && !active.state.failed, { hinted: active.state.hinted, mode: active.mode });
            a.training = grade.state; delta = grade.delta; active.state.graded = true;
          }
          response = { ...result, state: active.state, delta, training: a.training, ...(active.state.complete ? { themes: puzzle.themes, source: puzzle.source, solution: puzzle.continuation||puzzle.moves.slice(1) } : {}) }; return a;
        }); json(res, 200, response); return true;
      }
      throw fail('Stránka nebyla nalezena.', 404);
    } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : 'Data se nepodařilo uložit. Zkus to znovu.' }); }
    return true;
  }
  return { handle, session };
}
