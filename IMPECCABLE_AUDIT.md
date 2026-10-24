# Impeccable — pracovní plocha a sdílený rozbor, 23. října 2026

Použit skill Impeccable 4.3.1, jeho kontextový nástroj, Operate/layout guidance a technická kontrola `detect --json`. Ověřeno ve dvou kolech desktopových a mobilních snímků, spolu s funkčním testem nového návštěvníka.

## Zjištění a změny

- **P0 — nový návštěvník potřeboval osobní token.** Veřejný web nyní získá technickou HttpOnly session automaticky. Vlastní token zůstává na serveru pro privátní přístup; není vložen do HTML ani JS. Fronta a kapacitní limity omezují veřejný výpočet.
- **P1 — šipky se vypínaly při otevřeném nastavení nebo fokusu na ovladači.** Obsluha je na window v capture fázi. Klávesy fungují z desky, filtru i tlačítka nastavení; textová pole a formulář nastavení si zachovávají běžné chování. Test ověřuje skutečnou změnu pozice i stálou polohu desky.
- **P1 — deska měla příliš velkou rezervu pod sebou.** Graf je kompaktní, duplicitní popisek skrytý na desktopu, export v menu partie. Na 1366×768 narostla deska přibližně ze 422 na 516 px bez posouvání stránky.
- **P1 — společný přehled nesměl zahrnout ručně vynechané partie.** Všechny metriky nyní používají vybranou množinu, včetně obnovení po reloadu.
- **P2 — malá funkční typografie.** Původní 9/10px prvky povýšeny na nejméně 11px. Tabulky mají 12px, ovládací prvky viditelný fokus.
- **P2 — animace výšky eval baru.** Nahrazena `transform: scaleY`, včetně obrácené orientace a reduced-motion.
- **P2 — formulář zabíral první obrazovku i po dokončení.** Hotový rozbor sbalí nastavení do jednoho upravitelného řádku.

Detektor chybně hlásil černý text na tmavé ploše, protože z public/study.html nemohl načíst theme.css: tento soubor se kopíruje do dist až při sestavení. Ověřeno na skutečně sestaveném webu, který načítá barvy a font správně. Jde o omezení statického běhu, nikoli důkaz vyhovění všem pravidlům WCAG. Mobilní drobné ovladače zůstávají hustší než plná dotyková aplikace.

Celkové hodnocení: souvislé pracovní rozhraní s jedním hlavním postupem a skutečnými údaji. Nejde o kompletní certifikační audit přístupnosti ani veřejnou službu s účty a trvalými serverovými úlohami.

## Verze 2.0.0 — osobní šachový prostor, trénink a účty (24.–25. října 2026)

Proveden závěrečný review a audit po rozšíření o tréninkový modul, účty a sbalitelnou navigaci:

- **Sbalitelný navigační panel:** Boční lišta (212 px) má přepínací tlačítko `#toggle-sidebar`, které sbalí panel a umožní šachovnici zvětšit se o více než 30 px na desktopu i tabletu bez překročení viewportu.
- **Hodnocení úloh (Elo):** Každá úloha z CC0 banky zobrazuje kalibrované Elo z Lichess databáze a slovní obtížnost (Základní / Střední / Pokročilá / Náročná). Osobní pozice z chyb hráče jsou zřetelně označeny jako „bez kalibrovaného ratingu“. Tréninkový rating hráče zůstává striktně oddělený od hodnocení jednotlivých úloh.
- **Lokalizace CZ / EN:** Přepínač jazyka `#toggle-language` a výběr v Nastavení dynamicky překládá celé rozhraní přes MutationObserver. Test `tests/platform-browser.mjs` prochází všech 7 stránek (Přehled, Moje partie, Rozbor, Trénink, Statistiky, Nastavení, Účet) a ověřuje nulový výskyt nepřeloženého českého textu.
- **Trvalé úložiště a Google účty:** Serverové účty jsou napojeny na trvalý Azure Blob Storage (`ACCOUNT_STORAGE_CONNECTION_STRING`), který chrání knihovny a tréninkovou historii před restartem kontejneru. Nepřihlášený režim zůstává plně funkční v lokálním IndexedDB.
- **Responzivní chování:** Ověřeno na viewportech 1440×900, 1024×768 a 390×844 — nulové horizontální přetékání stránky (`scrollWidth <= innerWidth`).

