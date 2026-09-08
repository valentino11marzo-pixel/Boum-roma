# STUDIO — IL CARICO · settembre 2026
### Attivare prima di costruire. Formato: decisioni, non opzioni.

*8 settembre 2026, sera. La domanda dell'operatore: «lavoro dalle 9 alle 18,
minimo 15 contratti, devo registrare tantissimi affari nuovi, appartamenti
che entrano, appuntamenti, visite. Serve un piano di ristrutturazione di
qualità, partendo dalle cose più importanti. Una segretaria senza assumere.
Eliminarmi le chiamate: devo fare questo numero, stasera. E il progetto
dell'integrazione con GPT: ho droppato Astra, c'è un doppio confronto, una
infrastruttura più semplice, un'identità globale.»*

---

## 0 · La risposta in tre righe

1. **Il piano c'è già ed è di agosto** (`STUDIO_ORGANICO_2026-08.md`): la
   segreteria è software, l'unica assunzione sensata è un operativo di
   CAMPO a task. Da allora è stato costruito molto e **attivato quasi
   niente**: la Receptionist aveva un test fallito che nessuno ha letto, il
   numero puntava all'agente vecchio, gli interruttori di autonomia sono
   ancora sui default. Il carico non cala perché **le leve esistono e sono
   spente**, non perché manca un progetto.
2. **Stasera** il telefono si accende in 15 minuti tuoi (§3). Ho già
   sistemato tutto ciò che si poteva sistemare da qui (§1).
3. **Il progetto GPT non parte** finché non è scritto in un paragrafo e finché
   le tre leve di §4 non sono accese da due settimane. Un'infrastruttura
   nuova adesso è lo stesso difetto (costruire > attivare) con un nome nuovo.

---

## 1 · Cosa ho trovato stasera (fatti, non impressioni)

**Nel workspace ElevenLabs** (letto via API, non dal repo):
- L'agente «BOOM Receptionist» esiste dal 22 agosto (21:56), con il prompt
  del mandato, i due tool e la data collection. **Un solo test**, la notte
  stessa, in chat testuale: il cliente chiede «a Bilocale in Trieste»,
  l'agente chiama `get_catalog`, **il tool restituisce la stringa
  `Redirecting...`** e l'agente, onesto, risponde *«I don't have the
  catalog in front of me»*. Causa: URL sull'apex `boomrome.com` (che
  reindirizza su `www`) e *Follow redirects* spento. **Zero chiamate da
  allora.**
- **Il numero del workspace (`+1 707 846 6974`, Twilio) era ancora assegnato
  a «Sofia»**, l'agente di febbraio senza tool e senza webhook. Ultima
  chiamata di Sofia: 19 febbraio.
- Il modello TTS era solo-inglese e non c'era la lingua italiana fra le
  lingue aggiuntive: un italiano avrebbe sentito voce e pronuncia inglesi.

**In produzione (Vercel, ultimi 7 giorni)**: il traffico è quello della
macchina viva — ~640 messaggi WhatsApp entrati da Homie (`/api/homie/message`),
~430 ritiri del postino, la Segretaria email e il Brain ogni 10′. **I percorsi
`/api/phone/*` non compaiono fra quelli con traffico**: il Centralino non ha
mai lavorato. Il sandbox non raggiunge `boomrome.com` (rete chiusa), quindi
due cose restano **non verificate**: il webhook workspace ElevenLabs e il
secret `ELEVENLABS_WEBHOOK_SECRET` su Vercel.

**Cosa ho cambiato, da qui** (tutto reversibile, tutto nel workspace tuo):
- i due tool puntano a `https://www.boomrome.com/api/phone/agent-tools`
  con *Follow redirects* acceso (`www.boomrome.com`, `boomrome.com` ammessi);
- lingua **italiana** aggiunta come preset (con la first message italiana);
  il modello TTS resta flash v2 per obbligo di piattaforma («English Agents
  must use turbo or flash v2»): la voce italiana nasce dal preset;
