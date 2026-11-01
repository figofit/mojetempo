# Sdílený deník: více klientských rozhraní

Klient v `clients/olda` zachovává vlastní renderer, styl a navigaci. Jeho formuláře používají `app.js`, datový model `domain.mjs` a `personal.mjs`, úložiště `storage.mjs` a pravidla slučování `sync-rules.mjs`. Serverová implementace je společná v `worker/index.mjs`.

## Nasazení a identita

Oba projekty Pages používají jediný binding D1. Každý hostitel má vlastní Secure HttpOnly SameSite=Strict cookie; cookie se nerozšiřuje na celou rodičovskou doménu. Identita je interní ID, nikoliv název hostitele. Volitelná delegace v `diary_links` vyžaduje konkrétní uloženou vazbu; obecná role správce přístup k deníkům neuděluje.

Osobní prezentace se dodává z konfigurace nasazení `OLDA_PRESENTATION` přes `/api/presentation`. Vrací pouze zobrazované texty; datum narození, účet, kontakty ani záznamy nevrací. Veřejný zdroj `clients/olda/src/data.json` obsahuje neutrální šablonu a prázdná data. Přihlášený deník se načítá samostatně z ověřeného API.

`scripts/build_olda.mjs` sestaví další klientské rozhraní a přibalí společný Worker. `scripts/cloudflare_build.mjs` aktualizuje existující projekty; před změnou bindingu ověřuje existenci cílového projektu a připravené databázové vazby. DNS a nameservery nemění. Běžný zápis aktualizuje D1 bez nového nasazení.

## Model a převod

Volitelná pole zahrnují série, opakování, zátěž, společný trénink, příznak neznámého času, energii, vlastní definice návyků, vlastní údaje a osobní plán. Sdílejí se také fotografie, místa, pohybové vzory, split, týdenní plán, cíle, moduly a období klidu. Validace i JSON zálohy zachovávají tato pole.

`legacy-olda.mjs` převádí starší formát bez vymýšlení minut, sérií nebo pohybových vzorů. Stabilní ID brání duplikaci položek. Provozní převod používá importní ledger a soukromý archiv úplného původního exportu; exporty, přístupové údaje a skutečné záznamy nepatří do repozitáře. Předchozí revize sdíleného deníku uchovává `diary_history`.

## Kontroly

`tests/olda-integration.test.mjs` používá výhradně syntetické fixture nad izolovanou SQLite: dva hostitelé, společná identita, delegace, zamítnutí cizího účtu, obousměrná úprava bez duplikace, fotografie po bajtech, archiv revizí a offline sloučení. `tests/olda-build.test.mjs` kontroluje původní renderer, šablonu bez osobních dat, společný server a PWA balíček. Běžný testovací běh se nepřipojuje k produkčním účtům.
