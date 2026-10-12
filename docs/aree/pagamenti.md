# Pagamenti — Stripe, bonifico, SEPA, cadenza delle rate, link di pagamento, canoni per unità

> Dettaglio e storia di quest'area, spostati da CLAUDE.md il 12/10/2026 senza
> riscrivere nulla: stesse sezioni, stesso ordine. Le novità dell'area si
> aggiungono QUI (3-8 righe nella sezione giusta: cos'era, cosa cambia, dove
> sta il test). La mappa del sistema è in `CLAUDE.md`, le priorità in `ORA.md`.

### POST `/api/service-checkout`
Public one-tap Stripe Checkout for the productised services (Services 2.0
pages). Server-side catalog decides price/copy — the client only names the
kind: `virtual-viewing` (€89), `deal-assistance` (€249),
`deposit-recovery` (€99 + 20% success fee, art. 1590 c.c.) or
`contract-check-express` (€49, credited on Deal Assistance). Body `{ kind,
name, email, phone, listing?, notes?, company(honeypot) }`, same hardening
as apply-lead. Returns `{ ok, url }` → Stripe. The webhook branch
`service:'SERVICE'` writes a paid lead (`leads/svc_<sessionId>`) and sends
admin + client confirmation emails. Property Finding (€350) keeps its own
`/api/create-checkout` (PFS metadata + webhook branch); Concierge is
WhatsApp-only. All four pages (`virtual-viewing`, `deal-assistance`,
`property-finding`, `concierge`) are standalone Services 2.0 product pages
(MATERIA ambient, pay-plate + checkout sheet, sticky mobile pay bar,
JSON-LD Service+Offer+FAQ).

### Il bonifico gratuito + la commissione misurata (`api/payments/_ref.js`)
La carta costa a Stripe l'1,5% se europea e il **3,25% se extra-SEE** — e
l'inquilino BOOM è un expat. Una commissione fissa al 2,5% quindi guadagnava
sugli europei e **perdeva su ogni carta estera** (−€26,50 su un canone da
3.500). Due mosse:

- **Il bonifico, a zero.** In `/casa`, accanto al bottone carta: beneficiario,
  IBAN e **causale col codice della rata**, ognuno con copia. Costa zero a
  entrambi e la riconciliazione la fa già `/banca`. Compare SOLO se hai
  impostato `settings/payout` (`{iban, beneficiary}`) — mai un IBAN inventato.
- **`payRef(paymentId)`** → `BOOM-XXXXXX`, derivato (sha256, alfabeto senza
  I/O/0/1), quindi ogni rata esistente ne ha già uno: nessuna migrazione.
  `reconcile()` guadagna una **via esatta** prima delle euristiche: il
  movimento dice quale rata paga. Codice giusto + importo diverso (acconto,
  errore) → suggerimento, MAI un "pagato" falso.
  La funzione è duplicata in `/casa` (`payRefLocal`, crypto.subtle) perché la
  pagina deve mostrare la causale: `tests/bonifico/parity.mjs` gira quella del
  browser in un browser vero e la confronta col server — se divergono, il
  cliente copia una causale che nessuno riconosce.
- **La commissione si misura, non si indovina.** Il webhook salva su ogni rata
  il costo reale (`balance_transaction.fee`), il paese e il brand della carta,
  e alimenta `settings/rentFeeStats`. `rentFee(amount, stats)` = costo medio
  osservato + `RENT_FEE_BUFFER` (default **0 → si va a pari**), con tetto
  `RENT_FEE_MAX_PCT` (4) e forzatura `RENT_FEE_PCT`. Sotto 8 incassi usa il
  **caso peggiore** (3,3% + €0,30): partire sotto costo è il difetto che
  questa formula elimina. `/casa` mostra quel seed come **massimo**, così
  l'addebito reale può solo essere più basso.

### Il canone automatico SEPA (`api/payments/_sdd.js` + `sdd-setup.js` + webhook)
Il cerchio dei soldi chiuso: l'inquilino autorizza UNA volta e ogni rata
parte da sola. Capability `sepa_debit_payments` attivata sull'account
Stripe (Dashboard → Pagamenti → configurazione Default, 2026-08-05).
- **Mandato**: card in `/casa` → `POST /api/payments/sdd-setup` (Bearer
  tenant/admin; un tenant solo sul PROPRIO contratto) → Stripe Checkout
  `mode:'setup'` con `sepa_debit` — l'IBAN non tocca mai i server BOOM. Il
  webhook (`SDD_SETUP`) salva `contract.sdd` {customerId, paymentMethodId,
  mandateRef, ibanLast4, activatedAt} — via `fsPatch` di homie/_lib, NON il
  `patchDoc` locale del webhook che appiattisce le mappe a String(v) (e la
  RILETTURA con `fsGet`, non col `readDoc` locale che le appiattisce a
  null — due trappole vere trovate dai test). Il customer si persiste già
  alla creazione della sessione (riuso sui retry). `action:'cancel'` spegne
  e stacca il payment method.
