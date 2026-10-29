# Moje tempo na moje.itfit.cz

Samostatná aplikace Moje tempo. Nepřipojuje se k účtům ani databázi trenérské aplikace.

## Jednorázové dokončení v Cloudflare

1. Otevři **Workers & Pages → mojetempo → Settings → Domains & Routes → Add → Custom Domain** a zadej **moje.itfit.cz**. Cloudflare připraví DNS a HTTPS, pokud je `itfit.cz` aktivní zónou ve stejném účtu. Pokud zóna v účtu není, průvodce nejdříve vyžádá její připojení. Pouhý DNS CNAME na Workers.dev nenahrazuje připojení Custom Domain k Workeru.
2. V **Deployments** ověř úspěšné nasazení změn z `main`. Projekt používá `python3 scripts/build_site.py` a `npx wrangler deploy`. Wrangler 4.155.0 je připnutý v `package-lock.json` a při oprávněném prvním nasazení vytvoří databázi **mojetempo-db**, binding **DB**. Další nasazení znovu používají existující binding.
3. Pokud build token nemá právo databázi vytvořit, založ **Storage & Databases → D1 → Create database → mojetempo-db**. U Workeru v **Bindings → Add → D1 database** připoj tuto databázi pod názvem **DB** a zopakuj nasazení. Pro automatické vytvoření/správu databáze potřebuje build token oprávnění **Account → D1 → Edit**. Existující databázi trenéra nepoužívej. Pokud máš k dispozici ID nové databáze, lze jej uložit jako `database_id` do stávající sekce `[[d1_databases]]`; ID není heslo.

Tabulky se bezpečně vytvoří při prvním požadavku na účty z přibaleného `migrations/0001_accounts.sql`. Migrace pouze vytváří vlastní tabulky, žádná existující data nemaže. Před případnými budoucími změnami schématu vytvoř D1 export; obnova z Time Travel není v produkci tímto kódem ověřená.

Bez přístupu k tvému Cloudflare účtu nelze z vývojového prostředí potvrdit aktivaci DNS, oprávnění tokenu ani připojení produkční D1. Připravený kód a místní testy tyto kroky nenahrazují.

## Ověření spuštění

- `https://moje.itfit.cz/` otevře Moje tempo a v **Cíle a nastavení** nabízí účet.
- `https://moje.itfit.cz/api/status` vrátí `{"available":true}` a `/api/session` bez přihlášení `{"user":null}`.
- Vytvoř vlastní účet a ulož jednorázově zobrazený obnovovací klíč. E-mail zatím slouží jako přihlašovací jméno, jeho vlastnictví se neověřuje a obnovovací zprávy se neposílají.
- Zapiš aktivitu s místem a fotkou, počkej na **Uloženo v účtu**. V jiném prohlížeči/telefonu se přihlas stejným účtem a ověř zápis i fotku. Na otevřeném druhém zařízení se změny načítají při návratu do aplikace, tlačítkem **Synchronizovat** nebo přibližně každých 30 sekund. Rozepsaný formulář se automaticky nepřekresluje.
- Změny na GitHubu v `main` dále spouštějí Cloudflare Workers Builds. Změna DNS se kvůli úpravám aplikace neopakuje.

## Přenos současného deníku

Na dosavadní adrese `https://mojetempo.m-dokoupil69.workers.dev/` nejdříve otevři **Cíle a nastavení → Stáhnout celou zálohu**. Na nové doméně se přihlas a vyber **Obnovit ze zálohy**. Obnova nahradí současný deník přihlášeného účtu; aplikace předem požádá o potvrzení. Záznamy i fotky na staré adrese zůstanou zachované.

Pokud máš místní deník přímo na nové adrese, po přihlášení ho lze výslovně přidat tlačítkem **Převést místní deník do účtu**. Opakované převedení by vytvořilo další kopie.

## Co je ověřeno místně

`node --test tests/*.test.mjs`, `python3 tests/browser_smoke.py`, `python3 tests/pwa_smoke.py` a `python3 tests/cloud_smoke.py` pokrývají doménová pravidla, bezpečné balení, původní deník, offline aktualizace, skutečný místní Worker + D1, dvě zařízení, přesné bajty fotografií, souběžné změny, oddělení účtů, obnovu hesla, výšlapy a mapové body. Hledání a dlaždice mapy jsou v testu nahrazené, aby test neposílal lokace veřejným službám; dostupnost těchto služeb test neslibuje.
