# STUDIO — L'ECOSISTEMA · settembre 2026
### Formato: decisioni, non opzioni. La domanda del fondatore è dentro.

*4 settembre 2026. Domanda del fondatore: "ora che abbiamo Fable 5.1 e oggi
Astra di ChatGPT, voglio una visione vera, ultra-intelligente e sorprendente
di tutto BOOM — la parte interna, l'ecosistema, il sistema operativo. Cosa
possiamo migliorare, creare o rifare che finora non potevamo pensare; e cosa
non ho capito di quello che sto dicendo."*

*Metodo: 100 agenti in un giro solo — dieci lettori (uno per sottosistema,
tutti ancorati al codice, non a CLAUDE.md), nove strateghi indipendenti con
lenti diverse (l'ora dell'operatore, la vita dell'inquilino, il proprietario,
i soldi, il fossato dei dati, l'architettura, il contrario/la cancellazione,
l'espansione, l'AI verso il cliente), 45 proposte fuse in 26, ognuna
contestata da TRE confutatori distinti (già-esiste-nel-repo · fattibilità per
uno+macchina coi blocchi noti · legge/marca/premessa), 19 sopravvissute, 7
bocciate, poi un critico di completezza e un giudice. Sopra, la mia verifica
a mano di ogni affermazione che entra in questo foglio: log di produzione
Vercel, run della CI, workspace ElevenLabs, Firestore interrogato da anonimo,
il codice riga per riga. Dove un numero viene dalla tua casella è detto.*

---

## 0 · La risposta in tre righe

1. **Il collo di bottiglia non è mai stato cosa si può costruire.** In dodici
   giorni sono entrati in main 18 run di CI rossi di fila (369→386), 35
   funzioni uccise a 60 secondi senza un solo messaggio, il rendiconto del 1°
   settembre morto al primo proprietario, una receptionist vocale a zero
   chiamate, tre bracci sul Mac che non hanno mai chiamato casa, e un "Save
   this search" sul catalogo LIVE che stampa *PREVIEW — nothing is sent*.
   **Nessuno di questi fatti l'hai scoperto tu.** Un modello più forte con lo
   stesso brief — "costruisci" — diverge più in fretta, non converge.
2. **BOOM non è ancora un sistema operativo: è un museo di venticinque
   dipendenti, venti dei quali nessuno sorveglia.** Un OS ha quattro parti —
   kernel, braccia, governance, il posto dell'umano — e oggi ce n'è una e
   mezza. §5 dice quali sono e cosa manca a ciascuna.
3. **Quello che la nuova generazione di modelli cambia davvero sono TRE
   ruoli, non venticinque agenti**: il lettore del mattino (chi apre i log e
   nota il 403), la sessione lunga che tiene insieme contratto, diff e
   produzione, e la Moviola (la tua storia usata come banco di prova di
   qualunque modello). Nessuno dei tre esiste. §6.

Il progetto sorprendente non è un prodotto nuovo: è **trasformare BOOM da
macchina che costruisce in macchina che si legge** — e, nel secondo mese,
costruire l'unica cosa che manca al ciclo: **il sistema operativo del
cliente**, non solo del deal (§7).

---

## 1 · Lo stato della macchina, letto il 4 settembre (fatti, non stime)

