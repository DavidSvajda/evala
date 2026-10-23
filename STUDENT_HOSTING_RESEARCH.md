# Bezplatný hosting Evala s GitHub Student — 22. 10. 2026

Aktualizace 23. 10. 2026: [UPOL_SERVER_OPTIONS.md](./UPOL_SERVER_OPTIONS.md) doplňuje přímou nabídku osobních VM KMI, přesné parametry Azure B2ats/B2pts a posouzení cílové kvality rozboru.

Rešerše vychází z veřejných oficiálních nabídek. Nárok konkrétního účtu, dříve využité benefity, regionální kvóty a dostupnost kapacity nejsou ověřeny v přihlášených konzolích. Žádná služba nebyla objednána ani nasazena. Hodnocení vhodnosti pro Evala je technický odhad, nikoliv benchmark daného hostingu.

## Doporučení

Pro web s klientským Stockfishem použít GitHub Pages. Pro osobní serverové rozbory nejprve aktivovat Azure for Students a ověřit dostupnost Azure Container Apps Consumption v daném předplatném a regionu. Pro trvalejší akademický provoz žádat MetaCentrum Cloud nebo CERIT-SC s pravdivě popsaným vzdělávacím/výzkumným účelem. Pokud akademický přístup nevyjde, zkusit Oracle A1 Always Free. Heroku Student je použitelná alternativní nabídka, ale levné dyno má málo RAM a sdílený CPU.

## Nabídky GitHub Student

### Azure for Students

- Kredit 100 USD platný 12 měsíců, bez platební karty. Microsoft uvádí možnost každoroční obnovy a dalších 100 USD při trvajícím studentském statusu.
- Standardní nabídka je pro studenty VŠ od 18 let s ověřeným statusem; není zaměnitelná s omezenou variantou Students Starter.
- Podmínky uvádějí deaktivaci předplatného po vyčerpání kreditu. Přechod na Pay-As-You-Go mění režim účtování.
- Kredit není příslib ročního nepřetržitého provozu libovolně velkého serveru. Vedle CPU se mohou účtovat disky, registry, síť, logy a další prostředky.

