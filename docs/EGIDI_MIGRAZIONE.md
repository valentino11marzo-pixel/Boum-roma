# egidimmobiliare.it — da GoDaddy a BOOM

Stato al 29/09/2026. Il sito nuovo è in `egidi/` (repo Boum-roma) e si
pubblica con un progetto Vercel **suo**, nel team «Valentino - BOOM», con
Root Directory `egidi`. Perché non dentro il progetto `boum-roma`: su Vercel
una riscrittura non batte un file esistente, quindi `egidimmobiliare.it/`
avrebbe servito la home di BOOM (`index.html`), e ogni pagina di BOOM sarebbe
stata raggiungibile anche sul dominio Egidi. Progetto separato vuol dire che un
errore sul sito Egidi non può toccare boomrome.com, e viceversa.
`boomrome.com/egidi/*` rimanda a `www.egidimmobiliare.it`: niente copia
duplicata.

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
In entrambi i casi conviene spostare prima i nameserver su Vercel
(`ns1.vercel-dns.com`, `ns2.vercel-dns.com`) ricreando i record email.

## Cosa manca al sito (non inventato, da fornire)
- **Capitale sociale** della S.r.l.: l'art. 2250 c.c. lo vuole sul sito
  insieme a sede e REA. Non è nel repo, e non va scritto a caso.
- **Foto vera di Valentino**: le pagine «Dossier» e «Cinema» di giugno la
  usano come elemento centrale e ora hanno una foto stock di uno sconosciuto.
  Restano fuori finché non c'è quella vera.
- **Vecchi indirizzi del sito GoDaddy** (da Search Console o dal Builder): per
  i redirect verso la home. Oggi tutto quello che non esiste va sulla 404,
  che rimanda alla home.
- **Immagine social (og:image)**: da generare, come per le altre pagine BOOM.
- Le due foto di sfondo della home sono ancora su Unsplash (decorative,
  `alt` vuoto): da riportare in casa.
