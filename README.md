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

ICS lze importovat do Google Kalendáře. Jde o jednorázový export, nikoli automatickou nebo obousměrnou synchronizaci. Doporučení vycházejí z jednoduchých pravidel a zaznamenaných dat; aplikace nepoužívá službu AI ani neposkytuje zdravotní posouzení.

## Spuštění při vývoji

Projekt používá HTML, CSS a nativní JavaScriptové moduly. Nepotřebuje instalaci balíčků, sestavení, databázový server ani API klíče.

Z kořene repozitáře spusť:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

V cloudovém prostředí je pracovní adresář `/workspace/hubnuti`. Server musí po každém novém spuštění prostředí znovu běžet; živé procesy nejsou součástí uloženého obrazu prostředí. Stránku načítej přes HTTP, nikoli přímo jako soubor, aby fungovaly JavaScriptové moduly a úložiště prohlížeče.

Testy doménové logiky vyžadují Node.js:

```sh
node --test tests/*.test.mjs
```

Při změnách uživatelského rozhraní ověř také zápis aktivity, přepočet statistik, zachování dat po obnovení stránky a použití na mobilní šířce.

V připraveném cloudovém prostředí je dostupný také Playwright a Chromium. Při běžícím serveru ověří celý postup v izolovaném prohlížeči:

```sh
python3 tests/browser_smoke.py
```

Test používá dočasná data a nezasahuje do osobního deníku. Pro jiný server nastav `TEMPO_BASE_URL`, pro jiný Chromium `TEMPO_CHROMIUM`. Playwright je vývojový nástroj prostředí; aplikace samotná ho nepotřebuje.

## Kde zůstávají data

Záznamy, nastavení a fotografie se ukládají místně do IndexedDB konkrétního prohlížeče. Neodesílají se na aplikační server. Jiný prohlížeč, jiná adresa aplikace nebo smazání dat webu znamenají jiné či prázdné úložiště. Změna zařízení sama data nepřenese.

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

Repozitář `figofit/hubnuti` může sloužit i tomuto novému projektu; nový repozitář není potřeba. Stejný GitHub repozitář lze otevřít ve Windows aplikaci Codex. Změny ve zdrojovém kódu a místní data deníku jsou dvě různé věci: Git nepřenáší obsah úložiště prohlížeče.
