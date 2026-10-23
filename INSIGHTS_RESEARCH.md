# Rozhraní a hráčské přehledy — 23. října 2026

## Podklady

- [Chess.com Insights](https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com): přehledy výsledků, zahájení, fází hry, kvality tahů, figur a času. Podporuje smysluplnost filtrů a rozdělení výsledků, nikoli kopírování neveřejné klasifikace.
- [Chessigma](https://www.chessigma.com/): import Chess.com/Lichess/PGN, skóre tahů, varianty, graf a přehrávání na desce. Jeho vlastní stránka uvádí lokální výpočet. Evala může výpočet přesunout na osobní server.
- [Chessvision Insights](https://chessvision.ai/docs/library/insights/): přechod od nalezených slabin ke konkrétním pozicím a procvičení.
- [Lichess Insights](https://lichess.org/insights/LazyBot): kombinování metrik, filtrů a vzorků partií.

## Co implementuje verze 1.2

Samostatný Přehled hráče používá lokální knihovnu, jméno v PGN, barvu, tempo a výsledek. Ukazuje výsledky, skóre tahů, zahájení, chyby podle fáze, kvalitu tahů, proměňování výhod, způsob zakončení a odkazy na největší vlastní chyby. Při dostupných PGN hodinách přidá přehled chyb v časové tísni. Nevyžaduje placené AI API. Interpretace jsou výpočty a pravidla nad skutečnými daty, nikoli komentář LLM.

Výsledkové statistiky zahrnují jen dokončené partie daného hráče. Hodnocení tahů zahrnuje jen hotové výpočty a uvádí pokrytí. Skóre výsledků počítá remízu jako půl bodu. Nezaměňuje jej za procento výher. Vzorky zahájení pod tři partie se označují jako malé. Chybějící údaj o zahájení se nahradí skutečnou tahovou řadou, nikoli vymyšleným názvem.

Fáze: koncovka při nejvýše 26 bodech zbývajícího materiálu bez pěšců a králů (N/B=3, R=5, Q=9). Jinak zahájení do 10. tahu, následně střední hra. Jde o zveřejněnou heuristiku, nikoli přesný přechod všech pozic. Proměnění výhody: výhra v partii, kde některá vyhodnocená pozice před vlastním tahem měla alespoň +2,0 z pohledu hráče. Částečný rozbor může výhodu přehlédnout. Časová tíseň se určuje podle času po tahu, proto neprokazuje příčinu chyby.

Neimplementuje automatické slovní vysvětlení motivů, rozpoznávání všech vidliček/vazeb, porovnání s hráči podobného ratingu, úplnou databázi zahájení ani trvalé serverové úlohy po zavření karty. Tyto schopnosti se v UI neslibují.

## Audit textů

| Původní text | Změna | Důvod |
| --- | --- | --- |
| Prostor pro tvoje další zlepšení. | Vyber partii | Neurčitý marketingový slogan nahradila konkrétní akce. |
| Importuj partii a najdi tahy, které ji rozhodly. | Odstraněno | Duplicitní úvod vedle importu. |
| Po rozboru tu uvidíš zvraty a rozhodující momenty. | Graf se zobrazí po rozboru. | Konkrétní prázdný stav. |
| Lokální knihovna. Otevřené enginy. Žádné předplatné. | Stockfish 19 · knihovna v prohlížeči | Reklamní rytmus nahradila provozní informace. |
| Engine vyhodnotí každý tah a nabídne pokračování. | Vyber tah nebo spusť rozbor. | Pokyn v místě, kde jej hráč potřebuje. |

Z původního stylu nelze prokázat autorství AI. Audit označuje vágní nebo zbytečně reklamní formulace, nikoli jejich původ. Faktická upozornění na vlastní klasifikaci a chybějící data zůstávají dohledatelná.
