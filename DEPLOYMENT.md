# Spuštění aplikace a serveru

## Bez serveru: rozšíření

Načti aktualizovanou složku `dist` v Chrome. U existující instalace klikni na ikonu **Znovu načíst** na `chrome://extensions`, potom obnov herní stránky. V popupu zvol **Rozebrat moje partie**. Knihovna a výsledky jsou v lokálním IndexedDB daného rozšíření.

## Lokální webová aplikace

```powershell
npm ci
npm run build
npm run serve
```

Otevři `http://127.0.0.1:4173/study.html`. Tento server pouze doručuje soubory, výpočet je v prohlížeči. Dvojklik na HTML přes `file://` není podporován, protože Worker a WASM potřebují webový nebo extension origin.

## Backend s plným Stockfish 19

```powershell
npm run server
```

Na `http://127.0.0.1:8080` běží aplikace i API. Nastavení → Kde počítat → Na vlastním serveru → adresa `http://127.0.0.1:8080`. Pro rozšíření nejprve klikni **Ověřit spojení** a povol přístup k tomuto hostu.

V nainstalovaném rozšíření můžeš po ověření zapnout **Použít server také pro evaluation bar**. Tím server převezme i průběžný výpočet baru na Chess.com/Lichess. Token pro tuto funkci je jen v dočasném úložišti rozšíření do restartu prohlížeče; pak ověř spojení znovu. Odškrtnutím se bar vrátí k lokálnímu Lite enginu.

Backend standardně naslouchá pouze na localhost. Pro veřejné rozhraní musí být `API_TOKEN` nastavený. Příklad pro Linux server:

```sh
export HOST=0.0.0.0
export PORT=8080
export API_TOKEN="$(openssl rand -hex 32)"
export ENGINE_CONCURRENCY=1
export ALLOWED_ORIGINS="https://tvoje-aplikace.example,chrome-extension://tvoje-extension-id"
npm run server
```

Token je osobní tajný údaj, nikoliv součást zdrojového kódu ani veřejného webu. Každý, kdo ho zná, může využívat výkon API. Veřejný univerzální token zabudovaný do Storu by výkon nechránil; pro otevřenou službu více uživatelům přidej autentizaci a účty/kvóty. Dodaná verze je určena pro osobní server a důvěryhodné uživatele.

V aplikaci je token v paměti karty a sessionStorage, ne v exportu PGN ani sdílené URL. Server dostává FEN, historii tahů a nastavení. Knihovna PGN zůstává u uživatele. Server neukládá partie ani výsledky na disk.

`ENGINE_CONCURRENCY` je 1–4 oddělené procesy. Začni 1 slotem na 2 vCPU; CPU a RAM limity přizpůsob skutečnému serveru. Plný přibalený engine je jednovláknové WASM spuštěné v Node. Volitelně nastav `STOCKFISH_PATH` na absolutní cestu k nativní binárce Stockfish 19 pro danou architekturu; ta musí podporovat standardní UCI. U nativní binárky nastavíš `ENGINE_THREADS` (1–16), nikdy nepřiděluj více součinu vláken a slotů než povolených CPU. Cestu nevyplňuje běžný vzdálený klient.

## Docker

Vytvoř `.env` lokálně s náhodným `API_TOKEN` a s `ALLOWED_ORIGINS`. `.env` je v ignore pravidlech a není součástí balíků.

```sh
docker compose up --build -d
```

Compose vystavuje port jen na localhost serveru. Před něj nastav HTTPS reverse proxy (např. Nginx/Caddy nebo univerzitní ingress). Zachovej původní Host, vypni buffering pro `/api/analyze` a nastav timeout alespoň 45 sekund. Tělo požadavku je nejvýše 64 KB.

Příklad relevantní části Nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_buffering off;
    proxy_read_timeout 45s;
    client_max_body_size 64k;
}
```

TLS certifikát a doména se spravují na zvoleném hostingu. Obrázky pro CERIT-SC musí respektovat jejich aktuální runtime omezení; ukázkový image běží jako uživatel `node`, ne jako root. Docker byl připraven; jeho skutečné nasazení na konkrétním poskytovateli není provedeno.

## API

- `GET /api/health`: ověří token a vrátí jméno enginu a obsazení slotů.
- `POST /api/analyze`: JSON `{fen, history?: {initialFen,moves}, settings:{depth,time,hash,multipv}}`.
- Odpověď: `application/x-ndjson`, zprávy `info`, `done`, případně `error`.
- `Authorization: Bearer ...` při nastaveném tokenu.
- HTTP 400 neplatná data, 401 token, 403 origin, 429 vytížený server nebo limit požadavků.
- Server omezuje čas na 5 s/pozici, Hash na 128 MB, hloubku na 28, MultiPV na 5 a 300 požadavků/IP/min.
- Zrušení fetch požadavku přeruší UCI hledání; před dalším požadavkem se čeká na dokončení `stop`.

## Co kde nahrát

- Do Chrome Web Storu patří instalační ZIP rozšíření z `release/`.
- Na vlastní statický hosting patří rozbalený webový balík z `release/`; výpočet pak standardně probíhá na klientovi.
- Na VM/Docker server patří zdrojový projekt se `server/`, balíčky a sestaveným `dist`, případně hotový Docker image.
- Pouhé nahrání `dist` na běžný PHP webhosting nespustí serverový Stockfish. Může tam fungovat pouze klientský výpočet, dovoluje-li hosting dostatečně velké WASM soubory a správný MIME typ.
