# STUDIO — L'Archivio del Proprietario (22/09/2026)

*Tavolo condiviso Claude ⇄ Codex. Questo file è la sessione: le decisioni,
le obiezioni e lo stato dei lotti si scrivono QUI (§9), non in una chat che
l'altro non vede. Se un'istruzione contraddice questo studio, vince lo studio;
se lo studio è sbagliato, si corregge con una PR su questo file, motivata.*

## 0. La richiesta, e cosa c'è di sbagliato nel modo in cui è posta

Valentino: «la owner dashboard è rimasta indietro, non è interconnessa con
l'ingegneria attuale né con le streamline documentali; va portata a qualità
ultra, stile Apple, come *archivio personale, tutto sotto controllo*».

Prima di costruire, tre correzioni al quadro:

1. **Non esiste UNA owner dashboard da aggiornare. Ne esistono DUE, e una è
   finta.** Aggiungerne una terza «più bella» triplicherebbe la divergenza.
   L'obiettivo è UNA superficie proprietario sui dati veri, e il ritiro delle
   altre.
2. **«Stile Apple» non è un tema grafico: è che l'archivio si riempie da
   solo.** Il proprietario non carica niente, non cerca niente: ogni
   documento che la macchina GIÀ produce (contratto firmato, certificato FES,
   verbale, inventario, rendiconto, fascicolo fiscale, valutazione, ricevute)
   gli compare nel posto giusto nel momento in cui nasce. La parte difficile
   è permessi + provenienza del documento, non la UI. Una UI splendida su un
   archivio vuoto è `owner-dashboard.html`, cioè il problema di oggi.
3. **«Tutto sotto controllo» ≠ «tutto visibile».** Il proprietario è parte
   del contratto, non l'amministratore del conduttore. Alcune cose NON deve
   vederle (documenti d'identità del conduttore, note operative, lead,
   trattative su altri immobili). Il confine si decide per iscritto (§5),
   prima del codice.

## 1. Misura — lo stato reale (letto sul codice, 22/09)

