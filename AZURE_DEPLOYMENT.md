# Evala na Azure

Zdrojový repozitář: soukromý `DavidSvajda/evala`. Sestavení je ruční GitHub Actions workflow `Build Evala server`; Dockerfile.azure ověřuje kontrolní součet oficiálního nativního Stockfishe 19 a workflow před publikováním provede skutečný MultiPV výpočet přes API.

Azure používá povolený region Germany West Central, skupinu `evala-chess`, prostředí `evala-env`, profil Consumption a aplikaci `evala`. Cílové parametry jsou 2 vCPU / 4 GiB, ENGINE_THREADS=2 a jeden engine slot. Minimum replik 0, maximum 1. Vlastní Log Analytics není zapnutý.

Nasazení zapíná `ALLOW_EXTENSION_ORIGINS=true`: platné Chrome extension originy mohou použít API se stejným osobním tokenem. Samotný origin přístup neposkytuje, každý výpočet i health vyžadují Bearer token. Běžné cizí webové originy zůstávají blokované. Díky tomu není nutné ručně registrovat jiné ID každé rozbalené instalace.

S přihlášeným projektovým Azure CLI:

```powershell
.\.azure-cli-venv\Scripts\python.exe scripts/azure-deploy.py
.\.azure-cli-venv\Scripts\python.exe scripts/azure-deploy.py --apply
.\.azure-cli-venv\Scripts\python.exe scripts/cloud-smoke.py
```

První příkaz pouze ověří obraz a vypíše konfiguraci. Druhý vytvoří nebo aktualizuje aplikaci. Obraz se nejprve ověří anonymním stažením manifestu a nasadí pod neměnným digestem. Skript nepoužívá placenou ACR registry ani ACR Tasks.

Soubor `.local-data/deployment/api-token.txt` obsahuje osobní API token. Není ve zdrojovém repozitáři, sestavovacím kontextu ani obrazu. Skript jej nevypisuje a předává ho do Azure jako secret odkazovaný proměnnou prostředí. Do vlastní aplikace jej uživatel zadá v Nastavení → API token → Ověřit spojení. Vlastní server se ve webu vybere automaticky při první návštěvě; prohlížeč nevytváří Stockfish Worker.

`.local-data/deployment/deployment.json` je místní záznam URL a konfigurace. Přihlášení Azure CLI je v `.local-data/azure`; přihlášení GitHub CLI v projektovém `.local-data/github` nebo systémovém úložišti přihlašovacích údajů podle chování CLI. Tyto složky se nesdílí ani necommitují.

Zastavení aplikace (nemění ostatní prostředky ve skupině):

```powershell
$env:AZURE_CONFIG_DIR = Join-Path (Get-Location) '.local-data/azure'
.\.azure-cli-venv\Scripts\python.exe -m azure.cli containerapp stop --name evala --resource-group evala-chess
```

Po opětovném spuštění nebo novém nasazení ověř nastavení replik. Bezplatná kvóta má limity; zapnuté instance, starty a čas do uspání mohou čerpat kredit. Limit jedné instance není absolutní finanční strop. Zrušení prostředků neprovádět plošně nad jinými skupinami, například nad již existujícím projektem `gal-ai`.
