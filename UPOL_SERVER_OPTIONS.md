# Serverový rozbor Evala: UPOL, GitHub Student a skutečný výkon

Ověřeno 23. 10. 2026. Jde o veřejné nabídky a technické posouzení, nikoliv kontrolu přihlášeného účtu, přidělených kvót nebo naměřený výkon cloudu.

## Výsledek pro tento projekt

Nejprve ověřit osobní VM na KMI UPOL. Požadavek: studijní projekt analýzy šachových partií, Linux, 2–4 vCPU, 4–8 GiB RAM, přibližně 10 GB disku, HTTPS přístup a povolené krátké CPU náročné výpočty. To jsou požadované parametry aplikace, ne nárok potvrzený školou. Druhá cesta: Azure for Students a Container Apps Consumption 2 vCPU / 4 GiB s vypínáním při nečinnosti. Pro dlouhodobý akademický projekt zvážit MetaCentrum Cloud nebo CERIT-SC.

Plný Stockfish je zdarma; není důvod ho nahrazovat slabším enginem pouze kvůli licenci. Kvalitu při stejném enginu ovlivňuje čas, CPU, počet variant a kontrola kritických pozic. Dva virtuální procesory neznamenají dva výhradně rezervované fyzické procesory.

## Přímá nabídka KMI UPOL

Oficiální prezentace KMI má část „Osobní virtuální server“: studium, výuka, testování, bakalářské a diplomové práce; Windows/Linux, Hyper-V/VMware a admin/root práva. U celého virtualizačního clusteru uvádí 120 logických jader, přes 1 TB RAM a přes 20 TB SSD. Dokument neuvádí osobní kvótu ani jednoznačné datum, takže nejde o potvrzení aktuálně volných prostředků. Tato čísla nejsou kapacita, kterou by dostal jeden student.

Prezentace také uvádí společný studentský web/SSH server Phoenix a Azure Dev Tools for Teaching pro studenty KI. Společný webhosting není automatické povolení dlouho běžícího enginu. Pro Evala preferovat vlastní přidělenou VM a výslovně ověřit CPU politiku i veřejný přístup.