| # | Fatto | Dove |
|---|---|---|
| M1 | `owner-dashboard.html` (1.827 righe) non ha login né Firestore: legge e scrive `localStorage('boomOwnerProperties')`. Un proprietario che ci arriva vede un portafoglio VUOTO, o quello che ha digitato lui su quel browser. È un prototipo pubblico, `noindex`, con due blocchi JSON-LD. | `owner-dashboard.html:1451-1480` |
| M2 | CLAUDE.md e `api/agent/concierge.js:6,73` la descrivono come «SPA Firestore filtrata per ownerId» che manda un ID token. È falso: documentazione che mente sulla superficie. | `CLAUDE.md` tabella Portals |
| M3 | La superficie VERA del proprietario è il ruolo `landlord` dentro `portal.html` (~21K righe dell'admin): `my-properties`, `my-contracts`, `my-payments`, `my-maintenance`, `my-documents`, `commercialista` lite, `market`, `inbox`. È una vista ridotta dell'admin, non un prodotto pensato per chi possiede. | `js/portal-app.js:4286-4336` |
| M4 | **Bottone morto**: la riga rata del landlord mostra `✔` → `markPaymentPaid()`, che esce in silenzio con `if (!isAdmin()) return;`. E le rules non concedono l'update comunque. Il proprietario preme, non succede niente, nessun messaggio. | `js/portal-app.js:14617`, `:17302`; `firestore.rules:96` |
| M5 | Il landlord non può leggere `users` degli altri: i nomi degli inquilini non arrivano (il loader lo dichiara: «render by id»). La card mostra «Inquilino». | `js/portal-app.js:2621-2623`; `firestore.rules` users |
| M6 | **L'archivio del proprietario è vuoto per costruzione.** `documents` è leggibile dal landlord solo se `userId == lui` o `shared == true` sul suo immobile; il contratto firmato viene archiviato con `userId` dell'INQUILINO. Storage `contracts/**`, `property-docs/**`, `rendiconti/**` sono admin-only. | `firestore.rules:119-126`; `storage.rules:132,157,186` |
| M7 | Quindi tutto ciò che la macchina produce per il proprietario gli arriva **solo per email**: rendiconto mensile (PDF), welcome IT post-firma con contratto + FES, verbale, inventario, valutazione. Nessuna memoria ordinata: la sua «cartella» è la casella Gmail. | `api/owners/rendiconto.js`, `api/sign/_notify.js`, `api/contracts/verbale.js` |
| M8 | `rendiconti/<ownerId>_<mese>` esiste in Firestore ma è admin-only: il proprietario non può rivedere il rendiconto di marzo se ha perso l'email. | `firestore.rules:324` |
| M9 | Esiste già la proiezione giusta, lato admin: `js/property-dossier-engine.js` (fascicolo immobile da record caricati, canoni via `BOOM_RENT`, nessun IO, nessun match per nome). **La vista proprietario deve riusarla, non riscriverla.** | `js/property-dossier-engine.js` |
| M10 | `Income mensile` del landlord somma `c.rent` con `toLocaleString('it-IT')` — la lezione small-ICU (`1250,00` invece di `1.250,00`) già pagata altrove, e nessun legame con `BOOM_RENT` (incassato vs dovuto vs in ritardo). | `js/portal-app.js:14410-14450` |

Nota di onestà: non abbiamo misurato **quanti proprietari hanno un account
`landlord` attivo e lo usano**. Se sono zero, l'archivio va progettato per il
primo ingresso (magic link dal rendiconto), non per l'utente abituale. →
Domanda D1 (§8), da misurare prima del Lotto P2.

## 2. La visione — «L'Archivio»

Una superficie sola, `/proprietario` (nome da confermare, D6), che risponde a
tre domande in quest'ordine, sempre:

1. **Va tutto bene?** — una riga di stato per immobile, dal fatto, mai da un
   aggettivo: «Via Cavour 12 · affittato fino al 31/08/2027 · settembre
   incassato il 4/09 · nessuna scadenza nei prossimi 30 giorni». Se qualcosa
   non va, è la prima cosa e dice chi se ne occupa (BOOM o lui).
2. **Cosa devo fare io?** — solo ciò che è davvero suo: firmare, completare la
   Scheda, approvare un preventivo, pagare un'imposta con scadenza. Di norma
   vuoto. Un archivio che chiede lavoro ogni giorno non è sotto controllo.
3. **Dov'è quel documento?** — l'archivio: per immobile → per contratto → per
   anno, ogni documento con la sua **provenienza** (chi l'ha prodotto, quando,
   da quale evento) e il suo **stato** (firmato / bozza / sostituito da…).
   Ricerca per parola. Un tap = il PDF.

Principi di forma (la parte «Apple», tradotta in regole verificabili):
- **Il sistema lavora, il proprietario guarda.** Zero caricamenti obbligatori;
  i vuoti si dichiarano («APE non ancora nel fascicolo — la chiede BOOM»), non
  si nascondono.
- **Tempo come asse.** Una linea di vita per immobile: proposta → firma →
  registrazione → consegna chiavi → rate → rendiconti → riconsegna. È la
  forma naturale di un archivio personale, e c'è già tutta nei dati.
- **Un numero è un fatto o non c'è.** Incassato, dovuto, in ritardo da
  `BOOM_RENT`; cedolare/IMU da `fiscal-engine`; sotto dato mancante → «da
  completare», mai una stima travestita.
- **Italiano di default, EN a un tap** (proprietari expat esistono); numeri
  deterministici (`itNum`), date di Roma.
- Telefono prima: si apre dall'email del rendiconto, su iPhone, il 1° del mese.

## 3. Architettura proposta (da contestare, §8)

**Scelta: modello di lettura LATO SERVER, non allargamento delle rules.**

Allargare `firestore.rules`/`storage.rules` perché il browser del landlord
legga `contracts/**` e `users` degli inquilini apre più di quanto serve
(un URL tokenizzato di Storage è una credenziale permanente) e sposta la
regola di privacy dentro dieci `allow`. Invece:

- `js/owner-archive-engine.js` (puro, UMD → `window.BOOM_OWNER`): da record
  già letti produce `{ properties[], todo[], timeline[], archive[] }`. Riusa
  `property-dossier-engine` e `BOOM_RENT`; **l'archivio si DERIVA dai campi
  che esistono già** (`contract.signedPdfUrl`, `fesCertificateUrl`,
  `verbaleConsegna`, `inventario`, `fascicoloFiscaleUrl`, `schedaCanoneUrl`,
  `valutazioneBoomUrl`, `properties.dossier.*`, `rendiconti/*`, `documents`
  con `propertyId`), con una tabella di **visibilità per tipo** (§5). Nessuna
  collection nuova, nessuna migrazione, nessun secondo stato (AGENTS regola 6).
- `GET /api/owner/archivio` (Bearer landlord/admin; un landlord solo sui
  PROPRI immobili — stessa autorizzazione object-level di `verbale`/`send-link`):
  legge con credenziali admin, passa dal motore, restituisce la proiezione
  **senza URL di Storage**.
- `GET /api/owner/file?ref=<id>` : riverifica titolarità e visibilità, poi
  streamma il file (o redirect a URL firmato a breve scadenza). Il PDF non
  lascia mai un link permanente nel browser. Ogni apertura va in
  `activityLog` (il proprietario vede anche *chi ha guardato cosa* di suo? D5).
- UI: pagina standalone `proprietario.html`, `BoomPortal.requireAuth(['landlord','admin'])`
  (admin = «vedi come il proprietario X», per il supporto), nessun
  `portal-app.js` caricato. `owner-dashboard.html` → redirect 308 a
  `/proprietario`; il ruolo landlord in `portal.html` atterra lì.

## 4. Le streamline documentali da agganciare

L'archivio non inventa eventi: li legge da chi li produce già.

| Evento | Produttore | Oggi arriva al proprietario | Nell'Archivio |
|---|---|---|---|
| Valutazione BOOM | `api/fiscal/valutazione.js` | email/nessuno | Immobile → Valutazioni |
| Scheda anagrafica (sua) | `api/profile/*` | link /scheda | Da fare, se manca qualcosa |
| Contratto (bozza) | `convert.js` / `contract-pdf.js` | no | Contratto → bozza, «non firmato» |
| Firma + FES | `magic-sign/submit` + `_finalize.js` | email welcome IT | Contratto → firmato + certificato |
| Fascicolo fiscale / Scheda ARPE | `api/fiscal/fascicolo.js` | no | Contratto → Fiscale |
| Registrazione RLI | `✓ RLI registrato` / ASPI | no | Linea di vita + ricevuta |
| Verbale chiavi, inventario | `verbale.js`, `inventario.js` | email PDF | Contratto → Consegna |
| Rate e ricevute | `payments`, `BOOM_RENT` | rendiconto mensile | Soldi → per mese |
| Rendiconto | `api/owners/rendiconto.js` | email PDF il 1° | Soldi → Rendiconti (tutti) |
| Manutenzione | `maintenance` | no | Immobile → Interventi |
| Scadenze fiscali sue | `fiscal-engine` (landlord) | no | Da fare, con importo o «da calcolare» |
| Riconsegna / inventario uscita | `inventario` diff | email | Contratto → Chiusura |

## 5. Il confine (decisione scritta, non buonsenso)

Visibile al proprietario: i suoi immobili e contratti; nome del conduttore
come stampato sul contratto; canoni, rate, ricevute, rendiconti; contratto,
FES, fascicolo, scheda ARPE, verbale, inventario, valutazione; manutenzioni
del suo immobile; le proprie scadenze fiscali; il dossier del suo immobile.

**Mai**: documenti d'identità e CF/residenza del conduttore oltre a quanto
il contratto firmato già stampa; recapiti del conduttore (salvo decisione
D4); lead, visite, trattative e proposte non accettate; note interne,
`activityLog` altrui, conversazioni; dati di altri proprietari (anche in un
immobile in comproprietà — fuori scopo finché `ownershipPct` non è letto da
nessuno, vedi CLAUDE.md «Fuori scopo, dichiarato»).

La tabella di visibilità vive nel motore, una riga per tipo, e un test la
pinna per mutazione: aggiungere un tipo senza dichiararne la visibilità fa
cadere la suite.

## 6. Lotti e divisione del lavoro

Ogni lotto = un ramo + una PR verso `main`; **l'altro agente la rivede prima
che Valentino la unisca** (review scritta nella PR). Perimetri di file
disgiunti: toccare un file di un altro lotto è un errore di perimetro.

| Lotto | Chi | Perimetro (file) | Uscita |
|---|---|---|---|
| **P0 — Confronto** | Codex | solo questo file (§8 risposte, §9 registro) | Critica scritta: architettura, confine, rischi. Nessun codice. |
| **P1 — Il motore** | Claude | `js/owner-archive-engine.js`, `tests/owner/engine.mjs` | Proiezione pura + tabella visibilità, test per mutazione, riuso dichiarato di dossier/rent/fiscal. |
| **P2 — La porta** | Codex | `api/owner/*`, `tests/owner/api.mjs`, `vercel.json` (una regola, ≤50!) | `archivio` + `file`, auth object-level, nessun URL Storage in uscita, handler veri su Firestore in memoria. |
| **P3 — La superficie** | Claude | `proprietario.html`, `css/proprietario.css`, `tests/owner/ui.mjs` | La pagina, telefono prima, Chromium vero a 390/1440. |
| **P4 — Il ritiro** | Codex | `owner-dashboard.html`, `vercel.json` redirect, `js/portal-app.js` (solo routing landlord + bottone morto M4), `api/agent/concierge.js`, `CLAUDE.md` tabella Portals | Una superficie sola; M2/M4/M5 chiusi. |
| **P5 — Le azioni** | da decidere dopo P3 | — | Firmare, Scheda, approvare preventivi. Solo quando la lettura è provata. |

Regola di vincolo fra lotti: P2 dipende dall'interfaccia di P1 (firma di
`build()` fissata in §9 prima di iniziare P2, anche con stub); P3 dipende dal
formato di risposta di P2 (fissato in §9).

