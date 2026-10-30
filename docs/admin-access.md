# Správce Moje tempo

Přihlášení a deník fungují pod stejným účtem na mobilu i PC. Každý nový účet má
roli `user`. První registrace ani konkrétní e-mail automaticky nezískává práva
správce; e-mail v této verzi není ověřován.

Správce se určuje přesným ID existujícího účtu. ID účtu se zobrazuje po
přihlášení v aplikaci v části **Cíle a nastavení → Můj přístup → ID mého účtu**. Jde o
identifikátor, nikoli heslo nebo obnovovací klíč. Nikdy se neposílá heslo,
obnovovací klíč ani Cloudflare API token.

Po vytvoření svého účtu uživatel pošle jeho ID vlastníkovi nasazení. Ten po
ověření, komu účet patří, nastaví `accountId` v souboru `admin.config.json`
a odešle změnu do repozitáře. Automatické nasazení práva aktivuje. Výchozí
hodnota `null` neuděluje práva nikomu. Soubor neobsahuje tajemství a není
součástí veřejného balíčku aplikace; server jej načítá při sestavení.

Volitelná serverová proměnná `ADMIN_ACCOUNT_ID` má vždy přednost před souborem.
Je-li přítomná, ale prázdná nebo neplatná, přístup správce se zakáže i při
vyplněném souboru. Pro ruční konfiguraci Pages slouží projekt
**figofit-mojetempo → Settings → Variables and Secrets → Production**; po
změně je potřeba nové nasazení. Automatické nasazení musí zachovat stejnou
serverovou vazbu. Samotná změna lokálního úložiště nebo hodnoty `role` v
prohlížeči žádná oprávnění neuděluje. Nasazení změněného nebo odebraného ID
odebere práva při následujícím požadavku i již přihlášenému účtu.

`GET /api/admin/overview?offset=0` vrací počty účtů, počet účtů s uloženým
deníkem, celkovou velikost fotografií a nejvýše 50 položek metadata účtů (ID,
přihlašovací e-mail, datum založení, role). Další stránku označuje `nextOffset`.
Přehled nečte obsah deníků ani fotografie. Neobsahuje hesla, obnovovací klíče
ani relace. Je pouze pro čtení a neumožňuje přebírat účty jiných lidí.

API vždy vyžaduje platnou přihlašovací relaci a odpovídající hlavičku
`X-Tempo-Account`. Server rozhoduje o oprávnění sám. Odpovědi se neukládají do
cache. Bez správně nakonfigurovaného ID není žádný účet správcem.
