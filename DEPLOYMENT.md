# Moje tempo na moje.itfit.cz

Moje tempo je samostatná aplikace se samostatnou databází. Nemění databázi, domény ani přístupy trenérské aplikace nebo Oldy. DNS domény `itfit.cz` zůstává u současného registrátora.

## Nasazení pro externí DNS

Cílový projekt Cloudflare Pages je **figofit-mojetempo**. Jeho úspěšné vytvoření a nasazení je nutné ověřit před přidáním CNAME; samotný název v repozitáři nepotvrzuje existenci projektu ani vlastnictví cílové adresy.

Existující **Workers Builds → mojetempo** dál sleduje GitHub `figofit/mojetempo`, větev `main`. Příkazy zůstávají `python3 scripts/build_site.py` a `npx wrangler deploy`. Druhý příkaz spustí deklarovaný build hook `node scripts/cloudflare_build.mjs`. Ten:

1. Sestaví veřejné soubory. V běžném místním prostředí ani v testech žádné účty Cloudflare nekontaktuje.
2. Pouze uvnitř Workers Builds (`WORKERS_CI=1`) používá bezpečně předané `CLOUDFLARE_ACCOUNT_ID` a `CLOUDFLARE_API_TOKEN`.
3. Vytvoří nebo znovu použije vyhrazenou D1 **mojetempo-db** a projekt Pages **figofit-mojetempo**. API volání se týkají pouze těchto prostředků.
4. Do dočasného adresáře připraví veřejné soubory a přibalený `_worker.js`, který obsluhuje `/api/*`. Serverový kód se nikdy nepřidává do `dist` zveřejňovaného jako statický web. Pages se nasadí s bindingem **DB**.
5. U Pages zaregistruje vlastní doménu **moje.itfit.cz**. Nameservery ani DNS ostatních subdomén nemění. Nakonec běžné nasazení zachová i původní Worker na jeho Workers.dev adrese.

Nasazovací token potřebuje vedle současných práv také **Account → Cloudflare Pages → Edit** a **Account → D1 → Edit**. Automaticky vytvořený token Workers Builds je nemusí obsahovat. Při HTTP 403 nebo chybě přístupů se nasazení zastaví a vypíše konkrétní API operaci a kód chyby, nikdy token. Oprávnění lze doplnit v Cloudflare **My Profile → API Tokens → příslušný build token → Edit** a nasazení opakovat. Hodnoty tokenů nepatří do repozitáře ani chatu.

Původní příčinu hledej na řádku **`MOJE_TEMPO_DEPLOY_ERROR`**, nikoliv až v souhrnné hlášce Wrangleru `Running custom build failed`. Například `GET /pages/projects/...: HTTP 403, kód 10000` znamená, že token nemá přístup k Pages v daném účtu; ověř **Cloudflare Pages → Edit**. Chyba na `/d1/...` směřuje na oprávnění D1. Pokud není předané ID účtu, skript ho zkusí zjistit standardním `wrangler whoami --json`; při více účtech vyžaduje výslovné `CLOUDFLARE_ACCOUNT_ID` a žádný účet nevybírá odhadem.

`npm run build` a `npm run build:pages` jsou čistě místní sestavení a nevytvářejí vzdálené prostředky. `npm run build:pages` vypíše cestu k připravenému dočasnému adresáři pro Pages. Vývoj používá `npm run dev` a samostatné prostředí `local`.

## CNAME u registrátora

Až je potvrzené nasazení vlastního projektu **figofit-mojetempo** a v Pages připojená doména **moje.itfit.cz**, přidej nebo uprav pouze záznam pro `moje`:

| Pole | Hodnota |
| --- | --- |
| Typ | CNAME |
| Název / host | `moje` |
| Cíl | `figofit-mojetempo.pages.dev` |
| TTL | výchozí hodnota registrátora |

Cíl je bez `https://` a bez lomítka; některá rozhraní vyžadují závěrečnou tečku. U tohoto hostu nesmí současně existovat konfliktní A/AAAA záznam. Ostatní záznamy domény zachovej. Cloudflare po ověření CNAME připraví HTTPS; to může trvat několik minut. Workers.dev adresa není pro tento způsob zapojení cílem CNAME.

## Ověření

- `https://figofit-mojetempo.pages.dev/` musí zobrazit Moje tempo. Na `/api/status` očekávej `{"available":true}` a na `/api/session` bez přihlášení `{"user":null}`.
- Po změně DNS musí stejné kontroly projít na `https://moje.itfit.cz/`. GitHub Actions kontrolují obě adresy samostatně. Chybějící CNAME nebo nehotový certifikát se nesmí obejít vypnutím ověřování HTTPS.
- Při prvním požadavku se v nové D1 vytvoří vlastní tabulky z `migrations/0001_accounts.sql`. Existující tabulky ani záznamy se nemažou.
- Vytvoř účet a ulož zobrazený obnovovací klíč. Na jiném zařízení se přihlas stejným e-mailem a heslem a ověř zápis i fotku. E-mail slouží jako přihlašovací jméno; ověřovací ani obnovovací zprávy se zatím neposílají.
- Na otevřeném druhém zařízení se změny načítají při návratu do aplikace, tlačítkem **Synchronizovat** nebo přibližně každých 30 sekund. Rozepsané formuláře se nepřekreslují.

## Přenos současného deníku

Na dosavadní adrese `https://mojetempo.m-dokoupil69.workers.dev/` otevři **Cíle a nastavení → Stáhnout celou zálohu**. Na nové doméně se přihlas a zvol **Obnovit ze zálohy**. Obnova po potvrzení nahradí současný deník otevřeného účtu; původní místní záznamy na staré adrese zůstanou zachované. Záloha zahrnuje také místa, cviky, pracovní série, vlastní split a cílové poměry.

Místní testy ověřují skutečný Worker i Pages s D1, dvě zařízení, offline fronty, přesné bajty fotografií, souběžné změny, oddělení účtů, obnovu hesla, mapové body a silové statistiky. Vyhledávání míst a mapové dlaždice jsou v testech nahrazené. Úspěch místních testů nepotvrzuje přístupová oprávnění produkčního tokenu, existenci projektu ani propagaci DNS.