Zdroj: [Prezentace KMI, zejména strany 9–10 a 18–19](https://www.inf.upol.cz/downloads/studium/Ivo.pdf). Starší [webový inventář](https://www.inf.upol.cz/vypocetni-technika-na-katedre-informatiky) nelze brát jako aktuální konfiguraci clusteru.

## Microsoft účet není automaticky aktivní Azure předplatné

Studentská identita UPOL slouží k ověření; pro cloud potřebujeme aktivní předplatné Azure for Students, nikoliv jen přístup k Office/Teams. Microsoft nabízí 100 USD na rok bez karty a každoroční obnovu při trvajícím studentském statusu. Standardní nabídka vyžaduje věk 18+ a prezenční vysokoškolské studium podle podmínek Microsoftu. Zůstatek, datum aktivace a konkrétní dostupné služby ověřit až v účtu.

Zdroje: [Aktivace](https://azure.microsoft.com/en-us/free/students/), [nárok a obnova](https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students), [podmínky](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p/).

Školní ověření a cesta přes GitHub nejsou příslib dvou sčitatelných kreditů 100 USD. Nabídka je omezená na jedno studentské předplatné na oprávněného zákazníka. Microsoft má v dokumentaci Dev Tools různé historické informace; prakticky je rozhodující nabídka a aktivní předplatné zobrazené při přihlášení. Samotná softwarová licence Visual Studio z programu Dev Tools nepřináší měsíční Azure kredit běžného placeného Visual Studio Enterprise předplatného.

Zdroje: [Education FAQ](https://learn.microsoft.com/en-us/azure/education-hub/faq), [Visual Studio kredit podle programu — Dev Tools je vyloučen](https://learn.microsoft.com/en-us/visualstudio/subscriptions/vs-azure-eligibility).

## Přesnější posouzení hardwaru

| Varianta | Parametry / podmínky | Posouzení |
|---|---|---|
| Azure B2ats v2 | AMD EPYC 7763v, x86-64, 2 vCPU, 1 GiB RAM; základní výkon VM 20 %, CPU kredity pro burst | Na občasný osobní rozbor může stačit; málo RAM a dlouhá plná zátěž vyčerpá kredity |
| Azure B2pts v2 | Ampere Altra Arm64 3 GHz, 2 vCPU, 1 GiB RAM; základní výkon VM 20 %, burst | Podobné omezení; nativní Stockfish musí být sestavený pro Arm64 |
| Azure B2als v2 | 2 vCPU / 4 GiB RAM, základní výkon 30 % | Paměťově rozumnější; není to stejná bezplatná SKU jako B2ats a musí se zaplatit z kreditu podle regionální ceny |
| Azure Container Apps Consumption | Lze přidělit např. 2 vCPU / 4 GiB; platforma obecně nabízí 0,25–4 vCPU a 0,5–8 GiB na repliku | Preferovaná studentská cloudová zkouška; nelze slíbit konkrétní model fyzického CPU nebo čas rozboru |
| Heroku Basic | 0,5 GB RAM, sdílený CPU, 7 USD/měsíc | Ve studentském kreditu, ale slabší paměťový základ pro současný Full WASM backend |

Zdroje: [Basv2](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/basv2-series), [Bpsv2](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/general-purpose/bpsv2-series), [Container Apps profily](https://learn.microsoft.com/en-us/azure/container-apps/workload-profiles-overview), [Heroku specifikace](https://devcenter.heroku.com/articles/dyno-sizes).

Důležitá interpretace: 20% základní výkon u dvouvCPU B2ats je podle normalizace tabulky ekvivalent přibližně 0,4 trvale využitého vCPU při vyčerpaných kreditech, nikoliv dva stále plně výkonné procesory. Pro krátké výpočty po delším klidu může být burst dostačující. To není Stockfish benchmark ani tvrzení o přesném násobku zpomalení.

Studentská nabídka uvádí pro nové zákazníky na prvních 12 měsíců 750 hodin měsíčně jednotlivých vyjmenovaných VM B1s, B2ats v2 a B2pts v2. Neznamená to libovolnou dvoujádrovou VM zdarma; disky, síť, stav nabídky a region je třeba zkontrolovat zvlášť. Zdroj: [Přehled bezplatných služeb](https://azure.microsoft.com/en-us/free/students/).

Container Apps má měsíční kvótu 180 000 vCPU-sekund a 360 000 GiB-sekund. Při 2 vCPU / 4 GiB jde matematicky o 25 hodin účtovaného běhu při těchto přídělech, sdílených v rámci předplatného; starty a čas před uspáním se mohou do spotřeby promítnout. Nastavit min. 0 / max. 1 repliku. Registry, logy a další zdroje mají vlastní účtování. Zdroj: [Billing](https://learn.microsoft.com/en-us/azure/container-apps/billing).

## Akademický cloud: vybírat správnou třídu

MetaCentrum Brno G2 rozlišuje e1 s CPU overcommit 1:8, g2/c2 s 1:2 a c3/p3 s 1:1. Pro CPU náročný engine žádat odpovídající compute třídu; počet vCPU bez informace o sdílení nestačí. Dostupnost konkrétní třídy závisí na projektu a kvótě. Zdroj: [Flavors](https://docs.platforms.cloud.e-infra.cz/en/docs/iaas-cloud/technical-reference/brno-g2-site/flavors).

CERIT-SC dokumentuje například uzly kubh se dvěma AMD EPYC 7543 a 512 GB RAM. To dokládá infrastrukturu, ne osobní přidělení celého uzlu. Pro nás by šlo o omezený CPU/RAM požadavek pro kontejner. Zdroj: [Hardware](https://docs.cerit.io/en/docs/platform/hw). Bezplatný přístup má akademické/vzdělávací podmínky a režim best effort: [podmínky](https://docs.cerit.io/en/docs/platform/access).

## Co znamená skoro stejné Game Review

Chess.com uvádí serverový Game Review s plným Stockfishem 18; běžná Self Analysis může běžet lokálně. Evala již má Full Stockfish 19 a vzdálené API, takže engine nemusíme oslabovat. Zdroj: [Jak počítá Chess.com](https://support.chess.com/en/articles/9462780-how-do-the-chess-engines-on-chess-com-work), [Stockfish 19](https://stockfishchess.org/blog/2026/stockfish-19/).

Shodný engine ale nedává shodný produkt: Chess.com používá vlastní model hodnocení tahů závislý na ratingu a další pravidla. Vlastní Accuracy/brilliant klasifikace Evala není jejich oficiální výstup. Kouč, retry režim a některé speciální štítky nejsou v současné Evala hotovou kopií Game Review. Zdroj: [Klasifikace](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc).

## Stav našeho kódu a další postup

- V režimu server aplikace používá RemoteEngine a nevytváří lokální Stockfish Worker. Zařízení stále vykresluje desku a zpracovává lehkou aplikační logiku.
- Výchozí backend dnes spouští jednovláknový Full WASM přes Node. Samotné přidělení dvou vCPU jej neudělá dvouvláknovým.
- `server/worker.mjs` již podporuje nativní binárku přes STOCKFISH_PATH a ENGINE_THREADS. Pro zvolený Linux/architekturu nainstalovat správný nativní Stockfish, nastavit dva threads při dvou přidělených vCPU a jeden současný engine slot.
- Rozbor je zatím řízený otevřenou aplikací po pozicích. Odolný serverový job, který dokončí celou partii po zavření karty, vyžaduje další implementaci.
- Pro kvalitní produkt navíc doplnit sdílenou cache výsledků, odolné serverové úlohy, vysvětlení konkrétních motivů a opakování chyb; nemaskovat je tvrzením, že vše již funguje 1:1.
- Před výběrem hostingu změřit stejné PGN: první start, celkový čas, dosaženou hloubku, NPS, maximální paměť a chování při přerušení. Měřit také opakovaný běh a několik partií za sebou, aby se projevily CPU kredity.

První konkrétní krok: v Azure portálu ověřit existenci předplatného „Azure for Students“, zůstatek kreditu a přidělené regiony. Souběžně ověřit u správce KI aktuální dostupnost osobní Linux VM a podmínky provozu této aplikace. Přihlašovací hesla ani API tajemství se neposílají do chatu.
