# Jednotný Oldův deník na dvou adresách

Cíl upřesněný uživatelem: dál zapisovat přímo v **původní Oldově aplikaci na `olda.itfit.cz`** a rozšířit její možnosti na úroveň Moje tempo. Tytéž zápisy, vlastní údaje, návyky a moduly se musí objevit v Oldově účtu na `moje.itfit.cz`. Zachovat původní Oldovu aplikaci, vzhled, přání a motiv od čtyřicítky. Pomocný náhled `/?vzhled=olda` může zůstat; nenahrazuje požadovanou úpravu původní aplikace.

## Společná data

Obě adresy musí obsluhovat stejné API se stejnou databází D1 `mojetempo-db`. Vytvoření druhé databáze by vytvořilo oddělené účty. Přihlašovací e-mail na obou adresách musí označovat stejné interní ID účtu.

Pro sdílení se používá celý existující soukromý deník: záznamy, fotografie, místa, konkrétní cviky, vlastní názvy cviků, série, vlastní split, osobní položky plánu, návyky a jejich splnění, zapnuté moduly, cíle a volnější režim. Vzhled stránky a text přání se do těchto záznamů nepromítají. Obě aplikace mají sdílet datový model, význam polí a pravidla validace. Ovládání původní Oldovy aplikace se rozšíří a zachová její osobní podobu.

Současné přihlášení používá bezpečnou cookie platnou pro jednu adresu. Stejný účet lze přihlásit na obou adresách; samo o sobě to nepřihlásí druhou adresu automaticky. Cookies se nerozšiřují na všechny subdomény IT FIT. Případné společné automatické přihlášení potřebuje samostatný ověřený mechanismus.

## Co je ověřeno a co ještě chybí

`tests/cloud_smoke.py` obsahuje kontrolu dvou různých lokálních hostitelů nad skutečným Workerem nebo Pages a jedinou izolovanou D1. Ověřuje shodné ID účtu, přenos nastavení oběma směry, změnu původního záznamu bez duplikace, obnovení stránky a zrušení přihlášení po obnově hesla. Nepřipojuje se k produkčnímu Oldovu účtu.

Připojení produkční adresy `olda.itfit.cz` zatím nebylo změněno. Připnuté vlákno **Vytvořit Oldovi fitness kroniku** (místní vlákno `01a136b0-fad5-71f1-8a28-fee00bd40e97`) potvrdilo vlastní projekt Pages `olda-itfit` a vlastní databázi. DNS u WEDOS míří na `olda-itfit.pages.dev`; jeho cílový projekt proto nelze považovat za již propojený s Moje IT FIT.

V `appearance.mjs` a `olda.css` je připravený pomocný náhled osobní podoby Moje tempo. Přesný text původního přání a podpis pocházejí z výpisu `olda/src/data.json` v původním vlákně. Náhled `/?vzhled=olda` používá stejný právě otevřený deník, přihlášení a formuláře jako standardní zobrazení; viditelný pruh na to upozorňuje. Vzhled sám žádný účet nevybírá ani nesdílí jeho data. Tento náhled není dokončené propojení původní Oldovy aplikace. Uživatelské upřesnění výslovně požaduje upravovat původní aplikaci `olda`, nikoli ji nahradit tímto náhledem nebo na něj přesměrovat její adresu.

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

1. Načíst skutečné původní zdroje `olda`, její server a aktuální databázi. Zachovat její kompletní vzhled, přání a možnost společného zápisu s Michalem.
2. Připojit její formuláře ke stejnému modelu a stejné synchronizaci jako Moje IT FIT. Doplnit do původní Oldovy aplikace stejné možnosti aktivit, výšlapů, míst, mobility, cviků a pohybových vzorů, návyků, modulů, vlastního plánu, volnějšího režimu a statistik. Případná další Oldova pole přidat do společného modelu, validace, záloh a obou zobrazení.
3. Jednorázově převést dosavadní záznamy do skutečného Oldova účtu s uchováním historie. Převod musí rozlišit stejné záznamy, aby opakované spuštění nevytvářelo kopie.
4. U původního projektu `olda-itfit` zapojit stejnou fyzickou D1 `mojetempo-db` a společný účet. Využít API na vlastní adrese nebo serverový adaptér se stejným účtovým oprávněním; zachovat kontrolu přihlášení a vlastnictví deníku. Starší databázi uchovat jako zdroj převodu, další běžné zápisy směrovat do jediné společné D1. Ověřit HTTPS a původní adresu po nasazení.
5. Zkontrolovat zápis skutečně přes původní Oldovo rozhraní a jeho načtení v Moje IT FIT i opačný směr, vlastní pole, návyky, moduly, fotografie, offline změny a jejich sloučení. Dosavadní test dvou adres se stejným rozhraním Moje tempo sám o sobě tuto kontrolu původní Oldovy aplikace nenahrazuje.

Připravená soukromá pozvánka je jeden způsob založení Oldova účtu. Pokud už účet přijal, musí se použít jeho existující ID. Nezakládá se druhý účet a nic se nepřipisuje správci jen podle názvu subdomény.

## Dokončení v místním vlákně s dostupnými zdroji

Místní vlákno **Vytvořit Oldovi fitness kroniku** má pracovní adresář `C:\Users\Admin\Documents\ChatGPT\IT FIT`; původní zdroje jsou v podsložce `olda`. Historie v něm dokládá funkční nasazování přes místní Cloudflare CLI. To není oprávnění přenesené do tohoto cloudového prostředí.

Předání pro pokračování v tomto místním vlákně:

> Uprav přímo původní Oldovu aplikaci v podsložce `olda` na adrese `olda.itfit.cz`. Zachovej její vzhled, přání a motiv od čtyřicítky. Doplníš do ní stejné možnosti zápisu, vlastní pole, návyky a moduly jako v Moje tempo na `moje.itfit.cz`; aktuální společný kód načti z `figofit/mojetempo`, větev `main`. Obě skutečné aplikace mají zapisovat do jediné D1 `mojetempo-db` a téhož Oldova účtu. Pomocný vzhled Moje tempo `?vzhled=olda` může zůstat, ale nenahrazuj jím původní Oldovu aplikaci a nepřesměrovávej na něj její adresu. Načti aktuální Oldovy zdroje, server a skutečná data; zachovej původní export mimo veřejný repozitář. Přenes všechna původní pole včetně vlastních návyků, opakování, zátěže, společných tréninků, plánu a energie. Chybějící pole doplň do společného modelu, validace, obou rozhraní, záloh a synchronizace. Použij skutečné ID Oldova účtu nebo již připravenou pozvánku; jeho data nepatří do účtu správce. Zachovej možnost společného zapisování Michalem s oprávněním ke konkrétnímu Oldovu deníku. Využij původní místní nasazování a Cloudflare přihlášení bez čtení nebo posílání tokenů. Ověř zápis původním Oldovým rozhraním a jeho zobrazení v Moje IT FIT, opačný směr, zachování vlastních polí, návyků, modulů i historie; potom nasaď a ověř obě veřejné adresy. Uživatel tuto konkrétní implementaci a nasazení výslovně autorizoval, další obecné potvrzení návrhu není potřeba.
