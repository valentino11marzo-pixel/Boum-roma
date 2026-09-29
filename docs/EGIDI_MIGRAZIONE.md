# egidimmobiliare.it — da GoDaddy a BOOM

Stato al 29/09/2026 sera: **rifondazione da brief, passo 2 di 5** (proposta
inviata a Valentino, si attende l'ok prima di disegnare la home). La home
oggi in `egidi/index.html` è provvisoria. Il sito si pubblica con un progetto
Vercel **suo** (Root Directory `egidi`, team «Valentino - BOOM»): dentro il
progetto `boum-roma`, `egidimmobiliare.it/` servirebbe la home di BOOM,
perché su Vercel una riscrittura non batte un file esistente.
`boomrome.com/egidi/*` rimanda a `www.egidimmobiliare.it`. Il brief vuole i
nameserver fermi su GoDaddy: al go-live cambiano solo `A @` e `CNAME www`.

## Cosa sappiamo e cosa no

| Voce | Stato | Fonte |
|---|---|---|
| Dominio `egidimmobiliare.it` | su GoDaddy (registrazione) | login GoDaddy di gennaio 2026 in Gmail |
| Casella `valentino@egidimmobiliare.it` | **viva**, client Outlook: con ogni probabilità Microsoft 365 venduto da GoDaddy | email di marzo–giugno 2026 (Domeo, EUIPO SME Fund, fatture tienilconto, Stripe) |
| Record DNS attuali | **non letti**: il sandbox non raggiunge né il dominio né i risolutori DNS | — |
| `.it` registrabile su Vercel | **no** (`tld_not_supported`, verificato via API) | Vercel |

La casella è il vero rischio: se i record MX, SPF, DKIM e autodiscover spariscono,
smette di arrivare posta a un indirizzo che usano EUIPO, lo studio Domeo e la
fatturazione.

## L'ordine sicuro

### Fase 0 — Inventario (5 minuti, prima di toccare qualunque cosa)
1. GoDaddy → **I miei prodotti**: annota cosa paghi (Dominio, Sito web /
   Website Builder, Microsoft 365 / Email professionale, SSL).
2. GoDaddy → dominio → **DNS**: screenshot di **tutti** i record (MX, TXT,
   CNAME `autodiscover`, `selector1._domainkey`, `selector2._domainkey`,
   `_dmarc`, SRV). È il salvagente dell'email.

### Fase 1 — Il sito passa a Vercel, l'email non si tocca
1. Merge su `main` del ramo con `egidi/`.
2. Creare il progetto Vercel `egidi-immobiliare` (Git: questo repo, Root
   Directory `egidi`, nessun framework) e aggiungere i domini
   `www.egidimmobiliare.it` (principale) e `egidimmobiliare.it` (redirect
   verso www). Il pannello Domini di Vercel mostra i valori esatti.
3. In GoDaddy → DNS cambiare **solo due record**:
   - `A` · nome `@` → l'IP che mostra Vercel (valore storico `76.76.21.21`)
   - `CNAME` · nome `www` → il valore che mostra Vercel (storico `cname.vercel-dns.com`)

   Se GoDaddy ha un «inoltro dominio» o il Website Builder collegato al
   dominio, va scollegato, altrimenti rimette i suoi record.
   **Non toccare** MX, TXT, `autodiscover`, `_domainkey`, `_dmarc`.
4. Verifiche: `https://www.egidimmobiliare.it` mostra il sito nuovo col
   lucchetto; da Gmail scrivi a `valentino@egidimmobiliare.it` e rispondi.

### Fase 2 — Disdire il sito GoDaddy
Solo dopo 48 ore di fase 1 senza problemi. Si disdice **il sito** (Website
Builder / hosting), **non** Microsoft 365 e **non** il dominio.

### Fase 3 — L'email fuori da GoDaddy
Proposta: `egidimmobiliare.it` come **dominio alias** nel Google Workspace di
boom-rome.com. `valentino@egidimmobiliare.it` diventa un alias della casella
che usi già: nessun costo in più e una sola casella da guardare.
1. Workspace Admin → Domini → aggiungi dominio alias → verifica col TXT.
2. Migrazione della posta storica da Microsoft 365 (servizio di migrazione
   dati di Workspace, con l'account admin M365).
3. Solo a migrazione finita, sostituisci i record MX, SPF e DKIM con quelli
   di Google.
4. Una settimana senza rimbalzi, poi disdici Microsoft 365 su GoDaddy.

### Fase 4 — Il dominio
Vercel non registra `.it`. Due strade, entrambe dopo la fase 3:
- lasciare il dominio su GoDaddy solo come registrazione (circa 20 €/anno),
  coi DNS già puntati altrove;
- trasferirlo a un registrar che gestisce `.it` (codice AuthInfo da GoDaddy).
Il brief del 29/09 tiene i nameserver su GoDaddy: si cambiano solo i
record `A`/`CNAME` del sito, e la verifica di Search Console resta valida
(se è un meta tag nel vecchio sito, va ricopiata nella home nuova).

## Cosa manca al sito (da fornire, mai inventato)
L'elenco completo sta nella proposta del passo 2 (sezione «Da te»):
capitale sociale (art. 2250 c.c.), provvigione di vendita, immobili in vendita
reali, polizza RC, conferma del certificato del marchio BOOM, Entratel,
scheda Google di Egidi, foto vere di Valentino e dello studio, codice di
verifica di Search Console se è un meta tag, ID GA4 della proprietà Egidi.
