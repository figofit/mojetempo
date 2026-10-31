# Jednotný Oldův deník na dvou adresách

Cíl: osobní podoba na `olda.itfit.cz` a standardní podoba na `moje.itfit.cz` používají stejný účet, zápisy a nastavení. Liší se prezentace, včetně původního Oldova přání a motivu cesty od čtyřicítky.

## Společná data

Obě adresy musí obsluhovat stejné API se stejnou databází D1 `mojetempo-db`. Vytvoření druhé databáze by vytvořilo oddělené účty. Přihlašovací e-mail na obou adresách musí označovat stejné interní ID účtu.

Pro sdílení se používá celý existující soukromý deník: záznamy, fotografie, místa, konkrétní cviky, vlastní názvy cviků, série, vlastní split, osobní položky plánu, návyky a jejich splnění, zapnuté moduly, cíle a volnější režim. Vzhled stránky a text přání se do těchto záznamů nepromítají. Obě podoby mají používat stejné formuláře a pravidla validace, aby měly stejné možnosti zápisu.

Současné přihlášení používá bezpečnou cookie platnou pro jednu adresu. Stejný účet lze přihlásit na obou adresách; samo o sobě to nepřihlásí druhou adresu automaticky. Cookies se nerozšiřují na všechny subdomény IT FIT. Případné společné automatické přihlášení potřebuje samostatný ověřený mechanismus.

## Co je ověřeno a co ještě chybí

`tests/cloud_smoke.py` obsahuje kontrolu dvou různých lokálních hostitelů nad skutečným Workerem nebo Pages a jedinou izolovanou D1. Ověřuje shodné ID účtu, přenos nastavení oběma směry, změnu původního záznamu bez duplikace, obnovení stránky a zrušení přihlášení po obnově hesla. Nepřipojuje se k produkčnímu Oldovu účtu.

Připojení produkční adresy `olda.itfit.cz` zatím nebylo změněno. Připnuté vlákno **Vytvořit Oldovi fitness kroniku** (místní vlákno `01a136b0-fad5-71f1-8a28-fee00bd40e97`) potvrdilo vlastní projekt Pages `olda-itfit` a vlastní databázi. DNS u WEDOS míří na `olda-itfit.pages.dev`; jeho cílový projekt proto nelze považovat za již propojený s Moje IT FIT.

V `appearance.mjs` a `olda.css` je připravená osobní podoba společné aplikace. Přesný text původního přání a podpis pocházejí z výpisu `olda/src/data.json` v původním vlákně. Náhled `/?vzhled=olda` používá stejný právě otevřený deník, přihlášení a formuláře jako standardní zobrazení; viditelný pruh na to upozorňuje. Vzhled sám žádný účet nevybírá ani nesdílí jeho data. Po nasazení stejné aplikace na osobní adresu se vzhled vybere podle přesného hostitele `olda.itfit.cz`.

Čtení konverzace není přístup k souborům ve Windows ani přenos oprávnění Cloudflare z místního počítače. K dokončení je potřeba načíst aktuální nasazené soubory nebo celou složku `C:\Users\Admin\Documents\ChatGPT\IT FIT\olda` a získat aktuální stav původní databáze. Původní server dovoloval veřejné prohlížení a zápis chránil samostatným heslem. Připojení k účtu Moje IT FIT musí zachovat přístupová pravidla soukromého deníku; samotné zobrazení narozeninového přání neuděluje přístup k zápisům.

### Zjištěný původní datový formát

Z výpisu `olda/src/core.js` je znám formát `schemaVersion: 1`, `clientId: olda-4-0`:

- `profile`: jméno, oslovení, narozeniny, věk, začátek evidence, věnování, podpis, odkaz na Vault.
- `plan`: název, zaměření, poznámky a položky cvik / domluvené provedení / poznámka.
- `habits`: vlastní definice s názvem, poznámkou, týdenním cílem a archivací.
- `sessions`: kategorie, datum, název, minuty (včetně neznámého času 0), společný trénink, poznámka a cviky se sériemi, opakováními a zátěží.
- `days`: odškrtnuté návyky, kroky, energie a poznámka pro datum.
- `milestones`: datum, název a poznámka.

Převod se nesmí omezit na názvy tréninků: musí uchovat i opakování, zátěž, příznak společného tréninku, vlastní definice návyků, plán a denní energii. Současný model Moje IT FIT má u silových cviků série a pohybové vzory; přímé předání starého JSON do běžné obnovy by původní pole nepřevzalo. Před propojením je proto nutný převod s náhledem a uchováním úplného původního exportu. Prázdný export z původní přípravy dárku nedokazuje, že dnešní databáze stále neobsahuje zápisy.

## Navazující implementace

1. Načíst skutečnou Oldovu aplikaci a zachovat její kompletní vzhled a přání. Zjistit, zda deník ukládá jen do prohlížeče, nebo už na server, a jaká vlastní pole používá.
2. Převést její formuláře na stejný model a stejnou synchronizaci jako Moje IT FIT. Případná další Oldova pole přidat do společného modelu, validace, záloh a obou zobrazení.
3. Jednorázově převést dosavadní záznamy do skutečného Oldova účtu s uchováním historie. Převod musí rozlišit stejné záznamy, aby opakované spuštění nevytvářelo kopie.
4. Připravit osobní podobu a připojit Oldovu adresu ke stejnému backendu. Ověřit HTTPS a původní adresu po nasazení.
5. Zkontrolovat skutečný zápis i úpravu z obou adres, vlastní pole, návyky, moduly, fotografie, offline změny a jejich sloučení.

Připravená soukromá pozvánka je jeden způsob založení Oldova účtu. Pokud už účet přijal, musí se použít jeho existující ID. Nezakládá se druhý účet a nic se nepřipisuje správci jen podle názvu subdomény.
