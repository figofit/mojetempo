# Moje tempo na Cloudflare

Aplikace používá Pages s D1 a volitelné další klientské rozhraní nad stejným ověřeným API. Konfigurace klientského rozhraní je oddělená od zdrojového kódu a od záznamů deníku. Technický postup je v [docs/olda-integration.md](docs/olda-integration.md).

Existující Workers Builds sleduje tento repozitář a větev main. Build hook `node scripts/cloudflare_build.mjs` sestaví veřejné soubory a pouze v prostředí WORKERS_CI=1 provede nasazení. Použije bezpečně předané přihlašovací údaje Cloudflare; žádné tokeny nepatří do zdrojů ani do logů. Nativní místní nasazení může využít přihlášení Wrangler.

Samostatné sestavení `npm run build:pages` nepřistupuje k účtu. Veřejné soubory se balí podle explicitního seznamu. Worker se přidává pouze do serverového artefaktu Pages a nikdy do běžného statického výstupu. Databázový binding je sdílený, druhá kopie uživatelských účtů se nezakládá.

Další klient sestaví `node scripts/build_olda.mjs`. Osobní prezentační texty se dodávají v konfiguraci nasazení; veřejné zdroje obsahují neutrální šablonu. Před přepojením existujícího projektu build ověřuje připravenou vazbu na databázi. Změny DNS a nameserverů nejsou součástí tohoto hooku.

Základní kontroly: `node --test tests/*.test.mjs`. Ve Windows lze nastavit PYTHON na plnou cestu k Pythonu. Produkční kontroly přihlášení a sdílení jsou oddělené od syntetických testů; skutečná data se do testů ani veřejných artefaktů nevkládají.
