# Deset priorit z historie – stav 2.5.0

Porovnání skutečné implementace s návrhy z konverzace, 30. října 2026. „Hotové“ znamená konkrétní popsanou funkci, nikoli úplnou paritu s konkurenční službou.

| Priorita | Stav | Kde / rozsah |
| --- | --- | --- |
| 1. Import posledních 10–100 her podle username nebo PGN | Hotové dříve | Knihovna a společný report; Chess.com/Lichess. |
| 2. Větší šachovnice, šipky, lokální/serverový engine, témata a jazyky | Hotové dříve | Rozbor, Nastavení; klávesnice respektuje formuláře a záložky. |
| 3. Trenér, klíčové tahy, přehrání variant a opakování chyby | Hotové v 2.4 | Trenér; pravidlová vysvětlení podložená enginem, ne obecný AI chat. |
| 4. Statistiky zahájení, fází, času a konkrétní příklady chyb | Hotové dříve | Statistiky a Cvičebna; rozpoznaný následek není psychologická příčina. |
| 5. Osobní lekce, opakování a podobné motivy v nových pozicích | Hotové dříve | Trénink, rodiny úloh, plánované opakování. |
| 6. Trénink obrany a proměňování výhod | Hotové dříve | Cvičebna; omezené pokračování proti enginu. |
| 7. Vlastní úvaha před enginem a příčina chyby | Doplněno v 2.5 | Poznámky k pozici nyní obsahují vlastní volbu: přehlédnutí hrozby, výpočet, čas, plán. Netvrdíme, že příčinu zjistil engine. |
| 8. Uložené vlastní varianty | Doplněno v 2.5 | Uložit variantu → Moje poznámky → Uložené varianty. Přehrání a smazání; ukládá se s partií a synchronizuje stejnou cestou jako poznámky. Nejvýše 20 variant po 40 půltazích; server ověřuje legálnost. Není to úplný editor repertoárového stromu. |
| 9. Návrat procvičené pozice v dalších hrách | Doplněno v 2.5 | Cvičebna → Po tréninku v dalších partiích. Pouze totožná pozice, vlastní barva, stejné tempo, dokončený rozbor a pozdější den; odkazy na důkazy. Nejde o důkaz kauzálního zlepšení ani o detekci všech podobných motivů. |
| 10. Poctivý odhad herní síly | Částečné | Opravená validace a zastaralá data v 2.4, ale stále nekalibrovaný experiment. Pro tvrzení o přesnosti chybí nezávislý validační dataset. |

## Zvažované, ale nepřidané

- Plný editor repertoárů, databáze mistrovských partií a sedmikamenové tablebase: větší samostatné datové/infrastrukturní funkce; osobní zahájení a varianty nenahrazují tyto databáze.
- Obecný konverzační AI trenér a lidsky hrající soupeř: nynější pravidlová vysvětlení a Stockfish nejsou tyto modely.
- Placené tarify, reklamy a trenérské účty: obchodní hypotézy, ne schválená implementace plateb či reklamního sledování.
- Dětské sociální funkce, GM příprava a veřejné srovnávání s vrstevníky: nebyly doloženy potřebné podklady ani model oprávnění.

Výzkum konkurence a odkazy jsou v [produktovém auditu](product-review-2026-10.md). Tato změna nepřidává externí služby ani nové placené výpočty.