| Cosa | Prova | Stato |
|---|---|---|
| CI su main | run 369→386, tutte con job falliti; `full-suite` cade su `dispo` (test agganciato al calendario, rosso da settembre — cade anche qui) e su `regole`; `deploy-rules` cade perché il `FIREBASE_TOKEN` (login:ci del 20/08) è scaduto | **rossa da 12 giorni, ignorata** |
| Regole in produzione | alle 17:12 UTC la CI vedeva `publicGeo` 403; alle 22:00 la sonda da questo sandbox la vede 200 → **oggi qualcuno ha deployato a mano**. Ma il job resta morto: **la prossima regola non arriva da sola** | riparata a mano, non risolta |
| Rendiconto proprietari | `api/owners/rendiconto.js:135` scrive il marker di idempotenza PRIMA dell'upload (:142); `storage.rules` non ha MAI avuto `rendiconti/` (default deny); 1/9 06:10 UTC: *Storage upload failed (403)*; ogni rerun risponde `already_sent`; soglia allerta 3 fallimenti su un cron MENSILE = Telegram parlerebbe a dicembre | **0 rendiconti consegnati, mai** |
| Funzioni uccise a 60s | 35 occorrenze: reminder-cron (incassa gli affitti), magic-sign/submit (la firma), leads/scan-inbox, pfs/scan-inbox, segretaria/scan-replies, commerciale; ultima 1/9. Battito scritto a FINE lavoro → un kill non scrive niente | **zero allerte per costruzione** |
| Analytics | Vercel Web Analytics **mai attivate** (404 dall'API). GA4 c'è su 72 pagine ma nessuno la legge. Zero dato di traffico dietro l'intero investimento SEO/GEO | cieco |
| Receptionist (via B) | agente ElevenLabs creato il 22/8, **nessun numero collegato**, i due tool puntano a `https://boomrome.com/...` con `follow_redirects:false` → l'unica chiamata vera (22/8) ha ricevuto un redirect e "non ha potuto accedere al catalogo"; 0 chiamate da allora; due agenti zombie ("Sofia" feb 2026, "Sales agent" nov 2025) | costruita, mai accesa, e romperebbe alla prima chiamata |
| Il Mac | traffico reale/giorno: 2.722 heartbeat, 750 `state.snapshot`, 720 `risk.scan` (polling puro ≈ 8k letture Firestore), 716 `homie/message`, 429 `wa-outbox`. **Scout, Contatto, Publisher: assenti dai percorsi** — `bot/boom_scout.py`, `boom_contatto.py`, `boom_publisher.py` non hanno mai chiamato `/api/homie/searches`, `/api/homie/property`, `/api/outreach/queue`, `/api/publisher/queue` | tre bracci = documentazione con estensione `.py` |
| WhatsApp in entrata | non esiste uno script che inoltri i messaggi: è un LLM (OpenClaw) che obbedisce a `bot/HOMIE.md`. Tutto ciò che sta a valle — lead in un minuto, la Segretaria che si spegne se rispondi tu, l'eco, la Miniera — poggia su una **promessa a un prompt** | pipe = fede |
| Vercel | 49 progetti, 1 vivo, ~48 zombie (set–nov 2025); l'audit del 18/08 chiedeva di cancellarli | non fatto |
| Catalogo live | `apartments.html:2918` "PREVIEW — nothing is sent"; `:3366` `console.log('POST /api/search/save')` senza fetch. L'endpoint, le rules, il cron del Segugio (3×/giorno) girano per UN iscritto: il tuo test | il canale lead c'è, la porta no |
| Superficie | 144 html in root (34 preview escluse dal deploy), 248 file in `api/`, 28 cron, 25 agenti (20 senza approvazione), 71 collection, 102 suite. Per 26 case, 4 libere, ~19 contratti, un operatore | 2× la sostanza (già detto il 18/08) |

---

## 2 · Cosa non hai capito delle tue parole

**"Il server pensa, il Mac esegue."** È al contrario. Il Mac non esegue: è un
LLM che legge un prompt di 370 righe, e gli script deterministici scritti per
lui non hanno mai chiamato casa. L'unico esecutore che BOOM abbia mai avuto è
**il tuo pollice su Telegram**. I 28 cron di Vercel sono braccia vere; il resto
è mandato senza esecutore.

**"La macchina lavora da sola e a me restano le decisioni."** La macchina
lavora *senza sorveglianza*, che è un'altra cosa. Ogni battito è scritto alla
fine del lavoro (`api/employees/_lib.js`, chiamata per ultima in
`reminder-cron.js:408`): silenzio e salute sono lo **stesso segnale**. 35
kill, un rendiconto perso, 18 run rossi, un token morto — zero allerte. Venti
agenti su venticinque non chiedono nulla e nessuno li guarda. Quello che
chiami autonomia è assenza di lettura.

**"La macchina ha svoltato" (audit del 2/8: €7.732, di cui €5.002 da 5
pre-accordi).** Per i default che hai messo tu in `deriveMoney`
(`depositSplitPct` 100, `feeDue` 'separate' — `api/preagreement/create.js:86,106`)
la riga Stripe del pre-accordo È **il deposito**: soldi del proprietario in
transito sul tuo conto, su cui paghi tu la carta. La fee — 10% dell'annuo +
IVA, €1.500–1.900 a contratto — è "separata", cioè fatturata a mano o mai:
l'unica `fsCreate('invoices')` server-side è quella ASPI. **Il ricavo per
contratto firmato non è sommato da nessuna parte** in un sistema con 28 cron e
102 suite. Stai leggendo il numero sbagliato come trazione.

**"Il fossato è il canone FIRMATO, il dato che nessun portale ha."** Con ~20
contratti su 11 zone quel dato è una nota a piè di pagina per anni — e oggi
non è nemmeno unito: `properties.zone` **non ha nessuno scrittore** (i form
immobile non hanno il campo), quindi `api/radar/valuta.js:63` salta ogni
contratto e la riga "corretto sui firmati" non è mai stata stampata; i test
passano perché le fixture portano la zona che la produzione non produce. Il
dato che possiedi davvero e nessuno può comprare è **il tuo giudizio
etichettato** — mesi di ✅/❌/✏️ sulle bozze della macchina — e lo distruggi
in scrittura: `applyEdit` (`api/telegram/webhook.js:630`) e `editAgentAction`
(`portal-app.js:5424`) sovrascrivono la bozza originale. E la cassaforte
notturna copia **0 delle 11 collection che contano** (action_queue,
conversations, messageLog, minieraThreads, marketListings, marketStats,
radarState…) mentre copia `viewings`, una collection che non esiste.

**"Il business è vincolato dall'offerta."** Vero, e poi 28 cron e 248 file
servono la domanda di 26 case; l'offerta ha avuto una brochure.
`owner-dashboard.html` è una demo localStorage senza Firebase (1.827 righe,
zero `firebase`, zero `BoomPortal`); `owners.html` promette "in tempo reale",
"alert pagamento in ritardo", "supporto 24/7" e "siamo legalmente responsabili
della solvibilità" — nel meta, nell'og e nel corpo — mentre nessun mandato
generato contiene quella clausola e nessun cron scrive a un proprietario.
Quelle frasi non sono aspirazioni: sono **la spec che non hai mai ticketato e
un'esposizione che un proprietario serio testa per prima**.

**"Lifetime, referral, portare la fiducia al prossimo proprietario."** Hai
costruito il sistema operativo del deal e l'hai scambiato per quello del
cliente. Il funnel finisce alla firma, il journey a end+3; dopo, l'inquilino
è un flusso in `payments` e poi un churn che nessuno vede. `/casa` mostra UN
certificato (grep `signedPdfUrl` in tenant.html = 0); le rules su
`documents` legano l'inquilino a `currentContractId`, quindi verbale e
inventario spariscono il giorno in cui firma il successivo; la ricerca
rovesciata, il Richiamo e il relet **mettono al veto i tuoi stessi alumni**
per telefono o per ruolo. La persona più calda e verificata di Roma è quella a
cui il Commerciale non può scrivere.

**"Ora che ci sono questi modelli…"** Ogni proposta sopravvissuta allo studio
ha avuto il *whyNow* corretto in "indipendente dal modello". Il tuo problema
di settembre è aritmetica, non intelligenza. Quello che il modello cambia è
in §6, ed è meno e più preciso di quello che pensi.

---

## 3 · Le esposizioni che nessun test vede

Nell'ordine in cui costano. Nessuna è un'opinione: ogni riga ha il file.

1. **Sovrapprezzo per strumento di pagamento.** `api/payments/pay.js:136-148`
   e `link.js:104,123-128` aggiungono "Commissione servizio BOOM — pagamento
   con carta" (seed 3,3% + €0,30: la ricevuta del 4/9 nella tua casella dice
   **€48,15 su un canone di €1.450**); `_sdd.js` aggiunge €1,50 per addebito
   SEPA. In Italia il beneficiario **non può applicare spese al pagatore per
   l'uso di uno strumento di pagamento** (art. 3 c. 4 D.Lgs. 11/2010, come
   sostituito nel 2017; per carte consumer e SDD anche PSD2 art. 62.4). Il
   costo dell'incasso sta dentro l'onorario, non sul pagatore. *Da confermare
   col commercialista/legale, ma la norma è quella.*
2. **La custodia del deposito contraddice il contratto firmato.** Dal 1/9 un
   deposito da €900 incassato via `api/sign/deposit-checkout.js` sta nel saldo
   Stripe di BOOM (`stripe-webhook.js handleDeposit`, nessun `transfer_data`,
   nessun payout), mentre il testo firmato — `js/contract-pdf.js:312` e `:752`
   — dice che il conduttore *"versa al locatore (che ne rilascia
   quietanza)"* e promette interessi legali che nessuna riga calcola. È una
   quietanza, in un atto che va all'AdE, per denaro che il locatore non ha
   ricevuto. Prima di automatizzare qualunque restituzione va deciso **dove
   sta il deposito**.
