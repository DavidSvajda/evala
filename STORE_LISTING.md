# Podklady pro Chrome Web Store — Evala 1.1.0

Stav: připravený text a testovací postup; aplikace není publikovaná. Před odesláním doplň vlastní kontakt, veřejnou URL zásad soukromí a screenshoty současné verze. Použij finální ZIP verze 1.1.0.

## Název a krátký popis

**Evala — Chess Analysis & Evaluation Bar**

Stockfish 19, evaluation bar pro Chess.com a Lichess, import partií a lokální rozbor s variantami. Bez předplatného.

## Popis

Evala přidává přehledné hodnocení šachové pozice vedle desky a samostatnou knihovnu pro rozbor dokončených partií.

- Lokální Stockfish 19: plný NNUE pro rozbory a lehká varianta pro bar.
- Import PGN nebo posledních veřejných dokončených partií podle username z Chess.com / Lichess.
- Až 5 engine variant, vlastní odbočky na desce, otáčení, šipka a graf hodnocení.
- Hodnocení tahů, kritické momenty a konzervativní detekce obětí s vlastním ověřením enginem.
- Profily rychlosti, čas a hloubka, paměť, pauza, pokračování a lokální uložené výsledky.
- Export PGN s poznámkami a volitelný vlastní výpočetní server.

Rozšíření standardně počítá na zařízení uživatele a neprovozuje vlastní placenou cloudovou službu. Plný engine zvyšuje velikost balíku přibližně o 100 MB. Vlastní klasifikace tahů ani průměr skóre tahů nejsou oficiální odznaky nebo accuracy Chess.com. Nejde o produkt Chess.com ani Lichess.

Používej pro rozbor, trénink a situace povolené pravidly webů. Pomoc enginu při vlastní probíhající partii proti člověku Chess.com i Lichess zakazují.

## Jednotný účel

Analýza šachových pozic a dokončených partií s lokálním enginem Stockfish.

## Zdůvodnění oprávnění

- `storage`: uložení nastavení evaluation baru.
- `offscreen`: hostování Workeru lokálního enginu mimo CSP cizích webů.
- Chess.com / Lichess content scripts: čtení viditelné pozice a zobrazení baru.
- `api.chess.com` a `lichess.org` host permissions: import veřejných archivovaných her na žádost uživatele.
- Volitelné HTTPS hosty / localhost: výhradně pro vlastní server, který si uživatel zadá a přístup sám povolí. Nepožadují se automaticky po instalaci.
- IndexedDB: lokální PGN knihovna a výsledky v originu rozšíření; nejde o další manifest oprávnění.

Přibalené WASM a JS se nestahují z externího CDN. Server vrací data v JSON/NDJSON, nikoli vzdálený spustitelný kód. Do obchodu pravdivě vyplň deklarace podle výsledného provozu, zejména pokud začneš sám hostovat backend a přijímat uživatelské pozice.

## Testovací postup pro kontrolu

1. Nainstalovat rozšíření. Otevřít popup → Rozebrat moje partie.
2. Vlevo zvolit Otevřít ukázkovou partii. Není potřeba login.
3. Nastavení → Rychlý → Rozebrat partii. Výsledky přibývají průběžně; konec potvrzuje Uloženo.
4. Vybrat tah, otevřít engine variantu a procházet ji šipkami. Vyzkoušet vlastní legální tah na desce.
5. Obnovit kartu a ověřit uložený výsledek. Exportovat PGN.
6. Otevřít veřejnou analytickou desku Chess.com nebo Lichess a ověřit bar u desky.
7. Serverový režim je volitelný; pro základní funkce není potřeba server ani přihlašovací údaje.

Publikační kroky a oficiální zdroje jsou v `HOSTING_RESEARCH.md`.
