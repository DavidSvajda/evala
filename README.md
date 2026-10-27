# Evala 1.3

## Samotné malé rozšíření s evaluation barem

`npm ci` a `npm run build:bar` vytvoří složku `dist-bar` se Stockfish 19 Lite a instalační ZIP `release/evala-bar-1.3.0.zip`. V Chrome otevři `chrome://extensions`, zapni **Režim pro vývojáře**, zvol **Načíst rozbalené** a vyber `dist-bar`. Potom obnov otevřené stránky Chess.com/Lichess. Nastavení a zkušební deska jsou pod ikonou rozšíření. Tento balíček obsahuje samotný bar; kompletní aplikaci na rozbor partií sestaví běžné `npm run build` do `dist`.

Sdílený web nyní funguje bez ručního API tokenu. Zadej jméno Chess.com/Lichess, zvol posledních 10–100 partií, ručně vyber hry a spusť společný rozbor. Server zpracuje partie postupně; kartu nech otevřenou. Hotové hry i vybraný přehled zůstanou v prohlížeči. Rychlý a podrobný profil mají rozdílné časy a ověřování obětí. Deska je větší a šipky fungují i po kliknutí na ovladače. Omezení veřejného serveru jsou popsána v AZURE_DEPLOYMENT.md.

Verze 1.2 přidává pracovní plochu přizpůsobenou výšce okna, stabilní ovládání šipkami, označení tahu na desce a samostatný **Přehled hráče**. Importuj své partie, spusť jejich rozbor a v přehledu zadej přezdívku shodnou s PGN. Uvidíš výsledky podle barvy a zahájení, chyby podle fáze a konkrétní pozice k procvičení. Výsledkové statistiky fungují i bez enginu; hodnocení tahů a slabin vyžaduje rozebrané pozice. Podklady, pravidla a audit textů: [INSIGHTS_RESEARCH.md](INSIGHTS_RESEARCH.md).

Svislý evaluation bar pro **Chess.com a Lichess**, s lokálním Stockfish 19 Lite. Bílá/černá výplň, podepsané hodnocení z pohledu bílého, dosažená hloubka, nastavení výkonu. Bez účtu, backendu, API klíče a předplatného.

Nově také **kompletní rozbor partií** s plným Stockfish 19 NNUE a volitelným vlastním serverem. V popupu klikni **Rozebrat moje partie**; přes prohlížeč ho můžeš otevřít i jako samostatnou webovou aplikaci. Tato verze přibaluje plný engine (~100 MB), proto je větší než původní balík samotného baru.

## Evala 2 — osobní šachová aplikace

Web má samostatný přehled, knihovnu, rozbor, trénink, statistiky, nastavení a účet. Krémový vzhled nabízí čtyři barvy šachovnice, sbalitelný panel a přepínání CS/EN. Trénink obsahuje 4 459 legálně ověřených CC0 úloh Lichess s původním ratingem, adaptivním výběrem a opakováním chyb. Vlastní tréninkový rating je oddělený od ratingu jednotlivé úlohy.

Shrnutí rozboru ukazuje obě barvy, počty klasifikací a kliknutím přejde na odpovídající tah. Odhad herního Elo je vlastní nekalibrovaná heuristika ukotvená v PGN ratingu, nikoli výpočet Chess.com. Krátké, mělké nebo jednoznačně rozhodnuté partie nemají dost podkladů.

Google přihlášení vyžaduje veřejné `GOOGLE_CLIENT_ID` a povolený origin. Produkční účty se povolí pouze s trvalým `ACCOUNT_STORAGE_CONNECTION_STRING` (soukromý Azure Blob Storage). Lokální server může používat `.local-data/accounts`. Client secret se nepoužívá. Hostovská data zůstávají oddělená; jejich převzetí do účtu je výslovná akce.

## Rozbor vlastních partií

