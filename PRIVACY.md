# Zásady soukromí Evala

Rozšíření čte aktuální šachovou pozici na Chess.com a Lichess, aby ji mohlo vyhodnotit. Podle dostupnosti používá FEN z herního rozhraní, viditelné figury a seznam tahů.

Výpočet ve výchozím lokálním režimu provádí přibalený Stockfish v prohlížeči. V tomto režimu se pozice, tahy ani hodnocení neposílají na výpočetní server. Rozšíření neobsahuje analytiku, reklamy, účty ani vzdáleně načítaný spustitelný kód.

Do lokálního úložiště ukládá nastavení a do IndexedDB knihovnu importovaných partií a jejich rozborů. Import podle username kontaktuje veřejné API Chess.com nebo Lichess; poskytovatel vidí požadavek a veřejné jméno. Heslo k šachovému účtu se nevyžaduje.

Při výslovném zvolení vlastního serveru se na uživatelem zadanou adresu posílají FEN pozice, historie tahů a parametry výpočtu. API token se uchovává v sessionStorage aktuální karty, nikoli v exportu. Zapneš-li server také pro evaluation bar, token se uloží i do dočasného chrome.storage.session rozšíření do restartu prohlížeče; není předáván herní stránce. Dodaný backend partie neukládá. Za případné logování cizího serveru odpovídá jeho provozovatel.

Oprávnění `storage` slouží k nastavení a `offscreen` ke spuštění lokálního enginu v neviditelném dokumentu. Výchozí hosty jsou Chess.com, api.chess.com a Lichess. Přístup k jinému výpočetnímu serveru je volitelný a vyžaduje povolení uživatele v prohlížeči. Partie lze smazat jednotlivě v knihovně a exportovat do PGN.

Kód knihoven, fonty a engine jsou přibalené. Externí odkazy v dokumentaci se otevírají až při kliknutí uživatele.
