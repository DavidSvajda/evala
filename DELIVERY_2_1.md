# Evala 2.1 — cílené dokončení

Nasazovaný celek bez dalších agentů a bez rozsáhlé screenshotové matice:

1. **Vysvětlení chyb:** skutečná odpověď soupeře z PV enginu, šach/mat nebo braní a lepší vlastní varianta. Žádné nepodložené strategické sliby.
2. **Osobní lekce:** šest pozic na přibližně deset minut, vlastní ověřené chyby, související taktika a splatné opakování. Postup se ukládá lokálně a k přihlášenému účtu. Spuštění z přehledu i shrnutí partie. Výběr respektuje cíl tréninku; lekce nepřidává ratingové body.
3. **Úvodní nastavení:** veřejný Chess.com profil nebo URL, počáteční úroveň před prvním pokusem, tréninkový cíl, možnost přeskočit a vrátit se. V nastavení funguje propojení profilu a načtení jeho partií. PubAPI pouze čte veřejná data a neověřuje vlastnictví účtu; přihlášení zůstává přes Google. Zdroj: https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it.
4. **Kalibrace Elo — připravená, dosud nedokončená:** `node scripts/calibrate-performance.mjs export.json report.json chesscom blitz`. Používá místní export účtu, odděluje poskytovatele/tempo i hráče v trénovací a kontrolní sadě, vyžaduje nejméně 200 pozorování a 50 hráčů. Vypisuje pouze souhrnné metriky; data neodesílá. Kontroluje chybu vůči jednoduchému výchozímu modelu. Potřebuje reprezentativní skutečné rozbory a následné ověření a zapojení modelu. Současný herní odhad zůstává výslovně nekalibrovaný; rating hráče není nezávislá pravda o výkonu jediné partie.
5. **Provoz:** GitHub sestavení před publikováním vždy spouští krátký browser průchod. V Azure byla ověřena sedmidenní ochrana smazaných blobů i kontejnerů; skutečná obnova dočasného blobu prošla. Dokumentace soukromí informuje o retenční lhůtě. Opakovatelná zkouška obnovy: `node scripts/protect-storage.mjs`. Nastavení ochrany je součástí `scripts/azure-storage.py --apply`.

## Úsporné ověření

- Pouze cílené testy lekcí, veřejných profilů, nového serverového vyhodnocení a vysvětlení tahů.
- Jeden krátký browser scénář: nastavení → propojení profilu → vyřešení úlohy v lekci → obnovení postupu → mobilní angličtina. Odpověď profilu v automatickém testu je fixture.
- Původní rychlé jednotkové testy zůstávají v CI. Žádné velké dávky rozborů, nové agenty nebo opakované vizuální audity.

## Obnova dat

Obnova blobu přes Azure `Undelete` je dostupná v sedmidenní lhůtě. Přepsané dokumenty mají obnovovací kopie; jejich obnova vyžaduje zvolení správné kopie a konzistentní obnovu indexu účtu a jeho partií. Neobnovovat sessions smazaného účtu; při obnově profilu vždy změnit authEpoch na nové náhodné UUID, aby se staré sessions znovu nezplatnily. Před obnovou uživatelských dat zastavit souběžné zápisy a zkontrolovat stav v odděleném prostoru. Ochrana je v témže účtu Azure Storage, nikoliv nezávislá záloha proti ztrátě celého úložiště. Ověřena byla obnova dočasného souboru, nikoliv hromadná obnova produkčních účtů.

## Další krok

Doplnit vhodná data a ověřit kalibraci, případně navázat skutečné Chess.com OAuth po získání podporovaného přístupu. Google přihlášení a propojení veřejného šachového profilu jsou oddělené funkce.

## Nasazení

Verze 2.1.0 je nasazená na https://evala.bravestone-92178a1e.germanywestcentral.azurecontainerapps.io/study.html#/home. Image `ghcr.io/davidsvajda/evala@sha256:78ec09dfdc056b711364192d19d0b125740d0500d9f7ebb62fbc12f3ece026b2` sestavil a ověřil GitHub Actions běh 40208698307 (kód bf0d628). Krátký průchod onboarding → lekce → uložený postup → profil → mobilní angličtina prošel také na produkční adrese; veřejný profil v tomto automatickém scénáři používá fixture. Reprezentativní kalibrační data a aktivace modelu zůstávají dalším krokem.