- formati audio **μ-law 8 kHz** in ingresso e uscita (numero Twilio);
- audio post-chiamata richiesto nel webhook (per il player di `/chiamate`).
- Nel repo: `api/phone/inbound.js ?setup=1` ora emette SEMPRE gli URL sul
  host canonico `www` anche se chiesto dall'apex; `bot/RECEPTIONIST.md`
  riscritto con lo stato vero e la trappola; `tests/phone/run.mjs` pinna
  entrambe le cose (un URL sull'apex nel mandato fa fallire il test).

**Cosa NON ho potuto fare**: assegnare il numero all'agente (l'azione è
stata bloccata dal classificatore dei permessi di questa sessione). È un
click tuo: *Phone Numbers → +1 707 → Assigned agent → BOOM Receptionist*.

---

## 2 · Lo stress-test della tua lettura

**«Mi serve un piano di ristrutturazione.»** No: ti serve eseguire quello di
agosto. Dal 22/08 all'8/09 sono entrati ~15 PR su main (Scalo, Scrivano,
CI, login, hotfix). Nello stesso periodo la Receptionist è rimasta rotta su
un redirect e il numero sull'agente sbagliato. Il registro conta **26
agenti, 21 dei quali agiscono da soli** (`approval: 'mai'`), 28 cron, 107
suite di test — e le quattro leve che toglierebbero lavoro A TE aspettano
un tuo click ciascuna: il numero, `/fiducia`, il 🤖 sulle card, il conto
delle ore di campo. **Il collo di bottiglia non è la macchina: è
l'attivazione, che dipende da te, e tu non hai tempo.** Quindi il piano
giusto è quello che ti costa minuti, non giorni (§3-§4).

**«Una segretaria senza assumere.»** Già deciso in agosto: la segreteria È
il software (Centralino, Commerciale, Lead Brain, self-booking, Segretaria
WhatsApp, 30 risposte rapide misurate sulla tua voce). Una persona qui
sarebbe più lenta della macchina e senza binari testati. Ma il carico che
descrivi — *appartamenti che entrano, appuntamenti, visite* — per metà è
**CAMPO**: visite in persona, chiavi, inventario. Quello nessun software lo
fa, e una segretaria nemmeno. Se le ore di campo superano stabilmente le
12-15 a settimana, l'ORGANICO §4 dice già cosa fare: un operativo di campo
**a task**, non a stipendio. Il numero si legge dal Foglio di chiamata del
Regista in una settimana. Senza quel numero stai decidendo a sensazione.

**«Eliminarmi le chiamate mi aiuterebbe.»** Probabilmente meno di quanto
pensi, e va fatto lo stesso. Il dato misurato dice che il tuo carico è la
**frammentazione WhatsApp** (metà dei tuoi messaggi sotto 17 caratteri, ~90
messaggi entranti al giorno in produzione questa settimana); le chiamate non
hanno ancora un numero, perché la linea non è mai stata viva. La Receptionist
va accesa perché costa 15 minuti e ti dà silenzio durante le visite — ma la
leva grande è la Segretaria sul «durante» delle chat e la scala della
fiducia sulle bozze che approvi da mesi con lo stesso tap.

**«Registrare tantissimi affari nuovi.»** Nel repo la burocrazia è «a tap»
(pre-accordo → contratto automatico → Magic Sign → ASPI → Pack). Se ti
costa ore, la spesa è **prima** del tap: trascrivere quello che arriva su
WhatsApp/PDF/email dentro il portale. È esattamente ciò che lo
`STUDIO_SCRIVANO.md` (4/09) ha già misurato: cinque letture che non si
parlano, e un contratto creato da un PDF che poi non ha il PDF. I passi 1-2
dello Scrivano (½ + 1 giorno) sono il lavoro di codice che attacca «registrare
affari»; nessuna integrazione GPT lo fa prima o meglio.