3. **AI Act art. 50 (in vigore dal 2/8/2026).** Un'AI che parla con una
   persona deve dirlo. L'unica superficie che lo dice è la receptionist (0
   chiamate). La Segretaria — l'unica AI che raggiunge un cliente senza tap,
   dal tuo numero personale — ha un SYSTEM che vieta di firmarsi con un nome
   di persona ma **non dice mai di essere una macchina**, e ha scritto a
   clienti veri il 29/8.
4. **"4.9★ · 47 recensioni" cablato su 62 file** (30 varianti di testo) senza
   una fonte nel codice; `REVIEW_URL` può ricadere su una ricerca Google
   (`api/reviews/_lib.js:16`). Una valutazione non verificabile è una pratica
   scorretta (D.Lgs. 26/2023) — e la pagina `/faq` dichiara "500+ tenants",
   "fully insured", "guaranteed rent", "lawyer review".
5. **La voce "personale" del Contatto.** `js/outreach-engine.js:87-93`: la
   voce di default è quella di *chi cerca casa* ("sono seriamente
   interessato/a… referenze solide"), mandata dall'account portale di
   un'agenzia. Un'agenzia che si finge consumatore è pratica scorretta per sé
   (Cod. Cons. art. 23 lett. bb). Oggi il Contatto è a zero chiamate: **è
   un'arma carica, non che spara**. Il default va a 'boom' subito.
6. **Il calendario segreto è leggibile da chiunque.** `js/viewing-availability.js:103-106`
   scrive `busyIcs` — l'URL ICS segreto, che per `_busyics.js` *"È la
   credenziale"* — dentro `settings/viewingAvailability`, e
   `firestore.rules:50` rende `settings/*` leggibile da anonimo tranne
   `company` e `registrazione`. Va in env, oggi.
7. **Il wizard sul Mac si aggiorna da `main` senza firma.**
   `bot/wizard_heartbeat.py:31` scarica `boom_listing_wizard.py` da
   raw.githubusercontent ogni ora, controlla solo `py_compile`, e lo esegue con
   `FIREBASE_ADMIN_EMAIL/PASS` (admin totale). Con CI consultiva e mai letta,
   **un merge sbagliato è codice admin sul Mac entro un'ora**.
8. **Deposit Recovery €99 + 20% "solo su quanto recuperiamo"**
   (`api/_catalog.js:26-31`, pagina: "agiamo in Italia per tuo conto",
   "negoziamo col proprietario"). Recupero crediti per conto terzi a
   percentuale è attività extragiudiziale (licenza art. 115 TULPS), non
   mediazione; `terms.html` non ne parla. Da ri-perimetrare a servizio
   documentale a prezzo fisso, o da togliere.
9. **La Réunion vende gestion locative nei metadati.** Title, og e JSON-LD
   dichiarano attività da carte G/T mentre la pagina tiene i placeholder
   Hoguet. La pagina ha ~15 giorni, non 60; il motivo per decidere è
   l'esposizione, non il campione.
10. **Le promesse fuori da owners.html**: il SYSTEM di `api/ask-listing.js:112-119`
    dichiara "every listing video-verified", "contract in English", "24/7"
    (non montato sulla scheda live — bene, ma è pronto a esserlo); le email
    di outreach in `docs/` ripetono le stesse tre frasi.

---

## 4 · I difetti vivi, verificati riga per riga

Tutti BUILT-AND-LIVE e sbagliati, non "da documentare". Nessuna suite li
vede perché le suite leggono fixture, non produzione.

- **Una collection che non esiste.** `api/leads/_richiamo.js:238` e
  `api/homie/miniera.js:118` leggono `fsList('viewings')`; la collection vera
  è `viewingRequests` (17 file). Effetti: il veto del Richiamo "ha già una
  visita in agenda" **non è mai scattato**; la Miniera ha calcolato il
  funnel — e il verdetto di agosto che ha scelto la Segretaria — **senza lo
  stadio delle visite**.
- **`cedolare === true`** in `js/fiscal-engine.js:49` e
  `js/taxpack-engine.js:94` mentre ogni scrittore salva `'si'|'no'` (la
  lezione era già in `_finalize.js`, applicata lì e basta): il Contabile
  manda ogni mattina obblighi fantasma (registro, ISTAT) sui contratti in
  cedolare, e la chiusura del 1/9 li conteneva.
- **La fame dei lead.** `api/leads/brain.js:113` e `notify-pending.js:163`:
  `fsList('leads', {status=='new', limit:50})` **senza orderBy** → Firestore
  restituisce i 50 id alfabeticamente più bassi. Niente sposta mai un lead da
  `new` dopo una risposta della macchina (`messages.send.js` non tocca lo
  status). Superati i 50 in coda, un lead nuovo viene gradato e pingato **solo
  se il suo id casuale cade nella finestra**.
- **Due voci sullo stesso cliente.** Sul canale email la risposta della
  Segretaria lascia il lead `new` per sempre e il Commerciale (che salta solo
  Réunion/B2B) redige una **seconda prima risposta**. Fix: una riga —
  `status:'contacted'` a ogni invio della macchina.
- **La firma finalizza dentro la richiesta HTTP.** `magic-sign/submit.js:632`
  chiama `finalizeContract` (certificato, PDF firmato, marca TSA, fascicolo,
  pack ZIP con budget 25s, 3 email con allegati fino a 18MB, ASPI) sotto
  `maxDuration 60` — ed è nella lista dei kill. `finalizedAt` viene scritto
  PRIMA delle email: un kill dopo il marker = welcome e fascicolo CAF persi in
  silenzio, e `notifyAdminContractSigned` ti dice comunque che sono partite.
- **`reminder-cron` senza `runBudget`** (0 occorrenze): sette sotto-lavori,
  compresi `collectSdd` e il journey (soldi), nell'unico cron che incassa; i
  kill a 60s sono i suoi.
- **`deadlines` è write-only**: 9-12 doc per contratto firmato, il commento in
  `portal-app.js:11599` dice che reminder-cron le legge — grep = 0.
  `complianceState`: 4 lettori, **0 scrittori** → il Gestore stampa "SCADUTA"
  per sempre.
- **`matchZone` a parola singola** (`js/canone-engine.js:218-224`): "Via
  Levico 12, 00198 Roma" può agganciare una zona tramite la parola ROMA;
  `fascicolo.js` **persiste** `zonaCod` sul contratto a ogni firma completa
  dal 24/8 e lo stampa sulla scheda che va ad ASPI. Da auditare i codici già
  scritti.
- **Il campione della fiducia è una fetta alfabetica**
  (`_fiducia.js:121,189`: `limit 400` senza ordine), e una bozza *modificata*
  e approvata conta come successo della macchina.
- **Cinque scanner IMAP sulla stessa casella** (leads */10, pfs */15,
  segretaria */10, documents, banking) con socket timeout in produzione;
  `pfs/scan-inbox` itera dal più VECCHIO con budget a passi → gli alert nuovi
  possono restare affamati.
- **Il Postino sul Mac** (`bot/boom_postino.py`, 30/8) non è nell'installer né
  nel README: l'incidente del 29/8 (Segretaria scrive, executor marca
  `executed`, su WhatsApp non arriva niente) resta possibile.