1. Otevři **Rozebrat moje partie** přes ikonu rozšíření.
2. V knihovně importuj PGN soubor / text nebo veřejné dokončené partie podle username z Chess.com či Lichess. Z Chess.com se načte nejvýše 20 posledních her z posledních tří archivů.
3. Vyber partii a zvol **Rozebrat partii**. Výsledky a graf přibývají po pozicích, kritické momenty se ověřují podruhé. Import celé knihovny automaticky nespouští výpočet všech her.
4. Klikáním na tahy / graf a klávesami vlevo-vpravo procházej partii. Varianty enginu lze otevřít a přehrávat na desce. Vlastní legální tah vytvoří odbočku; fungují rošády, en passant i volba proměny.
5. **Prozkoumat pozici** spustí výpočet aktuální pozice. **Zpět do partie** ukončí vlastní odbočku. Nastavení nabízí 1–5 variant, čas, hloubku, Hash a Full/Lite engine.
6. Rozbory se ukládají v IndexedDB. Pozastavený rozbor pokračuje stejným profilem z hotových pozic. Skrytí karty automaticky pozastaví lokální rozbor. Export PGN přidá hodnocení a poznámky; vymazání dat prohlížeče nebo odebrání rozšíření může knihovnu smazat.

Klasifikace a průměr skóre tahů jsou vlastní, ne oficiální Chess.com accuracy. Detekce brilantních tahů je konzervativní: kvalitní tah, ne již vyhrávající alternativa, skutečná oběť a další engine ověření kompenzace. Potřebuje alespoň 2 varianty, aby mohla porovnat alternativu; kvůli rychlosti ověřuje nejvýše 6 obětí na partii. Žádné garantované stejné `!!` odznaky jako Chess.com. Samostatný rozbor podporuje standardní šachy do 600 půltahů, import do 2 MB / 100 partií a knihovnu do 200 partií.

Serverový režim odesílá pozice na zadaný server a vyžaduje jeho případný token. V nastavení rozšíření ho lze po ověření zapnout i pro průběžný evaluation bar. Není nutný pro bezplatné lokální použití. Podrobný postup: **[DEPLOYMENT.md](DEPLOYMENT.md)**. Výsledky rešerše akademických a bezplatných serverů: **[HOSTING_RESEARCH.md](HOSTING_RESEARCH.md)**. Podklady pro obchod: **[STORE_LISTING.md](STORE_LISTING.md)**.

## Instalace z počítače — zdarma

1. Rozbal ZIP příslušného vydání do vlastní složky. Případně použij hotovou složku `dist` v tomto projektu. U již načtené instalace klikni na **Znovu načíst**.
2. V Chrome otevři `chrome://extensions`.
3. Zapni **Režim pro vývojáře** vpravo nahoře.
4. Zvol **Načíst rozbalené** a vyber složku, která přímo obsahuje `manifest.json`. ZIP se nevybírá přímo.
5. Obnov už otevřené stránky Chess.com / Lichess. Bar se objeví u viditelné šachovnice; výchozí umístění je vlevo.
6. Připni Evala přes ikonu rozšíření. Kliknutím otevřeš nastavení a **Vyzkoušet na šachovnici**.

**Pro živou partii:** po instalaci otevři nebo obnov kartu s právě hranou hrou na Chess.com (`/game/live/…` nebo `/play/…`). Bar se připojí přímo k desce a po každém tahu obou stran sám přepočítá hodnocení. Není třeba otevírat demo, přepínat do analýzy ani ručně vkládat FEN. Náhled v Codexu je jen testovací deska; rozšíření musí být načtené do prohlížeče, ve kterém hraješ.

Stejný postup funguje v Edge přes `edge://extensions`. Ověřovaná cílová platforma je desktopový Chrome/Chromium, minimálně verze 116. Firefox a mobilní prohlížeče nejsou součástí této verze.

Používej pro analýzu, trénink a sledování, kde je asistence povolená. Oba servery zakazují engine při vlastních probíhajících partiích proti lidem. Rozšíření nehraje tahy za tebe.

## Jak bar číst

- `0.0`: přibližně vyrovnaná pozice, polovina bílá a polovina černá.
- `+3.0`: engine hodnotí pozici ve prospěch bílého přibližně jako tři pěšce. Bílá výplň roste.
- `−3.2`: výhoda černého, roste černá výplň.
- `+M3` / `−M3`: engine našel mat v uvedeném počtu tahů pro bílého / černého. `Mat`: partie je již v matové pozici.
- `d18`: skutečně dosažená hloubka. Nastavená maximální hloubka se při krátkém časovém limitu nemusí dosáhnout.
- `—`: engine ještě počítá, je pozastavený, nebo nemá úplné údaje o pozici. Důvod zjistíš po kliknutí na ikonu nad barem.

