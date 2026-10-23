# Hosting a distribuce Evala — rešerše 21. 10. 2026

Aktualizace 22. 10. 2026: podrobné ověření GitHub Student, Azure, Heroku a dalších free tarifů je v [STUDENT_HOSTING_RESEARCH.md](./STUDENT_HOSTING_RESEARCH.md).

Aktualizace 23. 10. 2026: [UPOL_SERVER_OPTIONS.md](./UPOL_SERVER_OPTIONS.md) obsahuje konkrétnější podklad KMI k osobním VM a porovnání skutečných CPU/RAM parametrů.

## Doporučení pro tento projekt

Pro osobní použití nejdřív používej přibalený plný Stockfish 19. Není potřeba placený server a výpočet nečeká ve sdílené frontě. Pokud chceš výpočet přesunout mimo vlastní počítač, má projekt připravené HTTP API se streamováním výsledků a Docker. Veřejné nasazení ale vyžaduje konkrétní účet, schválené prostředky a HTTPS adresu; nic z toho nelze garantovat jen tím, že máš univerzitní e-mail.

Pro průběžný rozbor se hodí dlouho běžící VM nebo kontejner s vyhrazeným CPU. Gridová dávková fronta může čekat na přidělení uzlu, a proto není vhodná pro okamžité interaktivní hodnocení. Dostupnost serveru sama o sobě nezajišťuje silnější analýzu než na notebooku; rozhoduje engine, skutečně dostupný procesor a rozpočet na pozici.

## A. UPOL a česká akademická infrastruktura

### MetaCentrum / e-INFRA CZ

Univerzita Palackého v Olomouci je členem CESNET. MetaCentrum umožňuje bezplatnou registraci studentům a zaměstnancům českých akademických institucí pro výzkumné a vzdělávací účely. Žádosti se ručně schvalují; oficiální dokumentace uvádí několik pracovních dnů. Nejde o obecný nárok na bezplatný komerční hosting.

