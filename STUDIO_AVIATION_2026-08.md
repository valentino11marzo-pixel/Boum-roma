# STUDIO — LO SCALO: il linguaggio aeroportuale di BOOM (2026-08)

La domanda dell'operatore: *"abbiamo già una base ispirata all'aviazione?
E qual è il design d'eccellenza per portare quello stile al marchio?"*

## Parte 0 — Il verdetto

**La base non solo esiste: è la dottrina dichiarata del sito.** Non è
un'ispirazione da aggiungere — è una lingua già parlata a metà, e il
lavoro d'eccellenza è COMPLETARLA e codificarla, non inventarla.

La prova, nei sorgenti:

| Dove | Cosa c'è già | Riferimento |
|---|---|---|
| `apartments.html` | Il manifesto: *"La metafora è l'ARRIVO: Roma come scalo (ROM), il tabellone live come quello delle partenze — ed è la nostra lingua da sempre: i Solari SONO tabelloni d'aeroporto"*. Il tabellone delle zone che FILTRA, numeri di gate sulle tessere, il prezzo su celle Solari (`__solariPrezzo`) | riga ~65 e ~354 |
| `index.html` | **IL BIGLIETTO** — il servizio come boarding pass: rotta con il punto che percorre la tratta, banda-lamina con il lampo, stampa calcografica, filigrana, perforazione e talloncino, tilt verso il cursore, analytics `gate_view`. Stati nei *"colori di scalo (verde=boarding)"* | riga ~479 |
| `board.html` (`/board`) | Il tabellone partenze LIVE, indicizzato: *"updated like an airport"*. Orologio di Roma, pulse verde, fremiti delle ante | tutto il file |
| `property-finding.html` | **IL CHECK-IN** — *"il brief È un boarding pass: si compila e si vola"*, la strip d'imbarco, la sezione "The Wallet boarding pass" | righe ~1052, ~1426, ~2372 |
| `api/viewings/_email.js` | *"One template family for the whole flight: confirmation (the boarding pass)"* — il blocco `ticket()` condiviso da conferma, promemoria, dopo-visita | righe 3–20 |
| Il ciclo visita intero | La visita È un volo per costruzione: conferma → boarding pass Apple Wallet (geofence al portone) + calendario → countdown T-24h / T-3h / T-30m → T+2h "com'è andata" | `api/viewings/_moments.js`, CLAUDE.md |
| `design/pages-deco/solari-engine.html` | Il motore Solari 4.0 — meccanica a palette VERA (Gino Valle, 1962): due mezze celle + due ante 3D, rulli corti, retargeting a metà giro, calibrazione ottica sul glifo, failsafe Safari | tutto il file |
| `design/pages-deco/costruisci-volo.py` | **IL VOLO** (preview PFS 7.0): il mercato come tabellone dove il buon annuncio SCADE mentre scorri (BOARDING → LAST CALL → GONE), il radar che lavora, il timbro REJECTED | header del file |
| `design/pages-deco/costruisci-kiosk.py` | Il tabellone da vetrina per Via dei Coronari: schermo intero, rotazione 14s, giro delle ante | README pages-deco |
| `apartment-detail.html` | `ba-gate` con `gate-tick`, la "banchina" | righe ~472, ~1217 |
| I pass Wallet | 4 tipi già in produzione (viewing/tenant/referral/landlord) — il boarding pass è un FATTO di prodotto, non una grafica | `api/generate-pass.js` |

E c'è di più: mezzo prodotto è già aviazione anche dove non si vede —
il **Radar** (la Centrale = torre di controllo del mercato), il
**Centralino**, i codici protocollo `BOOM-<base36>`, la corsia
`ahead` di `marketLane` (una casa che *atterra* il 1 settembre).

## Parte 1 — Le regole che l'hanno fatta funzionare (la dottrina)

Estratte dai sorgenti e da `design/pages-deco/STUDIO_ECCELLENZA.md`.
Sono il motivo per cui la metafora regge invece di essere un tema
carnevalesco, e OGNI estensione deve rispettarle:

1. **Mai scenografia.** *"niente è scenografia: il board legge il
   catalogo vero, 'updated' è il timestamp vero, i chip dicono solo ciò
   che è vero"* (apartments.html). Un tabellone con dati finti è la
   morte della metafora.
2. **La metafora è un fatto di prodotto.** Il biglietto della home non
   FINGE di essere un boarding pass: la visita confermata ARRIVA come
   Apple Wallet boarding pass. Ogni estensione deve poggiare su una
   meccanica vera già in produzione.
3. **Il movimento è informazione.** Se non dice nulla, non si muove
   (STUDIO_ECCELLENZA). Le ante flippano quando un DATO cambia; il
   fremito è raro come sui tabelloni veri.
4. **Degrado totale.** Senza JS la pagina è COMPLETA e statica;
   `reduced-motion` = ferma ma intera (pattern `html.cine`).
5. **Ogni cifra esiste già nel repo.** Mai inventata.
6. **La palette è quella dello scalo.** Oro `#FFD700` su `#030303`
   (il sito 2026 — MAI il `#D4AF37` del portal), verde `#00FF88` =
   boarding, `#FF7A6B` = last call. Sono letteralmente i colori dei
   tabelloni aeroportuali: ambra su nero, verde di via, rosso d'allarme.

## Parte 2 — Il buco: dove la lingua si interrompe

Il paradosso attuale: **la promessa è più forte della consegna.** La
home vende il boarding pass, il flusso che lo CONSEGNA non lo parla.

| Superficie | Stato | Il buco |
|---|---|---|
| `pass-delivery.html` | anello d'oro + QR | La pagina che consegna il pass **non sembra un boarding pass**. È il momento più fotografabile del funnel e oggi è generico |
| `book.html` | boarding pass solo in un commento | Il flusso di prenotazione non è un check-in: lo step 3 (griglia slot) è una griglia qualsiasi, la schermata confermata non stampa un biglietto |
| `tenant.html` (`/casa`) | zero aviazione | Il journey (T-30 → chiavi → T+3 → rinnovo) è GIÀ una rotta a tappe nel backend e in pagina non si vede |
| `/board` | solo partenze | La corsia `ahead` (16 case su 26 con data di rilascio NOTA) è un tabellone ARRIVI già pronto nei dati e mai disegnato |
| Email non-visite | design system nero+oro | Il blocco `ticket()` esiste solo per la famiglia visite; benvenuto, journey e conferme non hanno la grammatica del biglietto |
| Motore Solari | **3 copie** | inlined in `apartments.html`, di nuovo in `board.html`, sorgente in `design/pages-deco/solari-engine.html` — viola la regola "una copia sola" del repo (`_avail.js`, `contract-pdf.js`) |
| Kiosk vetrina | preview mai servita | `boom-kiosk.html` esiste, lo schermo in Via dei Coronari no |
| Codici | sparsi | `BOOM-<base36>`, `BM…` dei portali PFS, gate numbers: la grammatica c'è ma non è dichiarata da nessuna parte |

## Parte 3 — La proposta: «LO SCALO», il linguaggio codificato