Zdroje: [Nabídka](https://azure.microsoft.com/en-us/free/students), [obnova kreditu](https://learn.microsoft.com/en-us/azure/education-hub/find-ids), [podmínky a vyčerpání](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p/).

**Container Apps Consumption:** každý měsíc na předplatné prvních 180 000 vCPU-sekund, 360 000 GiB-sekund a 2 miliony HTTP požadavků zdarma. Matematicky odpovídá CPU kvóta 50 hodinám přiděleného 1 vCPU; při 2 GiB je paměťová kvóta také 50 hodin. Není to 50 hodin bezplatně rezervovaného serveru každý den ani garantovaný počet rozborů. Účtuje se přidělený výkon po dobu běhu podle stavu replik; starty a jiné prostředky mohou spotřebu zvýšit.

Pro první test Evala navrhuji 1 vCPU, 2 GiB RAM, minimum replik 0, maximum 1, jeden engine slot, token a jeden současný požadavek. Jsou to počáteční parametry k měření. Výkon porovnat na stejném PGN a stejném rozpočtu se současným lokálním rozborem. Před nasazením zkontrolovat dostupnost služby v předplatném a cenu registru/logů; samotný studentský účet negarantuje všechny SKU.

Zdroj: [Účtování Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/billing).

Bezplatné malé Azure VM řady B jsou burstable: při vyčerpání CPU kreditů zpomalí na základní výkon. Hodí se spíš na krátké občasné výpočty než na dlouhý nepřetržitý Stockfish. Zdroj: [CPU kreditový model](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/b-series-cpu-credit-model).

### Heroku Student

- 13 USD měsíčně po 24 měsíců; nevyužitá měsíční část se nepřevádí a program není opakovatelný.
- Vyžaduje platební kartu; spotřeba nad kredit se účtuje. Kredit neplatí na doplňky třetích stran.
- Basic dyno stojí 7 USD/měsíc, běží stále, má 0,5 GB RAM a sdílený CPU. Eco stojí 5 USD za pool 1000 hodin a uspává se po 30 minutách nečinnosti.
- Evala nepotřebuje placenou databázi: knihovna je nyní lokálně v prohlížeči. Basic tedy cenově vejde do benefitu. Nelze ale slíbit, že aktuální Full WASM backend bezpečně vejde do 0,5 GB a bude rychlejší než notebook. Před doporučením pro reálný provoz změřit RSS pod limitem, případně použít podporovaný nativní Stockfish a menší Hash.

Zdroje: [Student offer a pravidla](https://www.heroku.com/github-students/), [ceny](https://www.heroku.com/pricing/), [sdílený CPU a RAM](https://devcenter.heroku.com/articles/dyno-sizes).

### Další benefity Packu

Aktuální katalog uvádí Appwrite Education na šest měsíců, Camber s 40 CPU hodinami měsíčně, Pro přístup ke Codespaces a registraci domény .me u Namecheap na rok. Appwrite je zajímavý pro účty/databázi, Camber pro experimenty a dávky; není doloženo, že některá z těchto nabídek přímo nahrazuje náš stále běžící Node API server. Doména nedodává výpočetní výkon a po prvním roce může mít placenou obnovu.

DigitalOcean v aktuálním katalogu nebyl nalezen a stará studentská URL přesměrovává na homepage. Starý studentský kredit proto nelze považovat za aktuálně dostupný benefit. Případný již přiznaný kredit ověřit v účtu. Railway také nebylo v katalogu nalezeno.

Zdroje: [Aktuální GitHub Student Pack](https://education.github.com/pack), [původní DigitalOcean URL](https://www.digitalocean.com/github-students).

Codespaces použít na vývoj/testování: standardně timeout po 30 minutách neaktivity, dokumentovaná maximální nepřerušená životnost běhu 12 hodin. Zdroj: [Lifecycle](https://docs.github.com/en/codespaces/about-codespaces/understanding-the-codespace-lifecycle).

## Další cloudové možnosti

| Služba | Veřejně ověřená bezplatná nabídka | Posouzení pro Evala |
|---|---|---|
| MetaCentrum Cloud | Akademický přístup pro vzdělávání/výzkum zdarma; dlouhodobá VM má být ve skupinovém projektu | Dobrá cesta pro schválený projekt, žádat např. 2 vCPU a 2–4 GB RAM; přidělení není automatické |
| CERIT-SC | Akademické/nekomerční instituce v ČR, výzkumný/vzdělávací účel, best effort | Vhodné pro vlastní Docker kontejner po získání přístupu a kvóty |
| Oracle A1 Always Free | 1500 OCPU hodin a 9000 GB hodin/měsíc, ekvivalent 2 OCPU / 12 GB RAM | Zajímavá osobní VM; kapacita může chybět a neaktivní instance mohou být odebrány |
| Google Cloud Run | Request-based free tier: 180 000 vCPU-s, 360 000 GiB-s a 2 miliony požadavků/měsíc, sleva podle Tier 1 cen | Dobré pro občasný kontejnerový výpočet; billing účet, další poplatky a starty je nutné zahrnout |
| Northflank Sandbox | Dvě bezplatné služby, jedna databáze, dvě cron úlohy; deklaruje provoz bez uspávání | Kandidát na pokus; konkrétní bezplatné CPU/RAM ověřit v konzoli, nejsou zde zaměněny s placenými compute plány |
| Render Free | Webová služba zdarma; po 15 minutách neaktivity se uspí, start přibližně minutu | Spíš demonstrační API než okamžitý rozbor |
| Koyeb Free | Jedna instance, 0,1 vCPU, 512 MB RAM, 2 GB SSD; po hodině neaktivity scale-to-zero | Výrazně omezené CPU a RAM pro Full engine; hlavně demo |
| Railway Free | 1 USD kreditu/měsíc, nejvýše 0,5 GB RAM a 1 vCPU na službu | Malý rozpočet a paměť, nevhodné jako hlavní rychlý engine |
| Fly.io trial | Dvě VM hodiny nebo sedm dní, podle toho, co nastane dříve | Jen krátký test, ne dlouhodobě bezplatný hosting |

Zdroje k řádkům:

- [MetaCentrum účet](https://docs.metacentrum.cz/en/docs/access/account), [dlouhodobý projekt](https://docs.platforms.cloud.e-infra.cz/en/docs/iaas-cloud/technical-reference/brno-g2-site/get-access).
- [CERIT podmínky](https://docs.cerit.io/en/docs/platform/access).
- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
- [Cloud Run ceny](https://cloud.google.com/run/pricing), [účtování a CPU jen při požadavku](https://docs.cloud.google.com/run/docs/configuring/billing-settings).
- [Northflank](https://northflank.com/pricing).
- [Render](https://render.com/docs/free).
- [Koyeb parametry](https://www.koyeb.com/docs/reference/instances).
- [Railway plány](https://docs.railway.com/pricing/plans).
- [Fly trial](https://fly.io/docs/about/free-trial/).

Cloud Run lze pro tento API model zkusit s min. 0 / max. 1 instancí, request-based billing a jedním enginem; první start může přidat prodlevu. Limit instancí sám nezaručí nulový účet. Google výslovně upozorňuje, že rozpočty nastavené pouze pro upozornění automaticky nezastavují útratu. Zdroj: [Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets).

## Pouze veřejný web: klientský výpočet

- GitHub Pages: zdarma z veřejného repozitáře, publikovaný web do 1 GB, měkký limit přenosu 100 GB/měsíc. Je to hosting souborů, ne CPU pro serverový engine. Současný Full WASM má přibližně 99 MB, takže studená návštěva přenáší značný objem; cache a počet návštěv je třeba zahrnout. [Limity](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- Netlify Free: aktuálně 300 kreditů měsíčně s pevným limitem. Alternativa pro statický frontend, u velkého WASM hlídat přenosy. Podmínky starších účtů se mohou lišit. [Credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).
- Cloudflare Pages: limit jednoho souboru 25 MiB, takže současný přibližně 99MB Full WASM nejde nahrát beze změny. Je třeba engine rozdělit nebo hostovat velký soubor zvlášť s odpovídajícím CORS/CSP. [Limity](https://developers.cloudflare.com/pages/platform/limits/).

## Co zvolit pro tento projekt

1. Veřejný web bez účtu za CPU: GitHub Pages a současný klientský Full engine.
2. Studentský osobní server: Azure for Students + test Container Apps Consumption, měřit start a jednu skutečnou partii.
3. Dlouhodobý akademický server: žádost MetaCentrum/CERIT, pravdivý účel a rozumná kvóta.
4. Samostatná bezplatná VM: Oracle A1, pokud je kapacita a účet přijme registraci.

Žádný cloudový čas rozboru není zatím změřen. Lokální výsledek přibližně 28 sekund nelze převzít jako slib pro tyto služby. Srovnávat stejné pozice, engine, MultiPV a dosaženou hloubku; při pevném čase slabší CPU vrátí mělčí analýzu. Pro sílu Stockfishe zde řešíme CPU a RAM, GPU není součástí stávající architektury.