- **Collector** (`collectSdd()` da reminder-cron, finestra oraria): rate
  `pending` dei contratti con mandato attivo, addebitate `SDD_LEAD_DAYS`
  (7) prima della scadenza — SEPA regola in ~5gg lavorativi, così i soldi
  arrivano intorno alla scadenza. UN addebito per rata PER COSTRUZIONE:
  idempotency key Stripe `sdd_<paymentId>` + guardia `sddPiId` sul doc.
  Solo canone (mai il saldo deposito), mai rate scadute PRIMA del mandato,
  un PI rifiutato scrive `sddInitError` e NON si ritenta da solo (un retry
  SEPA su fondi insufficienti brucia commissioni), Telegram avvisato.
- **Esiti** (webhook, `payment_intent.succeeded`/`payment_failed` filtrati
  su `metadata.service==='RENT_SDD'` — i PI delle Checkout carta passano
  oltre): succeeded → rata `paid · paidVia:'sepa'`, ricevuta EN al cliente,
  costo reale in `settings/sddFeeStats`; già pagata per altra via → MAI
  sovrascritta, allarme doppio incasso (stessa disciplina della carta);
  failed → `sddStatus:'failed'`, la rata RESTA pending e torna pagabile a
  mano, email "paga con carta o bonifico" + Telegram alta priorità.
- **La commissione col margine BOOM**: `sddFee()` = costo medio misurato
  PER ADDEBITO (il costo SEPA è flat, non proporzionale — media diversa da
  quella della carta) + `SDD_FEE_BUFFER` default **€1.50** (qui il margine
  di default NON è zero: richiesto esplicitamente), tetto
  `SDD_FEE_MAX_PCT` 1.5%, seed €0.50. Default ≈ €2/addebito contro ~€30
  di carta su un canone da 900 — l'argomento di vendita è il prezzo.
- **/casa**: terza corsia accanto a carta e bonifico — card 🏦 attiva/
  disattiva (IBAN ••••last4), banner "si sta incassando da sola" che
  SOSTITUISCE bottone carta e bonifico mentre l'addebito è in volo (due
  vie aperte insieme = invito al doppio pagamento), nota rossa se
  l'addebito è fallito, band `?sdd=ok` al ritorno da Stripe.
- Test: `node tests/sdd/run.mjs` (38 check — fee, eligibilità, collector
  idempotente, webhook setup/succeeded/failed/double, endpoint auth).

### Rent cadence (mensile · bimestrale · trimestrale · semestrale · annuale)
`money.installmentMonths` (1|2|3|6|12) + derived `installmentAmount`
(= `chargedMonthly` × cadence) travel the whole chain. **`billEnergyCredit`**
(default true) decides whether the energy allowance is COLLECTED with the
rent (`chargedMonthly` = monthlyTotal) or settled apart against the real
bills (`chargedMonthly` = rent) — the console switch, the document clause,
the PDF, the email and the generated instalments all follow it:
console selector with live instalment preview → client document, PDF and
email ("Rent instalment · paid quarterly in advance") → `contracts.
installmentMonths/installmentAmount` (canone.installments stays the MONTH
count: portal.html validates monthly×installments===total and would
"auto-fix" it destructively) → the schedule generator.
**The schedule (api/magic-sign/submit.js step (e) and the portal's
`generateMonthlyPayments`, kept in sync) counts LEASE months, not calendar
months**: a lease starting on the 10th is billed in full from day one, the
due date never falls before the period starts, month-ends are clamped, the
last period is prorated to what the lease actually has left, and both
paths write the same deterministic id `pay_<contractId>_<YYYY-MM>` (plus
`coversTo`, `installmentMonths`) so they can never duplicate a schedule.
Legacy contracts with no cadence field behave exactly as before.