---

## 3 · Stasera — 15 minuti, tutti tuoi, in quest'ordine

1. **ElevenLabs → Phone Numbers → `+1 707 846 6974` → Assigned agent:
   BOOM Receptionist.** (30 secondi. Era su Sofia.)
2. **ElevenLabs → Agents → Settings → Webhooks**: URL
   `https://www.boomrome.com/api/phone/elevenlabs` (**www**, non l'apex:
   un POST sull'apex finisce in un redirect che un webhook non segue),
   eventi *post_call_transcription* + *post_call_audio*. Copia il signing
   secret. **Vercel → boum-roma → Settings → Environment Variables →
   `ELEVENLABS_WEBHOOK_SECRET`**: se manca, mettilo e ridistribuisci. Senza,
   l'agente risponde ma nessuna chiamata arriva in `/chiamate`, nessun
   lead, nessun ping.
3. **Test in dashboard** (*Test agent*, anche solo in testo): «what do you
   have in Trastevere?» → deve nominare case VERE. Se dice «I don't have
   the catalog», il transcript ti mostra il perché (§1).
4. **Sull'iPhone**: `**004*+17078466974#` (o `**004*0017078466974#`),
   verifica con `*#004#`. Chiama dal telefono di qualcuno NON in archivio,
   rifiuta la chiamata, parla in inglese, chiedi una casa e uno slot. Poi
   controlla: card 🤖 in `/chiamate`, lead `source:'phone'`, Telegram.
5. **Guarda il costo di quella chiamata nell'app del tuo operatore.** Il
   +1 è un numero USA: la deviazione è una chiamata internazionale a tuo
   carico, e alcuni operatori la bloccano. Se blocca o costa troppo:
   `##004#`, e domani avvii il numero italiano (Twilio IT con regulatory
   bundle, oppure DIDWW/didlogic via SIP — giorni, KYC obbligatorio). Il
   resto non cambia: solo il numero nel codice `**004*`.

---

## 4 · La settimana — in ordine di lavoro tolto per minuto tuo

| # | Leva | Costo per te | Cosa toglie | Dove |
|---|---|---|---|---|
| 1 | **`/fiducia`** su Telegram: guarda i numeri per categoria; accendi quelle con ≥30 decisioni e ≥95% di approvazione (follow-up, solleciti, firme) | 1 minuto | il tap sulle bozze che approvi sempre uguali; 10′ di grazia con ✋ Ferma | `js/fiducia-engine.js`, default TUTTO spento |
| 2 | **🤖 Passa alla Segretaria** su ogni card lead nuova | 0 (un tap invece di una chat) | il «durante» delle conversazioni fino alla visita prenotata; escalation a te solo su soldi/legale/rabbia | `api/segretaria/_core.js` |
| 3 | **Contare le ore di campo** dal Foglio di chiamata (07:30) per 7 giorni | 2 minuti al giorno | la decisione sull'operativo di campo smette di essere a sensazione | `api/regista/_brief.js` |
| 4 | **Scrivano passi 1-2** — il documento letto viene archiviato e riconosciuto per tipo (18 tipi), non solo trasformato in contratto | 0 (lo costruisco io: ½ + 1 giorno) | la trascrizione degli affari nuovi diventa una conferma | `STUDIO_SCRIVANO.md` §4 |
| 5 | **Numero italiano** per la Receptionist | 10′ di pratica, poi attesa | la deviazione smette di essere una chiamata internazionale | `bot/RECEPTIONIST.md` §1 |

Le leve 1-2 sono quelle che l'ORGANICO chiamava «girare le manopole già
disegnate». Sono passate quattro settimane. Se dopo questa settimana sono
ancora spente, il problema non è il carico: è che le decisioni-di-un-click
non trovano il click, e allora la prima cosa da costruire è un posto dove
quei click ti aspettano — la coda **Oggi** del portale li ha già (è la
prima schermata dell'admin): usala come lista della sera, cinque minuti.

---

## 5 · Il progetto GPT — cosa so, cosa non so, cosa vale comunque

**Cosa non so.** Nel repo non c'è traccia di «Astra», di un «doppio
confronto» né di una «infrastruttura semplificata con identità globale»:
sono di una conversazione che non ho. Il ramo si chiama
`workload-gpt-integration`, e basta. Non invento la definizione: prima di
scrivere un rigo di codice mi serve da te **un paragrafo** — cosa fa,
per chi (tu? il cliente?), su quale superficie (ChatGPT app? Telegram?
voce?), e cosa faceva Astra che hai deciso di non fare.

**Le tre letture possibili, con verdetto:**

1. *«GPT come mia superficie unica»* — parli a ChatGPT e lui opera BOOM
   (custom GPT con Actions sulle API). Verdetto: **è già costruito su
   Telegram** (annunci in linguaggio naturale, disponibilità multi-casa,
   task, `/richiama`, `/visite`, `/fiducia`, `/segretaria`, documenti al
   bot → Smistatore). Rifarlo su ChatGPT è una seconda porta sullo stesso
   motore: ha senso SOLO se quella superficie ti fa fare qualcosa che
   Telegram non può (dettatura lunga? ragionare sull'intero archivio?) —
   e allora si aggiunge come **trasporto**, non come cervello.
2. *«Doppio confronto»* — due modelli che si controllano a vicenda. Verdetto:
   **no**. In BOOM il controllo di qualità è già un dato, non un'opinione:
   `approvalStats` (le tue decisioni), i veti deterministici, i test per
   mutazione. Un secondo modello per decisione raddoppia il costo e
   aggiunge un'opinione, non una prova. Dove serve un secondo parere, il
   repo lo fa già gratis: regex prima del modello, modello solo sul resto.
3. *«Identità globale interna»* — una voce sola invece di 26 mestieri con
   nome. Verdetto: **sì, ed è già la regola per l'esterno** («noi di BOOM»,
   mai la firma di una persona — D6 della Segretaria). Verso di te i nomi
   sono utili: dicono chi ha fatto cosa nel report. Questo è un cambio di
   presentazione, non di infrastruttura: zero giorni di sviluppo.

**La regola che vale in ogni lettura** (è quella del Pubblicista: *cambiare
porta = cambiare solo il trasporto*): qualunque integrazione GPT **legge e
scrive attraverso le API che esistono** (`/api/*`, `action_queue`, gli stessi
veti, la stessa scala della fiducia) e **non tiene stato proprio**. Il giorno
in cui GPT «ricorda» qualcosa che Firestore non sa, hai due verità — e la
seconda la scopri quando è sbagliata, su un cliente vero.

**Cosa mi serve da te per procedere**: il paragrafo di definizione, e la
risposta a una domanda sola — *su quale superficie vivi davvero durante la
giornata?* Se è il telefono con Telegram, la porta giusta esiste già e il
lavoro è renderla più capace (Scrivano). Se è ChatGPT, lo dici e progetto
la porta come trasporto.

---

## 6 · Le righe rosse

- **Niente infrastruttura nuova prima che le leve di §4 siano accese da due
  settimane.** È la regola che manca da agosto.
- **Mai** un secondo stato fuori da Firestore (memoria di un GPT, fogli,
  note): una verità sola.
- **Mai** delegare trattativa e prezzo — né a un umano né a un modello (già
  scritto nell'ORGANICO, vale ancora).
- **Mai** una deviazione di chiamata su un numero che non hai provato con
  UNA chiamata e di cui non hai visto il costo.
- **Mai** un URL BOOM sull'apex consegnato a un servizio esterno: `www`,
  sempre (il test lo pretende).
- La qualità non cala delegando sui binari misurati: cala quando il collo
  di bottiglia è uno solo e non ha tempo. È la situazione di oggi, ed è la
  ragione per cui questo studio è breve.