Il nome del sistema: **LO SCALO** (è la parola del manifesto: "Roma
come scalo (ROM)"). Un linguaggio, dieci mosse, in ordine di resa.
Il laboratorio vivo con tutti i componenti proposti è
`design/scalo/scalo-lab.html` (autonomo, aprilo e basta).

### S1 — Una copia sola del motore Solari (`js/solari-engine.js`)
La mossa igienica che abilita tutte le altre. Estrarre il motore 4.0 in
un UMD alla maniera di `boom-geo`/`dispo-engine` (`window.BoomSolari`),
e far sì che apartments, board, kiosk e ogni superficie futura lo
importino. Tre copie oggi = tre Safari-fix da tenere allineati a mano.
Test: parità cella-per-cella con la copia di apartments (le stringhe
del drum, i tempi delle ante).

### S2 — La carta d'imbarco vera (`pass-delivery.html` rifatta)
Il momento più condivisibile del funnel diventa il pezzo forte:
- la pagina **stampa** il biglietto (animazione di emissione dal
  taglio, come il kiosk del gate: 600ms, una volta sola);
- layout da boarding pass reale: rotta `ROM → <ZONA>`, gate = zona,
  "flight" = codice visita, orario in ora di Roma, QR vero (già c'è),
  talloncino perforato;
- il talloncino si **strappa** al tap → sotto c'è "Add to Apple
  Wallet" (il gesto è l'affordance: si strappa per salire a bordo);
- modalità video: la rotta diventa `YOU → LIVE CALL`, niente gate
  (coerente con `buildViewingPass` che già droppa il geofence).
Dati: tutti già serviti da `GET /api/viewings/pass?id=&meta=1`. Zero
backend nuovo.

### S3 — Il check-in (`book.html`)
Non un restyle: un ri-nominare onesto di ciò che il flusso già fa.
- Stepper con la grammatica del check-in: **Volo** (la casa) →
  **Posto** (lo slot) → **Carta d'imbarco** (conferma);
- la griglia slot vestita da tabellone partenze del giorno (le colonne
  ORA / STATO — uno slot preso = cella spenta);
- schermata confermata = il biglietto di S2 (stesso componente);
- con `requireApproval:true` il copy resta onesto come oggi
  (`applyApprovalCopy`): "Request sent" = *standby*, mai un biglietto
  emesso per una visita non confermata (la lezione del pass che è "una
  bugia al cliente" — tests/viewings/availability-ui.mjs).

### S4 — Il tabellone ARRIVI (la mossa che VENDE)
La più alta resa commerciale dello studio. `marketLane` ha già le tre
corsie e 16 case su 26 sono `ahead` — occupate con data di rilascio
nota. Oggi il /board le tace. Proposta: **split del tabellone**
PARTENZE (libere ora → Apply) / **ARRIVI** (in atterraggio → Reserve,
"LANDING 1 SEP"), stessa meccanica Solari, colonna ETA. È il
pre-blocco reso teatro: nessun competitor mostra le case che si
liberano, perché nessuno ha quel dato (viene dai contratti firmati —
`availableFrom` scritto da magic-sign). Anche su apartments: la riga
di testata "in arrivo questa settimana".

### S5 — I timbri
Il timbro di gomma è il gesto burocratico-aeroportuale che BOOM ha già
due volte (la "stamp ceremony" del pre-agreement, il REJECTED del
VOLO). Codificarlo in un componente unico con TRE timbri veri:
- **WALKED BY BOOM ✓** — sulle card/schede: la casa camminata di
  persona (il claim già in pagina, ora diventa un sigillo);
- **SIGNED** — la conferma di firma su /sign (già c'è la cerimonia,
  si allinea il disegno);
- **REJECTED** — il teatro della selezione PFS (dal VOLO).
Animazione: scale-down + micro-rotazione + inchiostro irregolare,
300ms, una volta, mai in loop. Un timbro dice un FATTO avvenuto: mai
usarlo come decorazione di un claim futuro.

### S6 — La rotta in `/casa`
Il journey backend (T-30 benvenuto → T-14 documenti → T-7 → T-1
chiavi → T+3 → T-90 rinnovo) diventa la **striscia di rotta** in cima
alla pagina inquilino: tratta punteggiata, tappe con i nomi veri, il
punto (l'aereo) posizionato sul VERO stato del contratto
(`contracts.journey.<step>` flags — dati già scritti dal cron). La
prossima rata = "next scheduled service". Stessa tratta-e-punto del
biglietto della home: il cliente ritrova il segno che l'ha convinto.

### S7 — I codici di rotta (la grammatica dichiarata)
Ogni scalo ha i suoi codici. BOOM li ha già, sparsi: si dichiarano.
- **ROM** è lo scalo (già nel manifesto);
- codici zona a 3 lettere DERIVATI dal lessico curato delle ~38 zone
  di `radar-engine.inferZone` (TRA Trastevere, MON Monti, PIG Pigneto,
  PRA Prati, SLO San Lorenzo…): una tabella sola, esportata, mai
  inventata al volo — la disciplina di `matchZone` (ambiguo → niente);
- il numero visita in forma di volo: `BM 0142` (BM = BOOM, già
  prefisso dei codici portale PFS);
- dove compaiono: tabelloni, biglietti, pass Wallet, email `ticket()`.
Regola dura: il codice è un SOPRANNOME del dato vero, mai una chiave —
nei doc Firestore restano gli id di sempre.

### S8 — Il kit micro-motion (con il budget)
Dal lab, pronti: **gate-tick** (già in apartment-detail — il numero
che scatta quando entra in vista), **fremito** Solari (già in board —
raro, casuale), **luci di pista** sul CTA primario (chase sequenziale
SOLO su hover/focus: è un'affordance direzionale, non un addobbo),
**punto di rotta** sulla tratta (già in index). Budget dichiarato:
UN organo vivo per schermata; tutto sotto `prefers-reduced-motion`
si ferma completo (pattern già in casa).

### S9 — Il kiosk in vetrina
`boom-kiosk.html` (20KB, zero dipendenze) è pronto: si serve su una
rotta (`/kiosk`, noindex) e si mette lo schermo in Via dei Coronari.
Un tabellone Solari VERO in una vetrina del centro è advertising che
nessun portale può copiare, e costa un monitor.

### S10 — Dove la metafora NON va (il confine dichiarato)
L'eccellenza è anche sapere dove fermarsi. La lingua dello scalo è per
il **viaggio del cliente** (scoprire, prenotare, visitare, entrare,
abitare, rinnovare). NON entra in:
- contratti, PDF fiscali, verbali, fascicoli (carta legale: `_pdfbrand`
  resta sobrio — un Allegato B con la grafica da biglietto aereo è un
  documento che un giudice guarda storto);
- il portal operativo (BOOM OS ha la sua lingua, oro `#D4AF37`);
- soldi dovuti e solleciti (un ritardo di pagamento non è un "delay":
  la serietà lì è il design).
E il **suono** (chime da annuncio gate, clatter delle ante): valutato
e SCONSIGLIATO di default — sul web il suono non richiesto brucia
fiducia; al massimo opt-in sul kiosk fisico, dove l'ambiente è nostro.

## Parte 4 — Ordine di lavoro proposto

1. **S2 pass-delivery** (mezza giornata, zero backend, il momento wow
   del funnel) + **S3 book** (stesso componente, riuso immediato).
2. **S4 arrivi** su /board e apartments (i dati ci sono già; vende la
   corsia `ahead` che oggi è muta).
3. **S1 motore unico** (igiene che evita il terzo Safari-fix a mano).
4. **S6 rotta in /casa** (retention; dati journey già scritti).
5. **S5 timbri + S7 codici + S8 kit** (il linguaggio si consolida).
6. **S9 kiosk** (decisione fisica dell'operatore).

Test da scrivere con le mosse: parità del motore estratto (S1), il
biglietto di S2 che non nasce mai su visita `pending` (la regola di
availability-ui), i codici zona che coprono ESATTAMENTE il lessico di
`inferZone` (S7 — un codice orfano è un errore), e il lab stesso
tenuto come specimen di regressione visiva (390/1440).

## Parte 5 — Il laboratorio

`design/scalo/scalo-lab.html` — pagina autonoma (nessun Firebase,
nessuna dipendenza oltre Inter), dati DEMO dichiarati. Contiene, vivi:
il tabellone partenze/arrivi con il motore Solari 4.0 vero, la carta
d'imbarco con emissione e strappo, il check-in, i timbri, la rotta
del journey, le luci di pista, i codici zona, i token di movimento e
il confine (S10) scritto in pagina. È la proposta che si guarda.
