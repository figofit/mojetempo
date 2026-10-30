# Osobní pozvánky do Moje tempo

Pozvánka otevře stránku pro jednoho člověka. Ten si vytvoří vlastní účet nebo se
přihlásí ke svému a výslovně potvrdí vložení připraveného milníku do kroniky.
Heslo ani obnovovací klíč se nesdílí se správcem. Účet vznikne běžnou registrací,
nikoliv samotným vytvořením pozvánky. E-maily aplikace zatím neodesílá.

Soubor `invitations.config.json` je důvěryhodná konfigurace serveru. Obsahuje
identifikátor pozvánky, SHA-256 náhodného 32bajtového kódu, datum platnosti
a šifrovaný obsah. Jméno a milník jsou šifrované pomocí AES-256-GCM; klíč se
odvozuje ze soukromého kódu s oddělenou doménou. Veřejný hash kódu obsah nerozšifruje. Soukromý kód se neukládá do Git ani do veřejného sestavení. Odkaz má tvar
`https://moje.itfit.cz/#pozvanka=<soukromy-kod>`; fragment se neposílá s navigací
nebo načtením souborů webu. Aplikace kód předává jen v JSON požadavku přes HTTPS
na vlastní API. Do dalšího nasazení je konfigurace pouze připraveným návrhem.

Pozvánka připravuje osobní milník podle zadání. Neobsahuje import historie
ani připojení k databázi původní aplikace na jiné adrese.
Oba deníky fungují samostatně; případný společný přenos vyžaduje další návrh.

Jedna pozvánka patří nejvýše jednomu účtu, což vynucuje unikátní klíč v tabulce
`invitation_claims`. Přijetí přidává moment s pevným ID, zachovává původní zápisy
a cíle a používá revizi deníku. Při souběžné změně lze pozvánku zopakovat;
opakované úspěšné přijetí nevytvoří duplicitu ani neobnoví uživatelem smazaný
milník. Jméno z pozvánky se nastaví jen u prázdného deníku s výchozím názvem.

Přijetí vyžaduje platnou relaci, stejný Origin a hlavičku identity účtu. Účet
správce pozvánku nepřijímá, aby se osobní milník omylem nevložil do jeho deníku.
API vrací jen potřebný náhled a nesděluje identitu účtu, který odkaz použil.
Pozvánka neuděluje roli správce, placené předplatné ani oprávnění k cizím datům.

Samostatný test `python3 tests/invitation_smoke.py` spouští skutečný lokální
Pages runtime a D1 s testovací pozvánkou. Nevytváří produkční účty a nepoužívá
živý soukromý kód. Prodejní balíček IT FIT Vault + osobní deník lze doplnit
samostatným systémem nároků na přístup; aktuální pozvánky jej nenahrazují.
