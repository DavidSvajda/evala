# Podklady pro Evala 2

Ověřeno 24. října 2026. Návrh rozlišuje pracovní potřeby začátečníka a pokročilého; nepředstírá lidskou trenérskou autoritu ani totožné odznaky jiných služeb.

- [Chess.com PubAPI a přihlašování](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it): veřejné API je pouze pro čtení. Autentizace uživatelů je samostatný schvalovaný přístup. V Evale je přezdívka importní údaj, nikoli důkaz vlastnictví účtu. Nevytváříme falešné tlačítko pro přihlášení přes Chess.com.
- [Google Identity Services – nastavení](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) a [ověřování ID tokenů](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token): webový Client ID, explicitně povolené originy, kontrola podpisu/audience/issuer/expirace a nonce. Evala nepotřebuje Google client secret, heslo, Gmail ani Drive přístup.
- [Lichess puzzle database](https://database.lichess.org/#puzzles): CC0, původní rating a motivy. První UCI tah v exportu je přípravný tah soupeře; hráč řeší teprve následující tah. Přibalený stratifikovaný výběr má 4 459 úloh, nikoliv celou databázi. Automatický test přehraje všechny jejich tahy.
- [Lichess API](https://lichess-org.github.io/api/): OAuth s PKCE je možný bez individuálního schvalování klienta. Pro tuto verzi byla uživatelem zvolena přednostně Google identita, proto Lichess zůstává zdrojem partií a úloh.
- [Chessigma](https://www.chessigma.com/): oddělení rozborů, tréninku a nástrojů, návrat k chybám a navázání tréninku na vlastní partie jsou užitečné produktové vzory. Nepřebíráme jejich grafiku, texty ani proprietární materiály.
- [Chessable](https://www.chessable.com/): inspirací je oddělený prostor pro opakování. Evala používá vlastní transparentní rozvrh opakování: chybná nebo odkrytá úloha se vrací po deseti minutách, samostatně vyřešená po dni a poté v delších intervalech. Netvrdíme shodu s jejich MoveTrainer algoritmem.

## Rozhodnutí

- Začátečník může před prvním pokusem zvolit počáteční úroveň 400–2 800, zobrazit legální tahy a použít nápovědu. Pokročilý má původní MultiPV, hloubku/čas/Hash, PGN, FEN, vlastní varianty a poznámky. Základní zobrazení omezuje počet viditelných variant, nikoliv kvalitu výpočtu.
- Hodnocení úloh je vlastní tréninkové hodnocení, nikoliv FIDE/Chess.com/Lichess Elo. Za nápovědu nebo odkryté řešení nelze získat body. Úlohy pro účet vybírá a vyhodnocuje server; opakované odeslání hotového řešení skóre nezvyšuje.
- Osobní pozice se odvozují jen z vlastních vyhodnocených chyb, při hloubce nejméně 14, s druhou variantou a zřetelným rozdílem. Nejednoznačné pozice nepoužíváme jako hádanku s jednou správnou odpovědí.
- Google účet odděluje knihovny jednotlivých lidí. Hostovská knihovna se nepřisvojí automaticky; uživatel ji může vědomě převzít. Server ověřuje vlastníka každého čtení a zápisu. Starší verze rozboru nemůže přepsat novější z jiného zařízení bez upozornění.
- Azure Container Apps má dočasný disk. Produkční účty proto vyžadují Azure Blob Storage nebo jinou trvalou implementaci document store; při chybějícím trvalém úložišti se veřejné přihlášení nepovolí.

## Co tato verze neslibuje

[Chess.com game rating](https://support.chess.com/en/articles/10773754-how-is-game-rating-calculated-in-game-review) závisí také na vlastním ratingu; přesná formule není veřejná. Evala používá vlastní nekalibrovaný odhad z kvality nejméně 12 neopakovaných, nevynucených rozhodnutí po zahájení při hloubce alespoň 12. Bez ratingu v PGN odhad nezobrazuje. Interval je orientační rezerva, nikoli statistický interval spolehlivosti. Počty odznaků a klasifikace se mohou hlubším výpočtem změnit.

Nejde o kompletní náhradu šachového serveru, kurzové knihovny Chessable ani milionové puzzle databáze. Neobsahuje smyšlené trenérské hodnocení, engine pomoc při hraní, komunitní žebříček, placené předplatné ani jazykový model vydávající domněnky za šachové důkazy.
