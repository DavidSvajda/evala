# Ověření Evala 1.1.0

Ověřeno 21.–22. října 2026 v desktopovém Chrome 155 na Windows.

- `npm test`: všech 13 kontrol prošlo, včetně převodu UCI skóre, symetrie baru, FEN, rošády, en passant, matu/patu, mezí nastavení, přerušování zastaralých hledání a níže popsaných study/server kontrol.
- `npm run test:browser`: skutečný přibalený WASM engine na lokální desce; výhoda obou stran, mat, pat, natočení, pozice baru, profily, pauza, FEN, rychlé přehrávání, uložení nastavení a šířka 390 px. Žádné vzdálené prostředky ani chyby JavaScriptu/CSP.
- `npm run test:extension`: skutečně načtený Manifest V3 balík v odděleném profilu Chrome, extension-origin WASM a adaptéry obou webů na deterministických DOM fixtures. Ověřeno směrování přes service worker a offscreen dokument. Na herní URL Chess.com `/game/live/…` se testují změny e2e4 a e7e5 bez ručního FEN i bez obnovení stránky.
- `node tests/live-sites.mjs`: veřejné analytické stránky obou služeb; skutečné zobrazené pozice a lokální výstup Stockfish. Síťový smoke test je oddělený, protože dostupnost webů a jejich dialogy mohou test ovlivnit.
- `npm audit`: po aktualizaci vývojové závislosti sharp žádné známé zranitelnosti. Závěrečný `npm audit --omit=dev` rovněž bez nálezu.
- Vizuálně zkontrolována demonstrační deska na desktopu a při šířce 390 px, nastavení a bar na skutečných analytických stránkách.

Neověřováno přihlášení ani vlastní partie proti hráčům. Změny soukromých rozhraní/DOM webů zůstávají integračním omezením. Firefox, mobilní rozšíření, Chess960 a další varianty nejsou cílovou platformou této verze.

## Analytická aplikace a backend

- 13 automatických core/server/study kontrol: PGN kolekce a export, skutečný Full Stockfish 19 / MultiPV, WDL a znaménka, bezpečné zrušení hledání a nové hledání, klasifikace pro obě barvy, oběti a podmínka druhé nejlepší varianty, token, CORS, stream a limity API, neplatná historie.
- Browser test analytické aplikace: plný engine, rozbor matové partie, graf, přehrání varianty, vlastní tah, export, uložení/obnovení IndexedDB a šířka 390 px.
- Oficiální API Chess.com: autorizovaný import veřejných her účtu Schweits, 20 úspěšně zpracovaných partií bez chyby PGN. Osobní data a screenshoty nejsou součástí distribučních archivů.
- Naměřený browser průchod jedné skutečné 46-půltahové partie s Full NNUE, 300 ms / pozici, 2 variantami a ověřováním kritických momentů: 27,1 a 27,8 sekundy ve dvou bězích. Platí pro toto konkrétní zařízení a test; změny klasifikace obětí mohou přidat další ověření. Nejde o benchmark univerzitního ani bezplatného cloudového serveru.
- Prošel kompletní rozbor přes skutečné serverové API i z webového rozhraní: ověření tokenu, streamování více pozic, návrat výsledků a uložení rozboru. Nainstalované MV3 rozšíření rovněž ověřilo skutečný API import účtu Schweits a Full NNUE varianty pod extension CSP.
- `npm run test:remote-bar`: prošlo propojení nainstalovaného MV3 rozšíření se skutečným Node API a plným enginem, ověření spojení v aplikaci, dočasné uložení tokenu, zapnutí serverového baru a automatický přepočet po e2e4 na Chess.com fixture. Testovací kopie rozšíření má předem udělený přístup k localhostu; produkční instalace jej vyžádá při připojení.
- Docker konfigurace je připravená, ale na tomto počítači neběží Docker daemon. Image nebyl spuštěn; backend byl otestován přímo jako Node služba.