## 7. Righe rosse

- Nessun URL tokenizzato di Storage nel browser del proprietario.
- Nessuna nuova collection per «l'archivio»: si deriva (se il P0 dimostra che
  non basta, si decide qui, con motivo).
- Nessun numero senza fonte; nessun `toLocaleString` per importi.
- Nessuna azione in P1–P4: la superficie legge. Le azioni sono P5.
- `vercel.json` resta ≤ 50 regole `functions` (`tests/mandato` §9).
- Nessun invio di email/WhatsApp nuovo al proprietario in questo lavoro.

## 8. Domande aperte — Codex risponde per primo (Lotto P0)

- **D1.** Quanti `users` con `role:'landlord'` esistono e quanti hanno un
  `lastLogin`? (Serve una lettura admin: se Codex non può, lo scrive e la fa
  Valentino.) Se ~0: il P3 è progettato per il primo ingresso da magic link.
- **D2.** Proxy di download (`api/owner/file`) vs URL firmati a breve scadenza
  (Firebase Storage non li dà nativamente con le regole client; servirebbe
  l'Admin SDK o la REST con service account). Quale regge meglio su Vercel
  entro i 60 s e con PDF da 5-15 MB?
- **D3.** Derivare l'archivio dai campi (proposta) vs un indice `documents`
  scritto dai produttori. Il derivare copre gli storici senza migrazione ma
  lega il motore a ~12 nomi di campo sparsi: è un difetto accettabile o una
  trappola di deriva? (Proposta di guardia: test anti-deriva che cerca ogni
  campo letto nei produttori, come `READS` in `contract-fields`.)
- **D4.** I recapiti del conduttore al proprietario: sì, no, o solo dopo la
  firma? (Decide Valentino; Codex dà il rischio GDPR.)
- **D5.** Registro delle aperture visibile al proprietario («il tuo contratto
  è stato aperto da BOOM il…»): trasparenza o rumore?
- **D6.** Nome e URL: `/proprietario`, `/archivio`, `/owner`? E l'admin «vedi
  come» è una necessità o un rischio?
- **D7.** Dove sbaglia questo studio? (Obbligatoria: almeno un'obiezione
  motivata. Un «tutto ok» non chiude il P0.)

## 9. Registro della sessione (append-only, più recente in fondo)

Formato: `AAAA-MM-GG · Chi · Tipo (decisione | obiezione | stato | interfaccia) · testo`.

- 2026-09-22 · Claude · stato · Studio aperto; misura M1–M10; lotti proposti.
  In attesa del P0 di Codex. Nessun codice scritto.
