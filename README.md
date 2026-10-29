# Moje tempo

Osobní deník pohybu a regenerace. Místo, kde si snadno zaznamenáš posilovnu, domácí trénink, kolo, chůzi, kroky, saunu nebo odpočinek a uvidíš, jak se ti daří v čase.

Cílová adresa je **https://moje.itfit.cz/**. Jde o nezávislou aplikaci bez propojení s trenérskou databází. Připojení vlastní domény a produkční D1 popisuje [DEPLOYMENT.md](DEPLOYMENT.md); jejich aktivace zatím není z tohoto vývojového prostředí potvrzená.

První verze slouží k ověření každodenního používání. Navazuje na záměr vytvořit později aplikaci pro další lidi, kteří si zapnou jen moduly, které chtějí používat.

## Co prototyp nabízí

- Zápis aktivit s datem, délkou, kroky, poznámkou a pocitem po aktivitě.
- Výšlapy a turistiku, vzdálenost a nastoupané metry ve statistikách i exportech.
- Volitelné místo u libovolného zápisu včetně procházky nebo osobního momentu. Vyhledání místa, aktuální polohu nebo ruční souřadnice. Menší mapka **Moje místa** je dole ve statistikách; zobrazuje body, nikoliv GPS trasy.
- Účty v samostatné Cloudflare D1: synchronizaci zápisů, nastavení, míst a fotografií mezi zařízeními, místní offline frontu a ochranu před přepsáním souběžných změn.
- Samostatný zápis kroků i osobního momentu do kroniky bez povinných minut nebo tréninku.
- Přehled týdenního pohybu, regenerace a plnění vlastních cílů.
- Grafy a měsíční kolečka, která ukazují pravidelnost.
- Kroniku aktivit a fotografií: trénink, výlet, pokrok i důležitý moment.
- Zapínání a vypínání modulů bez mazání uložených záznamů.
- Oddělenou ukázku, která nepředstírá skutečné osobní záznamy.
- Úplnou zálohu a obnovu deníku v JSON včetně fotografií, cílů a modulů.
- Export záznamů do CSV a kalendářového souboru ICS.
- V sestavené verzi použití bez připojení a přidání aplikace na plochu.

ICS lze importovat do Google Kalendáře. Jde o jednorázový export, nikoli automatickou nebo obousměrnou synchronizaci. Doporučení vycházejí z jednoduchých pravidel a zaznamenaných dat; aplikace nepoužívá službu AI ani neposkytuje zdravotní posouzení.

## Spuštění při vývoji

Projekt používá HTML, CSS a nativní JavaScriptové moduly. Místní deník lze spustit bez backendu a API klíčů. Pro účty a synchronizaci slouží Worker a databáze D1; vývojová závislost Wrangler je připnutá v `package-lock.json`. Mapa používá přibalený Leaflet 1.9.4 s původní licencí.

Celou aplikaci s místní izolovanou D1 spustíš:

```sh
npm ci
npm run build
npm run dev
```

Wrangler běží standardně na `http://localhost:8787`. Místní databáze nemění produkční D1. Samotný deník bez účtů lze otevřít také přes běžný statický server:

Z kořene repozitáře:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

V cloudovém prostředí je pracovní adresář `/workspace/hubnuti`. Server je nutné po novém spuštění prostředí spustit znovu. Stránku načítej přes HTTP, nikoli přímo jako soubor. Zdrojová verze ponechává zástupnou hodnotu `tempo-build` a sama neregistruje service worker, aby vývoj nezůstával ve staré offline mezipaměti.

Testy doménové logiky a balení vyžadují Node.js:

```sh
node --test tests/*.test.mjs
```

V připraveném cloudovém prostředí je dostupný Playwright a Chromium. První příkaz níže používá běžící server; druhý vytváří vlastní dočasné sestavení a server pro test offline režimu a aktualizací:

```sh
python3 tests/browser_smoke.py
python3 tests/pwa_smoke.py
python3 tests/cloud_smoke.py
```

Testy používají izolovaný prohlížeč a dočasná data. Pro jiný server nastav `TEMPO_BASE_URL`, pro jiný Chromium `TEMPO_CHROMIUM`. Playwright je vývojový nástroj; aplikace samotná ho nepotřebuje.

## Sestavení a GitHub Pages

```sh
python3 scripts/build_site.py
```

Příkaz připraví `dist/` s výslovně povolenými veřejnými soubory aplikace, ikonami, manifestem a service workerem. Nepublikuje celý repozitář, testy ani dokumentaci. Do sestavení doplní verzi pro offline mezipaměť. Publikuje se pouze obsah `dist/`; manifest a relativní odkazy podporují také projektovou cestu `/mojetempo/`.

