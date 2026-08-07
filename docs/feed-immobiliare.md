# Feed Immobiliare.it — specifiche raccolte (2026-08)

Fonte: feed.immobiliare.it/integration/ii/docs/import/get-start (incollata
dall'operatore — il sandbox non raggiunge il dominio). La pagina gemella
`payload-specifications` (nodi completi + XSD) è DA INCOLLARE per chiudere
lo schema; qui i vincoli già certi.

## Due modalità, stesso payload XSD
- **REST (consigliata)**: `PUT /ws/import/immobiliare/property/{unique-id}`
  con XML nel body; `DELETE .../{idListing}` per rimuovere (idListing arriva
  nella ServiceResponse). HTTP BASIC (credenziali dal team Support) + header
  `X-IMMO-SOURCE`. ⚠️ Richiedono gli **IP pubblici** dei server chiamanti →
  Vercel non ha IP fissi → **le chiamate partono dal Mac di Homie** (IP
  residenziale stabile), che legge il feed da /api/feed/immobiliare.xml.
  Periodo di prova con agenzia di test.
- **Batch (storica)**: account **FTP** dal Support; upload quotidiano di UN
  file `feed.xml.gz` (gzip preferito) con TUTTI gli annunci pubblicabili;
  la rimozione è IMPLICITA (assente dal feed = rimosso, salvo protetti).

## Vincoli payload certi
- XSD-valido, **UTF-8 obbligatorio**.
- Identità annuncio = `//property/unique-id` (CDATA) + `//property/agent/email`
  (username agenzia). `<property operation="write">`.
- `date-updated` **ISO-DATE-TIME** (es. 2019-10-10T12:00:12): se la data sul
  loro DB è ≥ della nostra, NON aggiornano ("non negoziabile") → va bumpata
  a ogni modifica reale.
- Tipologia: `<building IDType="14"/>` (id numerico da lista dedicata — TBC).
- Contratto: `<transactions><transaction type="R">` (R=affitto, S=vendita)
  con `<price currency="EUR" reserved="false">1400</price>` — solo EUR.
- Geo: `<location>` con country-code IT, administrative-area,
  sub-administrative-area, `<city code="ISTAT">` (**Roma = 058091**),
  `<locality map="exact">` con postal-code, latitude, longitude,
  `<thoroughfare display="yes">` (CDATA). `@map` può offuscare la posizione
  → si aggancia a boom-geo pinPrecision (exact → "exact"; altrimenti si
  omette l'attributo finché l'enum non è confermato dall'XSD).
- Media: `<pictures><picture position="1" url="…"/>` — URL esterne, max
  5.242.880 byte, server che risponda alle **HEAD** (Firebase Storage ok);
  download asincrono lato loro (minuti).
- `<publish>` opzionale (extra-visibilità); assente = situazione invariata.

## ServiceResponse (REST)
`Result/EntityID/RealEstate/ErrorCode/idListing/lock/RequestID`; ErrorCode:
0 ok · 330 agenzia offline · 400 feed non valido · 440 campo mancante ·
455 tipologia · 460 geo incoerente · 470 XSD fallita · 480 @operation ignota.

## Attivazione (la via che NON passa dal commerciale)
Il team **Support tecnico** fornisce credenziali REST o account FTP +
agenzia di test. Richiesta da mandare all'assistenza tecnica del pannello
agenzia ("attivazione importazione automatica annunci da gestionale
proprietario"), non alle vendite.
