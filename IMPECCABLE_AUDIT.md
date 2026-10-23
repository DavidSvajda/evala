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