### GET/POST `/api/payments/recover-checkouts` (cron ogni 4h) — IL RECUPERO
I quasi-clienti di Stripe. Legge le checkout session SCADUTE degli ultimi 14
giorni: **PFS/SERVICE/RESERVE** (form completo, arrivati al pagamento, mai
pagato) → lead `strec_<sessione>` in `leads` (status `new`, source
`stripe-recovery`) e da lì la macchina ESISTENTE fa tutto da sola (Lead
Brain → notify-pending con bottone WhatsApp → Commerciale);
**PREAGREEMENT/DEPOSIT/RENT** scaduti → recap Telegram (il cliente è già
nel pipeline: ha accettato e non ha pagato, serve l'operatore, non un lead
doppio). Mai un falso positivo: email dell'operatore filtrate (i suoi
test), chi ha RIPROVATO e pagato viene saltato (check sessioni complete
per email), chi è già in `leads` viene saltato, id deterministico → un
rerun non duplica mai. La lingua del lead viene SOLO dalle parole verbatim
del cliente (mai dal riassunto italiano per l'operatore). Heartbeat
`teamHealth/recupero` (card ♻️ in `/team`). Auth come i cron PFS; `?dry=1`.
Test: `node tests/recovery/run.mjs`.

**`api/stripe-webhook.js` — soldi che tornano indietro, mai in silenzio**:
oltre a `checkout.session.completed` ora gestisce `charge.refunded`,
`charge.dispute.created` (alert Telegram ad alta priorità con la SCADENZA
per le prove — una dispute non risposta è persa) e `charge.dispute.closed`
(esito). Idempotente sui retry via `agentNotifications/stripe-<eventId>`.
I 4 eventi sono abilitati sull'endpoint live (`we_1TOvpx…`).

### One-tap buy from an email — `GET /api/services/buy`
`?kind=&e=&n=&ref=` → creates the Stripe session from the shared catalog
(`api/_catalog.js`, imported by both this and `service-checkout.js`; it
holds no Stripe client so a missing key can't crash the module) and 302s
into Checkout. Only `EMAIL_BUYABLE` kinds (movein-pack, cleaning-premium)
are sellable from a bare link — the others need their page's context. A
malformed `e` is dropped rather than shadowing what the buyer types on
Stripe (the webhook now prefers `session.customer_details.email`). The
journey emails carry it as the gold button with a WhatsApp line underneath,
and skip the pitch entirely for a product already bought (`leads` lookup,
one query per run).

### Canoni per unità e ricavi BOOM — 17 settembre 2026
**Chiusura P2 Claude, 18/09:** la revoca amministrativa di un bonifico segnalato richiede motivo (10–500 caratteri), ruolo admin e stato ancora revocabile. `payments/report` salva insieme revoca e audit immutabile in `activityLog`, con CAS e attore autenticato; nessun incasso registrato. Stati pagati/in corso/incerti e prove di regolamento bloccano la revoca.
Il pagante vede «Ricevuta non ancora disponibile» se il bonifico riconciliato non ha un file. L'admin può archiviare una ricevuta da rata già pagata riletta dal server, senza richiamare `markPaymentPaid`, fatture o comunicazioni.
`archivePaymentReceipt` riusa documenti esistenti o un ID deterministico; documento e collegamento rata sono atomici. Pagamento cambiato durante upload, ricevuta estranea/ambigua o commit fallito non producono un collegamento falso. Un upload fallito nella fase finale può lasciare un file non collegato, mai una ricevuta dichiarata disponibile.
`isReceiptDocument` richiede anche `type:'receipt'`, lo schema sia dell'archivio generato sia di Smistatore ricevuta_canone. Un paymentId coincidente e un URL HTTPS non trasformano fattura o prova bonifico in ricevuta. La ricerca legacy filtra il tipo, e /casa applica la stessa guardia; documento privo di tipo resta da verificare.
Prove `paymentlinks` (ruolo, motivo, audit, retry e conflitto) e mutazioni; `rentadmin` (archivio concorrente/ripetuto, stato fresco, errore, ricevute pregresse e form admin); `tenantpayments` IT/EN.

**Revisione con Claude, 18/09:** prima le unità, sei mesi per riga e una sola prossima azione che apre il contesto senza inviare o registrare. Le operazioni complete restano nei dettagli. Riepiloghi sotto l'elenco: da pagare, segnalato e in corso sono somme distinte.
`BOOM_RENT.timeline/nextAction` proietta i record esistenti; una cella con più rate dichiara il numero e le apre tutte, quella vuota non inventa debiti. Il dettaglio conserva i riferimenti per ogni rata.
Non viene dedotta una stanza dal testo `contract.unit` (nel portale proviene anche da `interno`). Nessuna nuova chiave di unità o migrazione dati. Prove `rent/rentadmin`; revisione visiva ancora da completare.
`js/rent-engine.js` (UMD `BOOM_RENT`) deriva unità, periodo, importi e stati da
payments/contracts/properties/users: nessuna copia persistente. Include unità senza rate e collegamenti mancanti;
depositi/altri addebiti sono separati. Le ricevute `paymentId`/`rent-receipt` restano consultabili dai canoni,
ma non alimentano la vista fatture servizi e i compensi BOOM. Il riepilogo non somma più canoni e compensi;
Valentino ha confermato: BOOM è solo agenzia, senza subaffitto. I canoni e le cauzioni sono somme per proprietari.
Anche i quattro riepiloghi aziendali del portale e gli input ricavi di `contabile`/`scadenzario` escludono le ricevute tramite `businessInvoices`; formule fiscali e scadenze dei proprietari non cambiano.
`agencyCollections` nel motore puro distingue capitale per terzi, addebiti da classificare e commissioni realmente registrate. Costi mancanti espliciti; nessuna commissione ricostruita o aggiunta due volte alle fatture.
Prove `agencyaccounting` sugli handler reali, due mutazioni, più `rent`/`rentadmin`; anno determinato dalla data civile di Roma. Nessuna riclassificazione scritta sui record storici.
Aggiornamento server paginato, fallimento esplicito e timbro invalidato dal caricamento cache/core.
La prova caricata dal cliente resta consultabile prima dell’incasso manuale; la ricevuta usa gli ID diretti della rata prima del contratto.
Le ricevute storiche senza rata sono in «Ricevute da collegare»: documento accessibile, nessuna associazione inventata né ricavo di servizio.
Sollecito email, WhatsApp e colori degli importi restano nella lista; checkout distingue anche depositi e altri addebiti.
Test: `rent` (anche mutazioni), `rentadmin` (funzioni vere, filtri, documenti, link, export e refresh) e `finish` (controlli e azioni effettivi).

### Link di pagamento Stripe (`/api/payments/link` + `link-for`)
Aggiornamento 17/09: `paymentBlockReason` condiviso blocca pagato/annullato/SEPA o carta in corso/stato sconosciuto.
`_checkout.js` riusa una sessione aperta della stessa rata/fattura; un completamento attende il webhook.
Il ritorno dal link pubblico è solo lettura e non crea una nuova sessione. Commissione del link = quella
misurata del portale. Nessuna garanzia di serializzazione universale fra richieste concorrenti o collector SEPA.
Le pagine del link mostrano tipo, periodo, scadenza e importo salvati; una sola azione coerente con lo stato (ricevuta, verifica o ripresa).
Nessun contesto non verificato, link ricevuta solo HTTPS, nessun auto-refresh o nuova sessione nei ritorni.
Test `paymentlinks` + `paymentlinkmutations`: handler veri e rete simulata, contesto e azioni verificati, difetti ripristinati devono fallire.

Il portale può incassare QUALSIASI rata o fattura con carta, mandando un
link su WhatsApp. Il link **non è** una Checkout Session (quella scade in 30
minuti, per scelta): è un URL stabile di BOOM che riusa una sessione compatibile ancora aperta
o ne crea una quando serve — si manda oggi e si paga la
settimana prossima. Il token è **derivato** (`_token.js`, HMAC su
`HOMIE_SECRET`), quindi ogni rata e ogni fattura già esistente ha da subito
un link valido senza migrazioni, e ruotando il segreto si revocano tutti.
- `POST /api/payments/link-for` — admin/owner/landlord: `{kind:'pay'|'inv', id}`
  → `{url}`. Il calcolo del token resta server-side (se il segreto arrivasse
  al browser chiunque potrebbe generare link per qualsiasi documento). Un
  landlord ottiene link solo per i propri immobili; le fatture sono admin-only;
  documento inesistente 404, già pagato 409.
- `GET /api/payments/link?k&id&t` — pubblico, nessun login. Casi non-felici
  resi come **pagine HTML** in stile BOOM, mai come JSON (chi apre un link e
  vede `{"error":"not_found"}` pensa a una truffa): già pagato (con link alla
  ricevuta), link non valido, importo anomalo, pagamenti non configurati.
- La **commissione di servizio** si applica solo al canone (è il costo della
  carta, voce a sé come in `payments/pay.js`); su una fattura BOOM no —
  sarebbe farsi pagare due volte lo stesso servizio.
- Ramo webhook **INVOICE**: segna la fattura `paid/paidVia:'stripe'` con
  `receiptUrl`, scrive la notifica operativa e manda le ricevute. Stessa
  disciplina del canone: retry della stessa sessione → `duplicate`; una
  SECONDA sessione su un documento già saldato non sovrascrive mai nulla e
  fa scattare l'allarme **doppio incasso** (`agentNotifications`).
- UI: bottone 💳 sulle righe di Pagamenti e Fatture → pannello con link,
  copia, **WhatsApp col messaggio già scritto** (quando il numero è in
  archivio) e anteprima. `copyToClipboard()` ricade su `execCommand` e poi
  su `prompt()` — su Safari senza contesto sicuro `navigator.clipboard` non
  esiste e il tasto sembrerebbe rotto.
Coperto da `tests/money/run.mjs` (token stabile/non trasferibile fra tipi,
autorizzazioni di `link-for`, incasso fattura, idempotenza, doppio incasso).
