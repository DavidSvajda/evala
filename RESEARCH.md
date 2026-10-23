# Volba enginu a architektury — ověřeno 21. října 2026

## Rozhodnutí

**Stockfish.js 19.0.1, Stockfish 19 Lite single-thread ve Web Workeru.** Žádný vzdálený inference server, placená služba, API klíč ani síťové stahování enginu za běhu. V balíku jsou JS, WASM i neuronová síť zabudovaná v lite WASM. Přesný zdrojový commit a npm integrita jsou v `public/engine-source.json`.

Stockfish 19 vyšel 5. září 2026. Oficiální vydání uvádí až +44 Elo proti Stockfish 18, jde však o jejich testy plného enginu; nelze je přenášet na tento Lite build ani na konkrétní hloubku v browseru. [Oficiální vydání](https://stockfishchess.org/blog/2026/stockfish-19/)

## Bezplatné možnosti

| Možnost | Výhoda | Omezení v rozšíření | Závěr |
|---|---|---|---|
| Stockfish.js 19 Lite single-thread | Přibližně 1,8 MB WASM v použitém balíku; jednoduchý Worker, lokální NNUE, bez cross-origin isolation | Slabší síť než full; jedno vlákno | Nejlepší kompromis pro tuto lehkou první verzi |
| Stockfish.js 19 Full single-thread | Plná neuronová síť; nevyžaduje SharedArrayBuffer | Přibližně 99 MB WASM v balíku 19.0.1, delší start a vyšší paměť | Vhodná budoucí varianta pro hlubší analýzu |
| Stockfish.js vícevláknový Lite/Full | Více CPU vláken | Vyžaduje cross-origin isolation a SharedArrayBuffer; nespoléhat na jejich dostupnost v cizí stránce/iframe | Větší složitost a nároky než přínos pro jednoduchý bar |
| lichess-org/stockfish-web | Oficiální webové buildy používané Lichessem, GPL | Vlastní integrační rozhraní a správná správa sítí/kompatibility | Dobrá alternativa pro vlastní analytickou aplikaci |
| Leela Chess Zero | Otevřený UCI engine, různé neuronové sítě | Oficiální desktopový setup obsahuje binárku, síť a backend pro hardware; není přímou náhradou za malý browser Worker | Pro tento konkrétní addon méně praktická |
| Cloud/API backend | Výpočet nevyužívá CPU uživatele | Nutný server nebo závislost na cizí službě; nulové náklady, dostupnost a soukromí nelze zaručit | Nezvoleno |
| Stockfish ASM-JS | Fallback bez WASM | Podle upstream pomalejší a slabší; větší než Lite WASM | Moderní Chromium ho nepotřebuje |

Srovnání velikostí a technických vlastností pochází z [Stockfish.js](https://github.com/nmrugg/stockfish.js). Zdroje dalších kandidátů: [Lichess Stockfish Web](https://github.com/lichess-org/stockfish-web), [Lc0 setup](https://lczero.org/play/quickstart/). Výběr je technické posouzení pro tento projekt, nikoliv nezávislý benchmark všech enginů.

## Návrh výpočtu

Content script najde desku a ověří FEN. Service worker směruje zprávy do offscreen dokumentu rozšíření, který vytváří lokální Web Worker. Tím se WASM řídí CSP rozšíření a životnost výpočtu není vázaná na krátký běh service workeru Manifest V3 ani vložený iframe na cizím webu. Otevřené karty mají oddělené instance; při pauze se Worker uvolní. Samostatná demonstrační deska může použít lokální iframe. CSP povoluje pouze vlastní skripty a `wasm-unsafe-eval`, nikoliv vzdálený kód. [Chrome CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy), [Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

UCI fronta má nejvýše jeden aktivní a jeden čekající požadavek. Při změně pozice se pošle `stop`; nové `position` a `go` čekají na `bestmove` předchozího hledání. Výsledky starých požadavků se zahazují podle ID. Hloubka a čas jsou horní limity, nikoliv příslib dosažené kvality. UCI centipawns/mate ze strany na tahu se převedou na pohled bílého.

## Provoz a distribuce

Instalace přes **Load unpacked** je vhodná bezplatná cesta pro osobní použití. [Postup Google](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). Chrome Web Store vyžaduje jednorázový registrační poplatek vývojáře; oficiální stránka zde neurčuje částku, proto ji nefixujeme. [Registrace](https://developer.chrome.com/docs/webstore/register)

Stockfish.js je GPL-3.0 a release obsahuje jeho licenci i odpovídající zdrojový archiv. Licence ostatních komponent jsou v `THIRD_PARTY_NOTICES.md`.

## Pravidla služeb

Chess.com zakazuje programy/enginy pro pozice ve vlastních probíhajících partiích. Lichess rovněž zakazuje externí asistenci. Zamýšlený způsob použití: rozbor, trénink a povolené sledování; rozšíření neprovádí automatické tahy. [Chess.com](https://support.chess.com/en/articles/8568369-what-do-i-need-to-know-about-fair-play-on-chess-com), [Lichess](https://lichess.org/page/how-to-cheat).