Zdroje: [Členové CESNET](https://www.cesnet.cz/o-nas/clenove-sdruzeni), [Registrace a podmínky](https://docs.metacentrum.cz/en/docs/access/account), [Pravidla použití](https://www.metacentrum.cz/cs/about/rules/).

**MetaCentrum Cloud / Brno G2** nabízí virtuální servery. Osobní projekt je dostupný uživatelům MetaCentra pro testování a poznávání cloudu, je dočasný a prostředky mohou být přibližně dvakrát ročně resetovány. Pro dlouhodobé použití dokumentace požaduje skupinový projekt s popisem účelu, organizace, odpovědné osoby, výkonu a délky provozu. Výchozí tabulka kvót uvádí 3 instance, 8 CPU jader a 20 500 MB RAM; tabulku nelze považovat za osobní příslib rezervovaného výkonu. Skutečnou přidělenou kvótu ověř v konzoli a u podpory.

Zdroje: [Získání přístupu](https://docs.platforms.cloud.e-infra.cz/en/docs/iaas-cloud/technical-reference/brno-g2-site/get-access), [Výchozí kvóty](https://docs.platforms.cloud.e-infra.cz/en/docs/iaas-cloud/technical-reference/brno-g2-site/quota-limits).

**CERIT-SC Kubernetes** podporuje vlastní Docker kontejnery i vystavení webových aplikací. Základní projekty lze podle dokumentace založit po přihlášení; intenzivnější využití potřebuje žádost o kvótu. Bezplatná služba je pro akademické nebo nekomerční instituce v ČR s výzkumným či vzdělávacím účelem a je poskytována bez garance dostupnosti. Pro studijní projekt o šachových enginech je to technicky vhodná varianta, ale konkrétní použití musí odpovídat pravidlům a přiděleným prostředkům.

Zdroje: [Platforma](https://docs.cerit.io/en/docs/platform/overview), [Přístup a podmínky](https://docs-ng.cerit.io/en/docs/platform/access).

### Zdroje přímo na UPOL

Katedra informatiky veřejně uvádí hostování virtuálních serverů, výpočetní servery na žádost a studentské webové servery. Uvedené konfigurace a operační systémy jsou zjevně starší; z webu nelze potvrdit aktuální nárok, volný výkon, pravidla nepřetržitého CPU zatížení ani možnost veřejného API. Webhosting Apache/PHP automaticky neznamená povolený dlouho běžící Stockfish nebo Docker.

Praktický další krok je dotaz na správce KMI, případně CVT UPOL, s tímto konkrétním požadavkem: studijní/experimentální projekt, Linux VM nebo kontejner, 2 vyhrazené vCPU, alespoň 2 GB RAM (pohodlněji 4 GB), 2–5 GB disku, HTTPS, krátké CPU náročné rozbory na vyžádání. Je to návrh požadavků aplikace, nikoliv potvrzená univerzitní nabídka. Zprávu za tebe nikdo neodeslal.

Zdroj: [Výpočetní technika KMI UPOL](https://www.inf.upol.cz/vypocetni-technika-na-katedre-informatiky).

## B. Ostatní bezplatné možnosti

| Služba | Ověřený stav | Vhodnost pro tento engine |
|---|---|---|
| Oracle Cloud Always Free A1 | Dokumentace aktuálně uvádí 1 500 OCPU hodin a 9 000 GB hodin měsíčně, tj. 2 OCPU a 12 GB RAM pro Always Free tenancy | Rozumné pro osobní server, pokud je volná kapacita. ARM funguje s Node/WASM; lze použít i odpovídající nativní engine. |
| CERIT-SC / MetaCentrum Cloud | Akademické použití zdarma podle účtu, pravidel a přidělených kvót | Nejzajímavější akademická cesta pro tento projekt. |
| Render Free web service | Uspání po 15 minutách nečinnosti, probuzení přibližně minutu; omezení bezplatné instance a dočasný disk | Použitelné pro demo API, ale nevhodné pro požadavek okamžité odezvy bez studeného startu. |
| Cloudflare Workers Free | 10 ms CPU na požadavek, 128 MB paměti | Pro plný Stockfish a sekundové výpočty nevyhovuje. |
| Statický hosting + engine u uživatele | Server pouze doručí HTML/JS/WASM | Bezplatný a škálovatelný způsob distribuce; CPU stále poskytuje uživatel. |

U Oracle mohou chybět volné A1 instance a neaktivní Always Free stroje mohou být odebrány. Starší návody často uvádějí 4 OCPU / 24 GB; aktuálně otevřená dokumentace výslovně uvádí 2 / 12. Vždy zkontroluj podmínky a kvóty svého konkrétního účtu a neaktivuj placené prostředky omylem. Dostupnost a výkon nebyly na reálné bezplatné instanci benchmarkovány.

Zdroje: [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Render Free](https://render.com/docs/free), [Cloudflare Workers limity](https://developers.cloudflare.com/workers/platform/limits/).

### Pozor na velikost plného enginu

Cloudflare Pages má limit 25 MiB na jeden soubor. Přibalený plný Stockfish WASM má přibližně 99 MB a v tomto sestavení se tam nevejde jako jediný soubor. Lite verze se vejde, ale plnou variantu by bylo nutné rozdělit kompatibilním buildem nebo hostovat jinde. Zde dodaný Docker/VM server tento limit nemá. [Cloudflare Pages limity](https://developers.cloudflare.com/pages/platform/limits/).

## C. Jak dlouho potrvá rozbor

První průchod pro 40 tahů obou hráčů znamená přibližně 81 pozic. Při profilu 0,75 s/pozici je samotný součet časových rozpočtů asi 61 sekund. Aplikace navíc ověřuje nejvýše 8 kritických momentů (dvě pozice na moment) a nejvýše 6 kandidátů na oběť. Může to přidat další desítky sekund. Je to odhad z nastavených limitů, nikoliv garance konkrétního zařízení.

Rychlý profil má 0,3 s/pozici, vyvážený 0,75 s a důkladný 2 s. Max. hloubka je další horní limit, takže výpočet může skončit dříve. Vyšší počet variant dělí práci mezi více pokračování. První výsledky se ukazují okamžitě po hotových pozicích, výpočet lze přerušit a stejným profilem pokračovat z uložené části. Rozebírá se vybraná partie; import 20 partií nespouští automaticky 20 náročných rozborů.

Server přijímá pozice a vrací proud NDJSON, nečeká s celým výsledkem na dokončení partie. Má omezený počet současných enginů a při obsazení vrací HTTP 429; nevytváří neomezenou frontu na hodiny. Veřejná aplikace s více uživateli bude potřebovat rozpočty na uživatele, správu účtů nebo více výkonu. Zdarma nelze slíbit neomezené souběžné kvalitní rozbory.

## D. Chrome Web Store

Publikování je samostatný krok po sestavení; server pro lokální rozšíření není potřeba. Potřebuješ Google vývojářský účet, jednorázový registrační poplatek a zapnuté dvoufázové ověření. Oficiální registrační text, který byl otevřen při této rešerši, neurčuje částku; aktuální částku ukáže registrace. [Registrace](https://developer.chrome.com/docs/webstore/register), [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification).

Postup: nahrát ZIP s `manifest.json` v kořeni, vyplnit název/popis, ikony a screenshoty, zásady soukromí na veřejné adrese, jednotný účel a skutečné zacházení s daty, zdůvodnit oprávnění a dodat testovací postup. Potom odeslat ke kontrole a počkat na rozhodnutí. Google uvádí maximum 2 GB na balík; plný engine se do limitu vejde. Schválení ani dobu kontroly nelze garantovat. [Oficiální publikování](https://developer.chrome.com/docs/webstore/publish).

Po instalaci ze Storu Chrome spravuje vlastní kopii a aktualizace; uživatel nemusí uchovávat rozbalenou složku `dist`. Pro instalaci přes „Načíst rozbalené“ je zachování složky stále nutné. Aktualizace se publikují pod stejným ID se zvýšeným číslem verze. Připravené podklady jsou v `STORE_LISTING.md`; účet, platba ani zveřejnění nebyly provedeny.
