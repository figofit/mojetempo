# Moje tempo

Osobní deník pohybu a regenerace. Místo, kde si snadno zaznamenáš posilovnu, domácí trénink, kolo, chůzi, kroky, saunu nebo odpočinek a uvidíš, jak se ti daří v čase.

První verze slouží k ověření každodenního používání. Navazuje na záměr vytvořit později aplikaci pro další lidi, kteří si zapnou jen moduly, které chtějí používat.

## Co prototyp nabízí

- Zápis aktivit s datem, délkou, kroky, poznámkou a pocitem po aktivitě.
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

Projekt používá HTML, CSS a nativní JavaScriptové moduly. Aplikace nepotřebuje instalaci balíčků, databázový server ani API klíče. Při vývoji lze přímo spustit zdrojové soubory:

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

Projekt `mojetempo` na Cloudflare používá Workers Builds propojené s repozitářem `figofit/mojetempo`. Konfigurace `wrangler.toml` publikuje hotové statické soubory přes Workers Static Assets; vlastní serverový skript není potřeba.

Nastavení sestavení:

- produkční větev: `main`
- build command: `python3 scripts/build_site.py`
- deploy command: `npx wrangler deploy`
- root directory: kořen repozitáře

Cloudflare po odeslání změn do `main` sestaví `dist` a zveřejní ho do existujícího Workeru `mojetempo`. Konfigurace zapíná adresu Workers.dev; skutečnou adresu převezmi z úspěšného nasazení v Cloudflare v části Domains. Nasazení není potvrzené, dokud build a deploy neskončí úspěšně a aplikace neprojde kontrolou na výsledné adrese.

Cloudflare pro nasazení v prostředí Workers Builds používá svůj build token. Pro ruční nasazení z cloudového vývojového prostředí je naopak potřeba bezpečně připojený účet, API token s oprávněním pro úpravu Workers a povolená síť k `api.cloudflare.com`. Přihlašovací údaje nepatří do repozitáře ani do chatu.

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

Záznamy, nastavení a fotografie se ukládají místně do IndexedDB konkrétního prohlížeče. Neodesílají se na aplikační server. Drž se stejné adresy a prohlížeče: změna domény, protokolu nebo portu znamená jiné úložiště. Změna zařízení sama data nepřenese. Před změnou adresy nebo smazáním dat webu stáhni zálohu.

V části **Cíle a nastavení** zvol **Stáhnout celou zálohu**. Soubor JSON obsahuje všechny záznamy, cíle, zapnuté moduly a uložené fotografie. Zálohuj před změnou zařízení, adresy aplikace nebo vymazáním dat prohlížeče. Soubor obsahuje osobní záznamy a fotky v nešifrované podobě.

Na druhém zařízení otevři aplikaci a zvol **Obnovit ze zálohy**. Záloha a import podporují JSON do 30 MB a 10 000 záznamů; při překročení se neobnovitelný export nevytvoří a aplikace zobrazí chybu. Import zkontroluje záznamy i fotografie a vyžádá si potvrzení nahrazení současného vlastního deníku. Nejde o sloučení dvou deníků. Původní deník si před nahrazením stáhni do vlastní zálohy; při odmítnutí nebo neúspěšném uložení zůstává zachován. Obnovení zachovává uložené fotografie bez další ztrátové komprese.

Nová fotografie může být JPG, PNG nebo WebP do 10 MB. Aplikace ji před uložením převádí na JPEG s delší stranou nejvýše 1 600 pixelů a kvalitou 0,82. Záloha obsahuje tuto zmenšenou podobu, nikoli původní soubor. Pro důležité fotografie si ponech originály.

CSV a ICS obsahují záznamy, nikoli fotografie ani kompletní nastavení aplikace. Nejsou úplnou zálohou deníku.

Prototyp zatím nemá uživatelské účty, automatický přenos mezi zařízeními, cloudovou synchronizaci, sdílení ani placené moduly. Není připraven k ukládání dat zákazníků jako víceuživatelská služba.

## Další rozvoj

1. Používat vlastní deník a upravit rychlost zápisu, cíle a statistiky podle skutečné potřeby.
2. Ověřit přenos záloh na skutečných zařízeních a rozvíjet práci s větší kronikou.
3. Zavést účty, synchronizaci a jasné oddělení dat jednotlivých uživatelů.
4. Nabídnout lidem vlastní výběr modulů, cíle a přehledy.
5. Doplnit přímé propojení s Google Kalendářem s výslovným souhlasem uživatele.

Zdrojový kód je v repozitáři `figofit/mojetempo`. Stejný GitHub repozitář lze otevřít ve Windows aplikaci Codex. Místní adresář cloudového prostředí zůstává `/workspace/hubnuti`. Změny ve zdrojovém kódu a místní data deníku jsou dvě různé věci: Git nepřenáší obsah úložiště prohlížeče.
