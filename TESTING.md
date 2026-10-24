# Ověření Evala

## Verze 2.0.0

- `npm test`: 29 úspěšných kontrol, včetně všech 4 459 legálních řešení úloh, adaptivního výběru, minimálních podkladů pro odhad výkonu, účtů, CSRF, nonce, oddělení knihoven, konfliktů verzí a odvolání všech sessions po smazání účtu.
- `npm run test:platform`: skutečný serverový Stockfish, import, shrnutí a kliknutí na chybu, klávesnice, poznámky, celé vícetahové úlohy, nápověda, uložení vzhledu, synchronizace dvou izolovaných profilů, návrat k hostovské knihovně, zvětšení desky po sbalení panelu a anglické stránky bez zbytků českého rozhraní.
- Obrazovky ověřeny na 1440×900, 1024×768 a 390×844 bez horizontálního přetečení. Test přihlášení podepisuje JWT místním testovacím RSA klíčem; nepotvrzuje skutečné dokončení Google přihlášení člověkem.


## Verze 1.3.0 — sdílení a společné rozbory

- `npm test`: 20 kontrol včetně session bez tokenu, limitů vstupu, globální kapacity, importu 10–100 her a nových analytických metrik.
- `node tests/shared-browser.mjs`: nový profil bez owner tokenu, importní formulář a ruční podmnožina, dvě celé partie přes skutečný serverový engine, 0 lokálních workerů/WASM, obnova vybraného přehledu. Importní odpověď je deterministická API fixture; engine ani backend nejsou mockované.
- Šipky ověřeny z desky, filtru i při fokusu na nastavení na 1440×900, 1366×768, 1024×768 a 1280×640. Deska nemění polohu, větší rozměr se vejde do okna. Mobil 390×844 nemá horizontální přetečení.
- Kontrola přes Impeccable: viz IMPECCABLE_AUDIT.md. Sestavení v GitHub Actions provádí navíc anonymní celý rozbor v nativním Docker image před jeho publikováním.
- Po nasazení 1.3 prošel veřejný HTTPS smoke: automatická session bez owner tokenu, celý nativní rozbor, chráněný privátní přístup a extension CORS. Čistý prohlížeč importoval skutečných 10 her Schweits, ručně vybral jednu a dokončil rozbor; testový průchod po spuštění rozboru trval 9 s. 0 lokálních workerů, 0 WASM, funkční šipky na nasazené stránce. Nejde o benchmark celé dávky 100 her.

## Verze 1.2.0 — pracovní plocha a hráčské přehledy

- `npm test`: 16 úspěšných kontrol. Nové ověření statistik pro správného hráče a barvu, oddělení dokončených výsledků od pokrytí enginem, neznámých údajů, PGN hodin, fází, tempa a pravidel great/miss pro obě barvy.
- `node tests/workspace-browser.mjs`: skutečný Full Stockfish rozbor ukázkové partie, odznak na posledním tahu, zachování fokusu na desce, Home/End a opakované šipky. Na 1440×900, 1366×768, 1024×768 a 1280×640 zůstávají deska, graf i export ve viewportu. Aktivní tah posouvá jen vlastní seznam.
- Hráčský přehled: výsledky, filtr barvy, vyhodnocené chyby a funkční otevření tréninkové pozice. Rozbor i přehled ověřeny na 390×844 bez horizontálního přetečení.
- `node tests/hosted-browser.mjs`: hostovaný web automaticky zvolil server, ověřil token a provedl celý rozbor přes API; 0 lokálních engine workerů a 0 WASM downloadů.
- Vizuálně ověřena pracovní plocha i přehled na desktopu a mobilu. Screenshoty jsou v místním test-results, nikoli ve veřejném instalačním obrazu.

## Předchozí verze 1.1

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
- Nativní Docker image byl sestaven a spuštěn v GitHub Actions: oficiální Stockfish 19, ověřený kontrolní součet, skutečný API MultiPV výpočet před publikováním. Lokální Docker daemon nebyl potřeba.

## Azure — 23. října 2026

- Nasazeno na Azure Container Apps Consumption: 2 vCPU, 4 GiB, 2 engine vlákna, jeden výpočetní slot, 0–1 replik.
- Skutečný HTTPS API test: tři varianty, hloubka 18, přibližně 2,1 milionu uzlů za sekundu. Čas požadavku 1,89 s; šlo o zahřátou instanci.
- `node tests/azure-browser.mjs`: celá skutečná 46půltahová partie Schweits zpracována za 90,849 s s profilem balanced (750 ms/pozici, MultiPV 3), včetně dodatečných ověření. Graf i klasifikace se zobrazily, žádné chyby JavaScriptu. Prohlížeč vytvořil 0 engine workerů a stáhl 0 WASM souborů.
- Jednotlivé výsledky jsou měření této konfigurace a partie, nikoli záruka stejné rychlosti nebo bezplatného nepřetržitého provozu.