---

## 5 · La forma del sistema operativo

Un OS ha quattro parti. Questo è cosa sono per BOOM, e cosa manca.

**Il kernel** è ciò che non può divergere: un'identità che non scade (oggi
una password umana in 8 file e sul Mac, più un token che Google revoca ogni
~11 giorni); le regole IN VIGORE (non quelle nel file); un battito che parla
quando manca; e un **contratto eseguibile di ≤200 righe**. CLAUDE.md non è un
kernel: 263 KB di incidenti che nessuna sessione tiene in testa. Le uniche
lezioni che hanno retto sono le **cinque diventate test che camminano
`api/`** (`tests/tempo`: 22/22 chiamate Anthropic con tetto; `tests/imap`;
`tests/radici`). Il cedolare `=== true` in due motori mentre ogni contratto
scrive `'si'` è la prova che la prosa non protegge niente.

**Le braccia.** Le 28 funzioni Vercel sono braccia vere. Il Mac è una
promessa. L'unico mestiere che il Mac fa davvero — WhatsApp — passa da wacli
sul tuo numero **personale** (un ban Meta si porta via ogni chat con gli
inquilini e l'archivio della Miniera) ed è mosso da un LLM. Il pezzo giusto
di M22 (bocciata per la metà VPS, che è un IP datacenter come quelli che i
portali 403-ano) resta orfano: **WhatsApp Business Cloud API in uscita,
stesso numero (coesistenza Meta con la Business App che già usi — da
verificare con un BSP), e il webhook in entrata su `/api/homie/message`**.
Due-tre giorni, e la consegna smette di essere un atto di fede.

**La governance** esiste sulla carta (registro con lettere di autonomia,
scala della fiducia, kill switch) e non nei numeri: cinque doc `settings/*`
su tre interfacce, i kill switch coprono 2 dei 6 agenti che scrivono ai
clienti da soli, la scala pretende ≥30 decisioni per categoria contro **6
prime risposte AI in 90 giorni** (dalla tua casella) — irraggiungibile per
mesi, come STUDIO_ORGANICO non aveva calcolato. La delega giusta non è "più
autonomia": è **un interruttore solo, un campione vero, e un cancello di
CLASSE** per i testi template (follow-up, sollecito, promemoria firma): il
testo l'hai già approvato una volta; ri-approvare ogni istanza è rileggere
la stessa frase.

**Il posto dell'umano** non è il tap. È **la lettura del mattino** — la cosa
che in un anno non ha mai avuto un turno — e le due decisioni che il codice
non prende: *la fee si incassa alla firma* e *cosa si cancella*.

---

## 6 · Cosa cambia con la nuova generazione di modelli — e cosa no

Tre cose, non venticinque.

1. **Il lettore del mattino (il Guardiano).** Una Routine — una sessione
   Claude accesa da cron, con gli accessi che questa sessione ha già: Vercel
   (errori e log), GitHub (run e PR), Gmail — alle 05:00 UTC legge gli
   errori delle ultime 24h, lo stato della CI, la sonda `tests/regole`,
   correla ("reminder-cron ucciso 4 volte, tutte dopo le 05:00: coincide col
   journey"), e consegna **una issue GitHub** con cosa si è rotto, cosa
   sarebbe la riparazione e il comando esatto. Muta se è tutto verde. Limite
   vero, misurato qui: da questo ambiente boomrome.com e Telegram **non si
   raggiungono** — quindi il Guardiano consegna via GitHub, e una **Sentinella
   deterministica** in `notify-pending` (zero AI) rileva la notte mancata e
   relaya su Telegram. È l'SRE che non hai mai assunto, e vale più del
   prossimo dipendente. *Posso accenderlo da questa sessione con una tua
   parola.*
2. **La sessione lunga che tiene il contratto.** Una sessione può oggi tenere
   insieme il contratto di piattaforma, il diff e la produzione — **solo se
   il contratto è abbastanza corto da starci**. Puntata su brief paralleli
   ("costruisci X") la stessa capacità moltiplica la divergenza (l'audit del
   18/08 aveva contato 17 copie dell'auth; oggi sono 8 `signInWithPassword` +
   7 `accounts:lookup`, 23 rate-limit in memoria, 5 confronti di segreti non
   timing-safe con `secretEqual` a fianco). Puntata su UNA invariante da far
   camminare su tutto `api/` — "ogni path Storage ha la sua rule", "ogni cron
   ha battito e maxDuration", "ogni marker segue l'effetto" — converge.
3. **La Moviola.** La tua storia (bozze → ✅/❌/✏️ → esito) è l'unico banco di
   prova onesto di QUALSIASI modello — Fable, Astra, il prossimo — e oggi non
   si può usare: l'originale viene distrutto alla modifica, i fatti da cui la
   bozza è nata non sono sul doc, il modello usato nemmeno
   (`ANTHROPIC_MODEL` è un interruttore mai documentato: ogni prima risposta
   paga opus-4-8 senza una prova che approvi meglio di haiku). Sei righe
   (`draftOriginal` alla prima modifica, `facts` e `model` sul doc) fermano
   l'emorragia; il replay viene dopo, quando i decisi saranno decine.

**Cosa NON cambia.** La legge (§3). Le 26 case, 4 libere. Il calendario: la
finestra delle università è passata mentre `docs/outreach-settembre-2026.md`
restava nella cartella (zero email a LUISS/AUR/JCU in 120 giorni, dalla tua
casella). E un numero non esiste finché non lo si conta: fee per contratto,
rendiconti consegnati, ore di campo, lead per fonte — **stimati in quattro
studi, contati in nessuno**.

**Cosa NON usare anche se ora si può**: un agente computer-use sui portali
(ToS + gli stessi 403), un'AI pubblica sul sito prima del livello dei fatti
(`ask-listing` inventa policy), un owner portal, `/api/meteo` su un
assorbimento che è null ovunque, l'auto-invio di qualunque categoria senza
il campione ordinato.

---

## 7 · Il progetto: LA LETTURA, poi IL FASCICOLO

**Mese 1 — La Lettura.** BOOM smette di costruire e impara a leggersi. Tre
strumenti, tutti a superficie zero:
- **Il Guardiano** (§6.1) + **la Sentinella**: battito a due fasi
  (`startedAt` all'ingresso, `finishedAt` all'uscita, via `runBudget`
  esteso) su ogni cron, UNA politica d'allerta (fondere
  `employees/_lib.js` in `pfs/_health.js alertDecision`, soglia = 3×
  cadenza, i mensili al primo miss), `maxDuration` sui 10 cron nudi. Un kill
  a 60s diventa una riga Telegram entro una cadenza, non silenzio.
- **Il Libro del lunedì** dentro la chiusura del Contabile: per contratto
  firmato — fee prenotata (`agencyFee`, che solo `convert.js` scrive),
  fee incassata, deposito in transito, canone atteso/incassato/ritardo, costo
  Stripe misurato (il webhook lo scrive già in `stripeCostEur`, nessuno lo
  legge), checkout abbandonate; e le ORE da timestamp che esistono già
  (`action_queue` created→approved, `viewingRequests`, i viaggi del Regista
  che oggi calcola e butta). Con `n` accanto a ogni numero. È il trigger
  dell'assunzione di campo reso reale, ed è ciò che `statsFor` della fiducia
  deve leggere al posto di una fetta alfabetica.
- **La Moviola, igiene** (§6.3): sei righe. Il replay quando c'è materia.

**Mese 2 — Il Fascicolo dell'inquilino** (il sistema operativo del cliente).
BOOM detiene per ogni inquilino l'oggetto di fiducia più forte del mercato
expat di Roma — identità acquisita alla firma, contratto FES + certificato +
marca temporale, rate con `paidVia` di terzi (stripe/sepa/banca), inventario
video, verbale, esito del deposito — e non gliene restituisce niente. Tier 0
(≈1 giorno, zero rules, zero endpoint nuovi): `/casa` elenca TUTTI i
contratti con PDF firmato, certificato, verbale, inventario, ricevute — sono
già sul doc, leggibili per `tenantId`; atterraggio per ruolo da `/login` E
da `_finalize.js`; il "💳 Paga" del portal che punta a una Cloud Function
inesistente rimosso. Tier 1 (dopo la decisione sul deposito, §3.2): un PDF
**di soli fatti** — mai un voto, mai "verificato" (Garante v. Mevaluate; AI
Act All. III): rate pagate, di cui alla scadenza / entro 5 giorni / oltre,
con la via; deposito come importi; inventario come liste — sotto
`contracts/<id>/` (match esistente), con link di condivisione a scadenza
coniato **dal tenant** (pattern `share.html`, il tenant è chi chiede e chi
condivide: l'obiezione GDPR di nuovi-servizi §2.5 cade). La pagina di
verifica porta la P.IVA Egidi e la provenienza FES: **il prossimo proprietario
incontra BOOM come referenza** — è il gancio del mandato che nessuna brochure
dà. Il referral diventa un credito su una fattura futura (mai contante a
non abilitati, L. 39/1989), con tetto e scadenza scritti prima del primo.

Questo è ciò che il ciclo non ha: non un altro agente, ma **la persona che
sopravvive al contratto**.

---

## 8 · Le decisioni (in ordine di resa, dopo tre confutazioni ciascuna)

### ADESSO (settimane 1–4)

| # | Decisione | Cosa muove |
|---|---|---|
| **1** | **Il kernel riparato.** Service account Firebase (datastore.user + storage.objectAdmin + firebaserules.admin) in GitHub e Vercel; `api/_platform/identity.js` (RS256 con `node:crypto`, import statico — la lezione nodemailer); `getAdminToken()` re-export → le 8 copie collassano senza toccare i chiamanti; poi `FIREBASE_ADMIN_PASS` via dal Mac. `ci.yml:157` lo nomina già. Il token di `login:ci` **scade per costruzione**: ogni fix che lo rigenera è un fix a 11 giorni | deploy che non può più morire in silenzio; SPOF credenziali 3 → 1; auth 8 → 1 |
| **2** | **Il rendiconto di agosto.** `storage.rules`: `match /rendiconti/{ownerId}/{all=**}`, `/site/**`, `/deals/**` (PR #225 porta il primo — verificare che sposti anche il marker); in `rendiconto.js` try/catch per proprietario, upload best-effort (la mail porta già il PDF), marker DOPO l'email (`cassaforte.js:175` lo fa già), cancellare i marker avvelenati `*_2026-08`, `?dry=1` poi `?month=2026-08` con la riga "in ritardo, e perché". L'obbligo di rendiconto è dell'art. 1713 c.c., non un nice-to-have | rendiconti 0/N → N/N |
| **3** | **Il battito a due fasi + una politica** (§7 Sentinella); `runBudget` in `reminder-cron` e in `magic-sign/submit` (finalize fuori dalla richiesta: marker `finalizedAt` DOPO le email, ogni passo idempotente) | 35 kill/7gg → 0 non riportati |
| **4** | **Il Congelamento: 30 giorni, quattro verbi** — cancella, attiva, osserva, RIPARA — come prima regola di CLAUDE.md, con clausola `override freeze: <motivo>`. Uscita: 14 mattine verdi del Guardiano, zero kill a 60s in 14 giorni, CI verde, rules ≥ repo. Lista dei morti: chiudere #221 (228 file, +32k righe, 34 commit indietro, preview su Firebase di produzione) estraendone UNA issue gated su "assorbimento non null in ≥5 zone", chiudere #79/#77/#1; pausare i 48 progetti Vercel; cancellare "Sofia" e "Sales agent"; togliere `pfs/scan-market` dal cron (48 run/giorno che possono solo dire `blocked`); `gtfs-tempi` da */15 a settimanale (96 × 300s × 1769MB al giorno per una freschezza a 6 giorni); fermare il loop non versionato del Mac su `state.snapshot`/`risk.scan` (8k letture/giorno) e togliere gli endpoint; tombstone `cockpit-preview.html` e `public/deals_v2_commandcenter.html`; `form-landlord/form-tenant` (scrivono da anonimo in una collection admin-only: morti per rules) e i DUE punti del portal che li distribuiscono ancora → `/scheda`; **Scout e Contatto in cancellazione secca** (nessun executor, e la voce 'personale'), Publisher: installato o cancellato al giorno 14 | superficie ÷2; nessun "fatto" che non sia acceso e osservato |
| **5** | **Una copia sola, o niente** — il contratto eseguibile: sei suite-grep nello stile `tests/tempo` (path Storage ⇒ rule; cron ⇒ battito+maxDuration; `*_SECRET` ⇒ `secretEqual`; marker DOPO l'effetto, asserito sull'ORDINE nel sorgente; ogni scrittura Storage via `storageUpload`; ogni collection scritta ⇒ in cassaforte o in EXCLUDED con motivo); il predicato cedolare su `'si'|'no'` in entrambi i motori; cassaforte senza `viewings` e con le 11 collection-fossato (solo nella copia Storage, mai nello ZIP email da 18MB; paginare prima che `messages` superi 5000); `radarState/index` (un doc, last-writer-wins tra lambda concorrenti) → `radarIndex/<listingId>`. CLAUDE.md: ≤200 righe di contratto in testa, il diario in `docs/diario/` | duplicati 8+7+23+5 → 1; classi con guardia eseguibile 3 → 9 |
| **6** | **Gli interruttori che già esistono — versione legale.** `fetch('/api/search/save')` nel TEMPLATE (`design/pages-deco/ad-regia.html`) + rebuild; `payout/default` IBAN in `/banca` (senza, `/casa` nasconde il bonifico gratuito) e **commissione carta a zero per carte UE, fee SDD tolta** (§3.1) — poi, e solo poi, SEPA proposto nel welcome/T-30 col gate `late`; `TELEGRAM_WEBHOOK_SECRET` (oggi `_lib.js:72` ritorna `true` se manca: chiunque col chat id forgia `approve:`); `js/boom-track.js` sulle 5 pagine attuali + `boom_source` letto in `apply-lead/executive-lead/slots`; Vercel Web Analytics ON; `ACCOUNTING_EMAIL` solo dopo un mese riconciliato; **`busyIcs` in env**. FUORI: `requireApproval` (0,5 tap/settimana misurati, e il filtro su chi entra in una casa vera è una scelta), `settings/registrazione.auto` (invia dati a terzi e fattura €89/€189 senza che nessuno guardi) | canale lead vero; incassi visibili (agosto: €1.200 su €5.900 "attesi" secondo la chiusura del 1/9 — più probabilmente bonifici non riconciliati che 80% di arretrati: importare il CSV di agosto in `/banca` costa 5 minuti e lo dice) |
| **7** | **Togliere le promesse che il codice non mantiene.** 308 di `/owner`, `/owner.html`, `/owner-dashboard`, `/proprietari` → `/owners`; `owners.html` riscritto "in breve" con i SOLI binari consegnati (Magic Sign + FES + marca, verbale, inventario, ASPI, fascicolo fiscale — e "rendiconto il 1°" solo dopo che ne sono partiti tre); via "garanzia di solvibilità", "24/7", "tempo reale", "4.9★/47" (o la fonte), le quattro frasi di `/faq`; `MARKET_SQM_BENCHMARK` (stima 2024-25 spacciata per insight) via; CTA recensione solo con `reviewUrl` valido e MAI prima del saldo deposito; **linter delle promesse** in `tests/seo`: ogni claim del lessico (verified, guaranteed, 24/7, insured, real-time, in English) su una pagina della sitemap deve puntare a un file di binario, o cade | claim senza binario: 7 → 0; esposizione Cod. Cons. artt. 20-23 chiusa |
| **8** | **M08-zero (i tre orfani della bocciatura).** `status:'contacted'` a ogni invio della macchina (una riga in `messages.send.js` e in `handoverSegretaria`); `orderBy createdAt DESC` in `brain.js` e `notify-pending.js` (la fame dei lead); `commerciale.maxFirstPerRun=0` dalla manopola esistente finché la Segretaria è l'unica prima voce — poi il Commerciale-first si ritira | doppia voce 0; nessun lead perso per id |
| **9** | **Il Registro delle Visite.** `'viewings'`→`viewingRequests` in `_richiamo.js:238` e `miniera.js:118` con `startOf()` per le pending (`v.when` non esiste sui doc self-booked), invariante nome-collection nei test; poi `op:'outcome'` in `manage.js` (token derivato: nessuna migrazione) così i tre bottoni T+2h scrivono l'esito PRIMA del wa.me, e la card "esito visita" del Regista lo scrive lato operatore | il veto del Richiamo scatta; il funnel ha un centro |
| **10** | **Il cartellino.** `api/_disclosure.js`: UNA riga per lingua (≤60 caratteri: "Risposta automatica di BOOM — Valentino legge tutto."), **prepesa server-side dopo `sanitizeReply`** sul primo turno per conversazione (`disclosedAt` sulla conv), mai come istruzione al modello (un rifiuto è un'escalation e brucia il turno); `privacy.html` coi processor VERI (Anthropic, OpenAI, Twilio, ElevenLabs, Firebase, Vercel, Gmail, Stripe — non AWS/SendGrid) e "registrazioni 90 giorni" con la pulizia in reminder-cron; la voce 'personale' ritirata (§3.5) | AI verso clienti senza disclosure: 100% → 0% |
| **11** | **La Réunion: oggi i metadati, poi una data.** Title/og/JSON-LD senza attività regolamentate ("visite vidéo et compte rendu sur place"), guardia `isReunion` anche in `segretaria/_core`, `_richiamo`, `_reverse` (un 🤖 su una card 🇷🇪 oggi risponde in inglese di Roma); Path A (partner con carte) cancellato come opzione — per un operatore a Roma è una finzione; decisione entro il ciclo stage CCI/EGC; **registro dei mercati (`api/_markets.js`) SOLO come ADR con trigger "primo contratto firmato fuori Roma"**, mai un refactor prima | esposizione Hoguet chiusa; zero giorni su geografie senza spina legale |

### DOPO (settimane 5–8)

| # | Decisione | Cosa muove |
|---|---|---|
| **12** | **Il deposito non è ricavo.** Default `feeDue:'signing'` (server + PRIMA opzione della console, altrimenti il DOM vince), `depositSplitPct` 0 con card deposito solo su scelta esplicita; `invoices/pafee_<contractId>` scritto da `convert.js` (idempotente, pattern `_aspi.js:371`) pagato/pendente; righe Stripe separate fee/deposito con metadata e `balance_transaction.fee` catturato; KPI console "incassato" → **"depositi in custodia"** + "onorari"; il recap PA di recover-checkouts diventa "fee non incassata" in OGGI. E **la decisione legale sulla custodia** (§3.2), scritta nella clausola | ricavo per deal registrato: €0 → €1.500–1.900 alla firma; conversione da monitorare sui primi 5 (5/8 misurata su checkout solo-deposito) |
| **13** | **Il Libro del lunedì** (§7) — dentro la chiusura del Contabile, mai una console; `agencyFee` come campo del modale contratto (oggi solo i contratti da PA lo portano) | i quattro numeri mai contati |
| **14** | **Un campo, il fossato.** Prima il LINK: `listings.propertyId` (26 righe confermate su Telegram) — risuscita `fascicolo.js:338`, la sync `availableFrom` di magic-sign e dà zona a valuta/valutazione via `listings.zone` (già 26/26); poi `zone` come SELECT sui 38 canonici nel modale immobile e nell'Innesto, prefill `inferZone`, ambiguo = vuoto; alias 'africano'→Trieste, 'vittorio veneto'→Ludovisi; fix del fallback a parola singola in `canone-engine.js` e **audit dei `zonaCod` persistiti dal 24/8**; il rapporto chiesto→firmato resta INTERNO con n≥5 (pubblicarlo prezza il tuo sconto in ogni trattativa) | la giunzione esiste (non "il Valutatore funziona": in quasi tutte le zone resta "campione insufficiente", ed è corretto) |
| **15** | **Il proprietario non è un inquilino.** `isOwnerLead()` su `leadType==='landlord'` (mai su intent: `brain.js:182` lo sovrascrive), guardia in `commerciale.js` PRIMA della spesa (ordine asserito), card 🏢 con zona e canone dal calcolatore, stage0 fisso "owner — canone", 🤖 nascosto per owner/B2B/Réunion; `/canone` in nav di index e apartments (oggi 0 link) | owner rispost i con la voce tenant: 100% → 0% |
| **16** | **Governance ridotta**: `orderBy createdAt DESC` nella fiducia; bucket 'edited' in `statsFor`; `classGate` SOLO su `commerciale:followup` via email con lead ancora `new` e nessun `out` manuale (payrem MAI automatico: la macchina non sa verificare "non pagato" — la banca è uno scanner email giornaliero); un `/kill` sull'inline-toggle esistente; `sendEmail` in `agent/_lib.js` con `purpose:'agent'|'transactional'` che consulta l'interruttore | outbound fermabile in un tap: 2/6 → 6/6 |
| **17** | **WhatsApp come pipe** (il cuore di M22): verifica coesistenza Meta sul numero Business che già usi; webhook `api/whatsapp/inbound.js` (`X-Hub-Signature-256`, pattern `elevenlabs.js`) → lo stesso `/api/homie/message`; invio Graph dentro `postinoTick` per le risposte in finestra, PRIMA della card 📮. Niente VPS | consegna = fatto, non fede; il numero personale fuori dal rischio ban |
| **18** | **Un segmento solo.** Paragrafo in CLAUDE.md: "arrivi internazionali a Roma per 1–18 mesi, via chi li raccomanda"; Executive È già dentro la macchina (`executive-lead.js`: tenant/roma/sector) — congelare STUDIO_EXECUTIVE §5 settimane 4–12 finché `raw.sector` non mostra UN contratto; le email AUR/LUISS/JCU partono come apertura **primavera 2027** (la lista di settembre è chiusa: la finestra decisionale era maggio–agosto, `university-outreach.md:9`), senza le tre frasi che il codice non regge, con la capacità dichiarata (4 unità); `partnerRef` letto alla porta; `convert.js` porta `linkedLeadId`. E la domanda prima dell'invio: *perché il foglio del 20/8 non è partito* | contratti attribuibili a un raccomandatore: 0 → contabili |

### PIÙ TARDI (settimane 9–12) — a cancello

- **Il Fascicolo dell'inquilino** (§7 mese 2), Tier 0 subito, Tier 1 dopo la
  decisione sul deposito.
- **La voce**: stanotte conta le chiamate perse dai Recenti dell'iPhone (zero
  infra) — è il numero che via A avrebbe misurato in 14 giorni; se ≥5/settimana
  da sconosciuti → numero italiano, tool ElevenLabs su `www.`, greeting corto,
  retention 90gg; altrimenti **cancellare** l'agente e rilasciare il +1 707.
- **La porta sul sito** (`/api/ask-listing`) SOLO dopo il livello dei fatti
  rifatto (lane da `dispo-engine`, deposito/fee dal listing, niente "24/7",
  disclosure) e SOLO con ≥15 visite umane/giorno su `/listing` misurate.
- **Il Moviola-replay**, quando i decisi sono decine.

### MAI (bocciate, e perché)

- **BOOM Gestione €69/unità "dal rendiconto"**: un canone ricorrente su un
  veicolo che ha fallito la sua unica corsa. Si rivaluta il 1° dicembre sui
  tre rendiconti consegnati.
- **Segretaria default-on per classe dopo un A/B "in ombra"**: la misura non
  è eseguibile da uno+macchina e il canale è il tuo WhatsApp personale.
- **Il motore del mandato coi tre numeri**: due dei tre non sono producibili
  onestamente e la lista candidati è vuota per costruzione (scan-inbox salva
  `unknown`, le morti non hanno executor).
- **Spegnere le pagine servizio**: bocciata sulla propria evidenza (0/20 e
  0/8 erano i VECCHI Payment Link; le pagine nuove hanno 4 giorni e zero
  analytics). Ma i tre orfani della bocciatura restano: Deposit Recovery
  (§3.8), la caparra €300 con 0 paganti in 22 mesi raccontata a llms.txt come
  "il processo", e il Commerciale che scrive "vuoi vedere casa?" a chi ha
  comprato un servizio o a chi ha già lasciato l'Italia con una lettera di
  messa in mora (`demand-letter.js:139` scrive un lead `new`).
- **Ri-affittare l'alumno col deposito ridotto "BOOM copre il gap"**: metà
  diagnosi giusta (l'esito del T-90 non viene registrato — va scritto su
  `contracts.renewalIntent` con token derivato), metà è una garanzia
  finanziaria senza riserva, già bocciata in nuovi-servizi §2.8.
- **L'Indice della Domanda pubblicato**: i budget dei lead sono ±15% dei
  prezzi delle TUE case, non domanda; prima l'instrumentazione
  (`statusChangedAt`, segnali espliciti con provenienza), poi si vede.
- **Un VPS a IP fisso per Scout/Perito**: è un IP datacenter (`_fetch.js:7`,
  1.145 run bloccati lo provano).

---

## 9 · I 90 giorni

1. **Settimana 1 (7–13 set) — il kernel riparato.** Tu, 45 minuti: service
   account + secret in GitHub e Vercel. Macchina: #1, #2, il congelamento in
   testa a CLAUDE.md (#4), la lista dei morti "macchina-stanotte" (PR, agenti
   ElevenLabs zombie, file morti, cron scan-market, gtfs settimanale,
   save-search nel template + rebuild, `TELEGRAM_WEBHOOK_SECRET`), #10
   disclosure + privacy, #7 promesse via, #11 metadati Réunion, `busyIcs` in
   env, il conteggio delle chiamate perse (2 minuti sul telefono). E
   `tests/dispo` con la data iniettata: rossa dal 1° settembre per
   calendario, cade anche qui.
2. **Settimana 2 (14–20 set) — il contratto e il battito.** #5 (le sei suite
   PRIMA del documento), #9 rename + invariante, #3 battito a due fasi + una
   politica + `runBudget` dove incassa e dove firma, `maxDuration` sui 10 cron
   nudi, `tests/regole` in un job non bloccante dei PR e poi **branch
   protection su main** (nell'ordine giusto o il cancello muore il primo
   giorno).
3. **Settimana 3 (21–27 set) — i soldi veri.** #12 (default fee alla firma,
   ledger `pafee_*`, KPI rinominati, righe Stripe separate), #6 ridotto
   (IBAN, commissioni a zero, boom-track, Web Analytics, CSV di agosto in
   `/banca`), #8 M08-zero.
4. **Settimana 4 (28 set – 4 ott) — la lettura.** Il Guardiano (Routine 05:00
   UTC, read-only, issue GitHub) + la Sentinella che relaya; #13 il Libro
   dentro la chiusura del Contabile; giorno 14 del congelamento: Scout e
   Contatto cancellati dal registro, Publisher installato o cancellato. **1°
   ottobre: rendiconto osservato, N/N.**
5. **Settimane 5–6 (5–18 ott) — le porte giuste.** #15 owner lead, #14 link
   listing↔property + zona + audit `zonaCod`, #16 governance ridotta, #17
   WhatsApp pipe (dopo la verifica coesistenza), #11 decisione Réunion, esito
   visite lato operatore.
6. **Settimane 7–8 (19 ott – 1 nov) — uscita dal congelamento o
   auto-estensione.** Criterio in §8.4. Seconda chiusura col libro della fee.
   #18 il paragrafo di segmento e le email primavera 2027.
7. **Settimane 9–10 (2–15 nov) — la persona, non il contratto.** Fascicolo
   Tier 0; decisione sul deposito e clausola corretta; se decisa, Tier 1.
   Terzo rendiconto consegnato: solo ora `owners.html` può scrivere
   "rendiconto il 1°".
8. **Settimane 11–12 (16–29 nov) — le decisioni a cancello.** La voce (o la
   cancellazione), la porta sul sito (o no), `classGate` esteso solo con
   precondizioni bancarie verificabili; BOOM Gestione rivalutata il 1/12 sui
   tre rendiconti.
9. **Giorno 90 (~5 dic) — lo studio scritto sui conteggi.** Il prossimo
   STUDIO_* parte da `teamReports/chiusura-<mese>` e dal Guardiano, non da
   stime: fee per contratto (n), rendiconti N/N per tre mesi, kill/settimana,
   decisioni per specie e latenza, lead per fonte e per raccomandatore, zone
   con n≥5 firmati. **Ciò che non ha un numero contato non entra nella
   prossima roadmap.**

---

## 10 · Le righe rosse

- **Mai** una sessione che apre un branch feature mentre una riga del mattino
  è rossa (per 30 giorni: solo cancella, attiva, osserva, ripara).
- **Mai** un'AI che parla a un cliente senza il cartellino; mai la voce di un
  consumatore da un account d'agenzia.
- **Mai** un sovrapprezzo per strumento di pagamento; il costo dell'incasso
  vive nell'onorario.
- **Mai** una promessa pubblica senza un file di binario dietro (il linter
  decide, non il gusto).
- **Mai** un voto sulla persona: il fascicolo dell'inquilino stampa fatti.
- **Mai** una collection nuova senza rule, battito, cassaforte-o-esclusa,
  riga di contratto (P16, finalmente eseguibile).
- **Mai** un'autonomia promossa su un campione non ordinato o senza rifiuti
  dentro (100% su 30 tap può voler dire che hai smesso di leggere).
- **Mai** un secondo mercato prima di un contratto firmato fuori Roma; mai
  una seconda città prima di 100 unità gestite.
- **Mai** un deploy a mano delle regole dopo il service account: last-writer-wins
  è come si torna a "il repo è avanti, la produzione no".

---

## 11 · Cosa posso fare da questa sessione, con una tua parola

- **Accendere il Guardiano** (Routine 05:00 UTC, read-only: Vercel errori +
  GitHub run + `tests/regole` → una issue). Ho già gli accessi.
- **La lista dei morti "macchina-stanotte"** in un PR: file, cron
  scan-market, gtfs settimanale, save-search nel template + rebuild,
  `tests/dispo` con clock iniettato, `busyIcs` in env, disclosure +
  privacy.html, 308 delle rotte owner, `orderBy` nella fiducia e nel Brain,
  `status:'contacted'`, rename `viewings`, cedolare `'si'`, rendiconto marker
  + storage rule + try/catch. Zero decisioni tue dentro.
- **Chiudere #221/#79/#77/#1** e cancellare i due agenti ElevenLabs zombie.
- Le tre cose che restano a te: il service account (15 minuti su un tuo
  dispositivo), il conteggio delle chiamate perse, e le due decisioni — la
  fee alla firma e dove sta il deposito.

*Il progresso, finora, è stato misurato in merge. Da qui in poi si misura in
mattine verdi, rendiconti consegnati e onorari registrati — tre numeri che
oggi valgono, rispettivamente, zero su dodici, zero su N e zero.*