Aplikace je zveřejněná na **https://figofit.github.io/mojetempo/**. Nasazení i prohlížečová kontrola skutečné veřejné aplikace prošly v [běhu GitHub Actions](https://github.com/figofit/mojetempo/actions/runs/40873717434).

V repozitáři na GitHubu nastav **Settings → Pages → Source → GitHub Actions**. Workflow `.github/workflows/pages.yml` po odeslání změn do větve `main` nebo ručním spuštění provede Node testy, sestavení, prohlížečové kontroly zabalené aplikace a `pwa_smoke.py`. Teprve po jejich úspěchu nasadí veřejné soubory do GitHub Pages. Výsledek ověř v běhu Actions a na cílové adrese. Publikování vývojového cloudového prostředí je samostatný krok a web na GitHub Pages nenasazuje.

## Cloudflare Workers: automatické nasazení

Projekt `mojetempo` na Cloudflare používá Workers Builds propojené s repozitářem `figofit/mojetempo`. Konfigurace `wrangler.toml` publikuje hotové soubory přes Workers Static Assets a `/api/*` obsluhuje `worker/index.mjs` s bindingem `DB` na samostatnou D1. Schéma je přibalené ze složky `migrations`.

Nastavení sestavení:

- produkční větev: `main`
- build command: `python3 scripts/build_site.py`
- deploy command: `npx wrangler deploy`
- root directory: kořen repozitáře

Cloudflare po odeslání změn do `main` sestaví `dist` a zveřejní ho do existujícího Workeru `mojetempo`. Konfigurace zapíná adresu Workers.dev; skutečnou adresu převezmi z úspěšného nasazení v Cloudflare v části Domains. Nasazení není potvrzené, dokud build a deploy neskončí úspěšně a aplikace neprojde kontrolou na výsledné adrese.

Cloudflare pro nasazení v prostředí Workers Builds používá svůj build token; automatické vytvoření D1 navíc vyžaduje oprávnění D1 Edit. Doménu **moje.itfit.cz** připoj v Cloudflare jako **Custom Domain** podle [DEPLOYMENT.md](DEPLOYMENT.md). Pro ruční nasazení z vývojového prostředí je potřeba bezpečně připojený účet, odpovídající API oprávnění a povolená síť k `api.cloudflare.com`. Přihlašovací údaje nepatří do repozitáře ani do chatu.

V připraveném vývojovém prostředí je CLI `/workspace/tools/cloudflare/node_modules/.bin/wrangler` verze 4.155.0. Sestavení a konfiguraci lze ověřit bez přihlášení:

```sh
python3 scripts/build_site.py
WRANGLER_SEND_METRICS=false XDG_CONFIG_HOME=/workspace/.config /workspace/tools/cloudflare/node_modules/.bin/wrangler deploy --dry-run
```

Změna na novou doménu používá nové úložiště prohlížeče; existující deník přenes úplnou JSON zálohou. GitHub Pages zůstává samostatným nasazením stejné aplikace.

## Telefon, offline režim a aktualizace

Po nasazení otevři aplikaci online, aby si podporovaný prohlížeč připravil offline soubory. Na Androidu použij nabídku prohlížeče **Přidat na plochu / Instalovat aplikaci**, případně tlačítko instalace v aplikaci, pokud jej prohlížeč nabídne. Na iPhonu otevři web v Safari a zvol **Sdílet → Přidat na plochu**. Tyto kroky v rozhraní skutečných telefonů zatím nebyly ověřeny.

Offline soubory umožňují otevřít aplikaci bez připojení; záznamy a fotografie dál zůstávají v IndexedDB téhož prohlížeče. Nová verze se nabídne v pruhu **Nová verze je připravená**. Nejdřív dokonči nebo zavři rozepsaný formulář a potom zvol **Aktualizovat**. Uložený deník se při aktualizaci nemaže.

## Kde zůstávají data

Bez přihlášení se záznamy, nastavení a fotografie ukládají jen do IndexedDB konkrétního prohlížeče. Po přihlášení má každý účet vlastní místní kopii a synchronizuje ji se samostatnou D1. Místní deník se do účtu nepřevádí automaticky: použij výslovný převod nebo úplnou zálohu. Změna domény mění místní úložiště i přihlašovací cookie. Před přechodem na novou adresu stáhni zálohu.

