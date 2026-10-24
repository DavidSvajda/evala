# Soukromí v Evale

## Režim hosta a místní rozšíření

Malé rozšíření s evaluation barem počítá přes lokální Stockfish. Neodesílá pozice na server a nepoužívá účet. Webovou knihovnu a trénink lze používat také bez přihlášení; v takovém případě zůstávají uložené v prohlížeči. Vymazání dat webu může tuto místní knihovnu odstranit.

## Import a výpočet

Import veřejných partií kontaktuje API Chess.com nebo Lichess. Služba uvidí požadovanou přezdívku a síťový požadavek. Evala nevyžaduje heslo k šachovému účtu. Samotné zadání přezdívky neověřuje vlastnictví profilu.

Při serverovém rozboru se posílá PGN včetně hlaviček, tahů a případných hodin. Při samostatném výpočtu pozice se posílá FEN, historie a nastavení. Veřejné výpočty používají technickou HttpOnly cookie s platností osm hodin pro frontu a kvóty. Probíhající rozbor vyžaduje otevřenou kartu.

## Google účet

Přihlášení je dobrovolné. Google poskytne potvrzení identity, jméno a e-mail. Evala nedostává heslo, přístup ke Gmailu, Disku ani jiným dokumentům. Google přihlašovací knihovna se načte při otevření přihlašovací stránky. Podpis, příjemce, vydavatel, expirace a jednorázová nonce potvrzení se kontrolují na serveru.

U přihlášeného účtu se na serveru ukládají identifikátor účtu, jméno, e-mail, přezdívka z nastavení, knihovna partií, rozbory, poznámky, nastavení vzhledu a historie tréninku. Produkční uložiště je soukromý Azure Blob Storage. Každý účet má oddělené záznamy. Přihlašovací cookie je HttpOnly a platí nejvýše 30 dní; server ukládá pouze hash její náhodné hodnoty. Uživatel se může odhlásit.

Hostovská knihovna a knihovny jednotlivých účtů jsou v prohlížeči oddělené. Převzetí místních partií do účtu je výslovná akce. Při výpadku připojení zůstane místní kopie; rozpracovaný rozbor může čekat na synchronizaci do dokončení.

## Export a smazání

Jednotlivé partie lze exportovat do PGN a smazat v knihovně. V části Můj účet lze exportovat osobní data do JSON a smazat účet včetně uložených partií a historie tréninku. Smazání účtu Evaly nemaže účet u Googlu ani veřejné partie u jejich původního poskytovatele. Místní hostovská data se mažou samostatně vymazáním dat webu.

## Vlastní server a rozšíření

Plné rozšíření může po povolení uživatelem využít vlastní server. API token zůstává v sessionStorage karty, případně v dočasném chrome.storage.session rozšíření do restartu prohlížeče. Nepředává se herní stránce. Host přístup se vyžádá až při ověření spojení.

Evala neobsahuje reklamní sledování ani analytické měřicí skripty. Provozní záznamy poskytovatele hostingu a požadavky Google/Chess.com/Lichess se řídí také pravidly příslušné služby. Úlohy Lichess jsou otevřená data CC0; odkazy na původní partie se zobrazují po vyřešení.
