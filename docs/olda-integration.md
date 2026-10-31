# Jednotný Oldův deník na dvou adresách

Cíl: osobní podoba na `olda.itfit.cz` a standardní podoba na `moje.itfit.cz` používají stejný účet, zápisy a nastavení. Liší se prezentace, včetně původního Oldova přání a motivu cesty od čtyřicítky.

## Společná data

Obě adresy musí obsluhovat stejné API se stejnou databází D1 `mojetempo-db`. Vytvoření druhé databáze by vytvořilo oddělené účty. Přihlašovací e-mail na obou adresách musí označovat stejné interní ID účtu.

Pro sdílení se používá celý existující soukromý deník: záznamy, fotografie, místa, konkrétní cviky, vlastní názvy cviků, série, vlastní split, osobní položky plánu, návyky a jejich splnění, zapnuté moduly, cíle a volnější režim. Vzhled stránky a text přání se do těchto záznamů nepromítají. Obě podoby mají používat stejné formuláře a pravidla validace, aby měly stejné možnosti zápisu.

Současné přihlášení používá bezpečnou cookie platnou pro jednu adresu. Stejný účet lze přihlásit na obou adresách; samo o sobě to nepřihlásí druhou adresu automaticky. Cookies se nerozšiřují na všechny subdomény IT FIT. Případné společné automatické přihlášení potřebuje samostatný ověřený mechanismus.

## Co je ověřeno a co ještě chybí

`tests/cloud_smoke.py` obsahuje kontrolu dvou různých lokálních hostitelů nad skutečným Workerem nebo Pages a jedinou izolovanou D1. Ověřuje shodné ID účtu, přenos nastavení oběma směry, změnu původního záznamu bez duplikace, obnovení stránky a zrušení přihlášení po obnově hesla. Nepřipojuje se k produkčnímu Oldovu účtu.

Připojení produkční adresy `olda.itfit.cz`, původní design a původní narozeninové přání zatím nebyly změněny. K dokončení je potřeba aktuální Oldův zdrojový kód, text přání a ověření původního formátu uložených dat. Dochované části stylů z konverzace nejsou úplný zdrojový kód aplikace ani potvrzení aktuálního webu.

## Navazující implementace

1. Načíst skutečnou Oldovu aplikaci a zachovat její kompletní vzhled a přání. Zjistit, zda deník ukládá jen do prohlížeče, nebo už na server, a jaká vlastní pole používá.
2. Převést její formuláře na stejný model a stejnou synchronizaci jako Moje IT FIT. Případná další Oldova pole přidat do společného modelu, validace, záloh a obou zobrazení.
3. Jednorázově převést dosavadní záznamy do skutečného Oldova účtu s uchováním historie. Převod musí rozlišit stejné záznamy, aby opakované spuštění nevytvářelo kopie.
4. Připravit osobní podobu a připojit Oldovu adresu ke stejnému backendu. Ověřit HTTPS a původní adresu po nasazení.
5. Zkontrolovat skutečný zápis i úpravu z obou adres, vlastní pole, návyky, moduly, fotografie, offline změny a jejich sloučení.

Připravená soukromá pozvánka je jeden způsob založení Oldova účtu. Pokud už účet přijal, musí se použít jeho existující ID. Nezakládá se druhý účet a nic se nepřipisuje správci jen podle názvu subdomény.