Účty používají e-mail jako dosud neověřené přihlašovací jméno a heslo 12–128 znaků. Hesla se ukládají jako PBKDF2 SHA-256 se 100 000 iteracemi a náhodnou solí (limit WebCrypto ve Workers); náhodné relační a obnovovací klíče pouze jako SHA-256. Relace trvá 14 dní a používá host-only HttpOnly, Secure a SameSite=Strict cookie na HTTPS. Obnova hesla vyžaduje uložený klíč, zneplatní jej a odhlásí ostatní zařízení. Požadavky měnící data kontrolují Origin i identitu účtu, SQL vždy filtruje vlastníka a používá parametry. Přihlašování, registrace a zápisy mají databázové limity četnosti.

Synchronizace ukládá nejprve místně; nové záznamy a nezávislé změny ze dvou zařízení sloučí. Při změně stejného údaje na dvou zařízeních se zastaví s upozorněním a zachová místní verzi pro zálohu. Na serveru vynucuje číslo revize. API ani osobní fotografie se nedostávají do offline cache veřejných souborů. Odhlášení přepne zpět do nezávislého místního deníku, místní kopie účtu zůstává v úložišti zařízení; na sdíleném zařízení ji vymaž přes nastavení prohlížeče.

Účet podporuje nejvýše 10 000 záznamů a JSON deníku do 1,5 MB, každou fotografii do 1 MB a dohromady 40 MB fotografií. Nepoužívané serverové fotografie starší než den se odstraní při dalším uložení deníku. Veřejné registrace jsou v této první verzi bez e-mailového ověření, plateb a napojení na trenéry.

Název místa se odešle službě Photon (komoot) jen při stisku **Vyhledat místo**. Aktuální poloha vyžaduje souhlas prohlížeče. Mapové dlaždice OpenStreetMap se načítají až po otevření mapky; souřadnice se nikam veřejně nepublikují. Při nedostupnosti vyhledávání lze zadat název a souřadnice ručně.

V části **Cíle a nastavení** zvol **Stáhnout celou zálohu**. Soubor JSON obsahuje všechny záznamy, cíle, zapnuté moduly a uložené fotografie. Zálohuj před změnou zařízení, adresy aplikace nebo vymazáním dat prohlížeče. Soubor obsahuje osobní záznamy a fotky v nešifrované podobě.

Na druhém zařízení se stačí přihlásit ke stejnému účtu, pokud už byl deník synchronizovaný. Pro ruční přenos zvol **Obnovit ze zálohy**. Záloha a import podporují JSON do 64 MB a 10 000 záznamů; při překročení se neobnovitelný export nevytvoří a aplikace zobrazí chybu. Import zkontroluje záznamy i fotografie a vyžádá si potvrzení nahrazení právě otevřeného deníku (přihlášeného účtu nebo místního deníku). Nejde o sloučení dvou deníků. Původní deník si před nahrazením stáhni do vlastní zálohy; při odmítnutí nebo neúspěšném místním uložení zůstává zachován. Obnovení zachovává uložené fotografie bez další ztrátové komprese. Import do účtu navíc podléhá serverovým limitům velikosti; případnou chybu odeslání uvidíš v pruhu synchronizace a místní záznamy zůstanou zachované.

Nová fotografie může být JPG, PNG nebo WebP do 10 MB. Aplikace ji před uložením převádí na JPEG s delší stranou nejvýše 1 600 pixelů a kvalitou 0,82. Záloha obsahuje tuto zmenšenou podobu, nikoli původní soubor. Pro důležité fotografie si ponech originály.

CSV a ICS obsahují záznamy, nikoli fotografie ani kompletní nastavení aplikace. Nejsou úplnou zálohou deníku.

Připravené účty a synchronizace fungují na nasazení s připojenou D1; čistě statická verze na GitHub Pages podporuje místní deník. Prototyp nemá platby, sdílení s trenéry ani e-mailové ověřování a odesílání zpráv.

## Další rozvoj

1. Používat vlastní deník a upravit rychlost zápisu, cíle a statistiky podle skutečné potřeby.
2. Ověřit přenos záloh na skutečných zařízeních a rozvíjet práci s větší kronikou.
3. Dokončit produkční doménu a D1, ověřit reálné telefony, zálohy a obnovu účtu.
4. Nabídnout lidem vlastní výběr modulů, cíle a přehledy.
5. Doplnit přímé propojení s Google Kalendářem s výslovným souhlasem uživatele.

Zdrojový kód je v repozitáři `figofit/mojetempo`. Stejný GitHub repozitář lze otevřít ve Windows aplikaci Codex. Místní adresář cloudového prostředí zůstává `/workspace/hubnuti`. Změny ve zdrojovém kódu a místní data deníku jsou dvě různé věci: Git nepřenáší obsah úložiště prohlížeče.