Výplň používá symetrickou křivku `50 + 50 × tanh(centipawns / 400)` a saturaci při matu. **Není to pravděpodobnost výhry**. Výchozí orientace je černá nahoře, bílá dole; při otočení desky se otočí i bar. Znaménko vždy zůstává z pohledu bílého.

## Nastavení

| Volba | Výchozí hodnota | Co mění |
|---|---:|---|
| Profil | Vyvážený | Úsporný: d12 / 0,3 s / 16 MB; Vyvážený: d18 / 1,5 s / 32 MB; Důkladný: d24 / 10 s / 128 MB |
| Maximální hloubka | 18 | Rozsah 6–30 půltahů |
| Čas na pozici | 1,5 s | Výpočet končí dosažením času nebo hloubky, podle toho, co nastane dřív |
| Paměť / Hash | 32 MB | 16–256 MB pro transpoziční tabulku; celková paměť procesu je vyšší |
| Umístění | Vlevo | Vlevo/vpravo, šířka 26–48 px, odstup 4–48 px |
| Otočení | Zapnuto | Sleduje orientaci šachovnice |
| Dosažená hloubka | Zobrazit | Zobrazení dN na baru |
| Pauza na skryté kartě | Zapnuto | Šetří procesor; po návratu znovu přepočítá pozici |

Engine běží na jednom vlákně. Nastavení více vláken zde záměrně není, protože single-thread sestavení by je nevyužilo.

## Podpora pozic a omezení

Čtení funguje pro standardní šachy: nejprve FEN ze známého rozhraní stránky, potom rekonstrukce viditelných tahů a sledování legálních změn. FEN se kontroluje proti skutečně zobrazeným figurám. Při přehrávání partie se proto používá pozice zobrazená na desce.

Když chybí FEN a úplná historie, nelze ze samotných figur bezpečně určit práva rošády, en passant ani tah na řadě. Bar tehdy čeká; otevři analytickou stránku nebo načti partii od začátku. Nepodporovány jsou varianty, Chess960, nestandardní výchozí pozice bez FEN a větvené analýzy bez dostupného aktuálního FEN. Historické trojí opakování z pouhého FEN nelze rozpoznat. Změny interních DOM/API webů mohou vyžadovat aktualizaci adaptéru.

Pokud vlevo chybí místo, bar se přesune doprava, je-li tam prostor. Na velmi úzkém okně může ležet přes kraj stránky; použij menší šířku/odstup nebo zvětši okno. Nativní eval bar webu rozšíření neschovává; případně ho vypni v nastavení webu.

## Vývoj a testy

```powershell
npm ci
npm run build
npm test
npm run test:browser
npm run test:extension
npm run test:study
npm run serve
```

Lokální aplikace: `http://127.0.0.1:4173/study.html`, náhled baru: `/demo.html`. Produkční rozšíření nepotřebuje Node.js ani spuštěný server. Pro browser testy lze nastavit `EVALA_BROWSER` na cestu k Chromium/Chrome, jinak se používá lokální Chrome ve Windows. Testy vytvářejí pouze vlastní dočasný profil.

`npm run package` vytvoří instalační ZIP a archiv zdrojů v `release`. Pro úplné přibalení odpovídajícího upstream zdroje předtím spusť `node scripts/prepare-assets.mjs` (jednorázově potřebuje internet). Ikony, figury, fonty a engine jsou po sestavení součástí balíku.

## Chrome Web Store

Balík má Manifest V3, lokální WASM, omezený přístup na dva weby, ikony a zásady soukromí v `PRIVACY.md`. Instalace z počítače je zdarma. Pro publikaci ve Web Storu je potřeba vlastní vývojářský účet s jednorázovým registračním poplatkem; publikace proto nesplňuje požadavek absolutně nulových nákladů. Žádné zveřejnění ani platba nebyly provedeny. Před odesláním doplň vlastní kontaktní údaje, screenshoty, veřejnou adresu zásad soukromí a pravdivé odpovědi ve formuláři obchodu. Schválení závisí na Googlu.

Research a volba enginu: `RESEARCH.md`. Soukromí: `PRIVACY.md`. Licence a cizí zdroje: `LICENSE` a `THIRD_PARTY_NOTICES.md`.
