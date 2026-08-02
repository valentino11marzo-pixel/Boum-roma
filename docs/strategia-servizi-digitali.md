# BOOM · Strategia dei servizi digitali — cosa ci rende diversi, come si itera, cosa costruire

**Data:** 2026-08-01 · **Scopo:** rispondere a tre domande con i piedi nel codice, non nei desideri:
(1) cosa BOOM ha *davvero* di diverso e vincente, (2) qual è il metodo per creare e iterare
servizi digitali che vendono organicamente (il gioco iniziato col PFS), (3) quali nuovi
prodotti hanno un mercato reale e con quale priorità. Ogni affermazione qui sotto è
ancorata a un file del repo o a un numero verificabile — mai a un'opinione di marketing.

Documenti fratelli (non duplicati qui, eseguiti da qui): `docs/seo-conversion-audit.md`
(il COME del canale organico, file per file), `docs/university-outreach.md`,
`docs/owner-outreach.md`, `docs/corporate-outreach.md` (i playbook di canale già scritti).

---

## PARTE 1 — Cosa BOOM ha davvero di diverso (verificato, non dichiarato)

Il punto non è "siamo premium". Il punto è che nel repo ci sono **sei vantaggi
strutturali** che un'agenzia tradizionale non può copiare comprando un gestionale.

### 1. Costo marginale ~zero sull'INTERO ciclo di vita
Il ciclo completo — lead → risposta → visita → proposta → contratto → firma →
registrazione → incasso → fisco → abitare → rinnovo — gira da solo con l'umano come
firma di qualità, mai come motore:

| Fase | Chi la fa | Dove |
|---|---|---|
| Cattura lead (portali, email, WhatsApp) | `leads/scan-inbox`, `homie/*`, `apply-lead` | cron + webhook |
| Qualifica | Lead Brain (regole gratis + 1 chiamata haiku in batch) | `leads/brain` |
| Prima risposta | Il Commerciale (bozza AI → tua approvazione) | `employees/commerciale` |
| Visita | slot reali, self-booking, pass Wallet, countdown T-24/3h/30m | `viewings/*`, `book.html` |
| Proposta | pre-agreement self-service + Stripe | `preagreement/*` |
| Contratto + firma | auto-convert + Magic Sign + FES | `magic-sign/*` |
| Registrazione | Fascicolo Fiscale + Pack RLI/ARPE in ZIP | `fiscal/*`, `sign/_pack.js` |
| Incasso | Canone via BOOM + riconciliazione bancaria | `payments/*`, `banking/*` |
| Fisco | Il Contabile + taxpack + scadenzario | `employees/contabile` |
| Abitare | journey T-30→uscita, manuale casa, manutenzione | `journey/_run.js`, `/casa` |

Un competitor per coprire questa tabella assume 4–6 persone. Il costo di servire il
contratto n+1 qui è qualche centesimo di AI e un'email. **Conseguenza strategica
n.1:** BOOM può vendere a €49–€89 servizi che per altri sarebbero in perdita.
**Conseguenza n.2:** BOOM può tenere accesi 15–20 esperimenti di prodotto in
parallelo — nessun'altra agenzia a Roma può permettersi il *portafoglio di scommesse*.

### 2. English-first end-to-end, in un mercato monolingue
L'unico funnel a Roma dove un espatriato trova (`/apartments`, `llms-listings.txt`),
visita (video viewing, instant booking), firma (pre-agreement + Magic Sign EN),
paga (Stripe o bonifico con causale) e abita (`/casa` EN) **senza mai incontrare
l'italiano burocratico**. Non è una traduzione: la lingua è decisa per lettore in ogni
email (`api/_lang.js` — l'inquilino EN, il locatore IT, l'operatore IT). I portali sono
IT, le agenzie sono IT, Spotahome/HousingAnywhere non hanno nessuno sul territorio.
Il segmento internazionale (studenti, ricercatori, nomadi, corporate) è **strutturalmente
mal servito** e paga volentieri per non essere truffato.

### 3. Il concordato-as-code (il monopolio tecnico)
`js/canone-engine.js`: le 75 zone dell'accordo Roma 25/07/2023, coefficienti di
superficie convenzionale, fasce, subfasce, regola del cap, verdetto. In tempo reale:
*"questo canone è asseverabile; il massimo è X; con la cedolare al 10% risparmi Y"*.
Un CAF ci mette un appuntamento; la maggior parte dei commercialisti non lo sa
calcolare. È già pubblico (`/canone`, con cattura lead via `/api/canone-lead`) e già
in fondo alla filiera c'è la consegna completa: generatori di contratto tipo
(Allegato B e **C studenti**, prot. RA/2023/0044852), Fascicolo Fiscale, Pack
Registrazione ZIP pronto per ARPE/CAF. **Manca solo il prodotto pagato in mezzo**
(→ Scommessa 1).

### 4. Fiducia ingegnerizzata, in un mercato dove la truffa è il default
L'expat a Roma viene truffato per statistica, e ogni guida glielo ricorda. BOOM ha
trasformato la fiducia da promessa a sistema: pin onesti (`js/boom-geo.js` — exact /
street / zone, mai fingere il portone), disponibilità vera (calendario Workspace
dentro la griglia slot), fee carta **misurata** sul costo Stripe reale invece che
inventata (`payments/_ref.js`), prezzi all-in al centesimo, contratto firmato con
certificato FES e hash, recensione chiesta solo DOPO le chiavi (journey T+3).
La fiducia è il collo di bottiglia della conversione in questo mercato: qui è
un asset accumulabile, non un claim.

### 5. Distribuzione nativa per l'era delle risposte AI
`llms.txt` + `llms-listings.txt` rigenerato di continuo, JSON-LD
Service/Offer/FAQ, fatti specifici e citabili (prezzi, tempi, articoli di legge).
Quando ChatGPT/Perplexity/Google AI rispondono a "apartments in Rome for expats"
o "how to get my deposit back in Italy", BOOM è tecnicamente **il più citabile**.
Questo canale a Roma non ha ancora un vincitore: siamo in anticipo, e l'anticipo
in SEO/AI-SEO si capitalizza (chi viene citato → viene linkato → viene citato).

### 6. La velocità di iterazione È il moat
Nessuna build, catalogo prezzi/copy server-side (`api/_catalog.js`), un pattern
ripetibile (pagina → checkout → webhook → lead → journey), test che **pinnano le
regole di business** (`tests/journey/steps.mjs` garantisce che le chiavi non si
vendono mai e che a chi ha rate scadute non si propone un upsell). Idea → produzione
in un giorno. Chi testa 20 servizi l'anno impara 10× più in fretta di chi ne lancia 2 —
e l'apprendimento composto è l'unico vantaggio che non si può comprare.

### E l'onestà: cosa NON abbiamo (i vincoli veri)
- **L'offerta è il collo di bottiglia.** ~20 annunci vivi. La domanda arriva da sola
  (i portali la portano); i **mandati** no. Ogni scelta di prodotto va pesata anche
  per quanto porta proprietari.
- **Bus factor 1.** La Squadra mitiga, ma la firma di qualità è una persona sola.
  (Ragione in più per prodotti a consegna ≥70% automatica.)
- **Brand giovane.** Poche recensioni, dominio recente: la SEO paga in mesi.
  Nel frattempo vincono i canali a fiducia trasferita (università, commercialisti).
- **Servizi non ancora validati dai numeri.** Quanti checkout reali per servizio?
  Stripe lo sa già. Prima regola dell'iterazione: guardare i numeri veri prima di
  investire nel prossimo (vedi Parte 3, ciclo settimanale).

---

## PARTE 2 — La tesi centrale: il volano

Nel mercato degli affitti la **domanda è una commodity** (i portali la vendono a
tutti); l'asset scarso è il **mandato del proprietario**. Da qui la tesi in tre mosse:

1. **Monetizza la domanda con servizi produttizzati** — già in corso (PFS €350,
   Services 2.0). Geniale proprio perché incassa **senza bisogno di inventario**.
2. **Conquista l'offerta con strumenti gratuiti d'élite** — `/canone` è il prototipo:
   un calcolo che nessun altro sa fare, gratis, che consegna lead proprietari.
3. **Trasforma i proprietari in ricavo ricorrente** (gestione) — che a sua volta
   blocca l'inventario in esclusiva: ogni casa gestita è il prossimo mandato
   automatico, ogni contratto genera recensioni + referral + dati.

```
strumenti gratis → lead proprietari → mandati → inventario
      ↑                                             ↓
  dati + brand ← recensioni/referral ← contratti ← domanda expat (già abbondante)
                        └── gestione ricorrente = la rendita che finanzia tutto
```

Il PFS e i servizi monetizzano OGGI; il volano costruisce il valore TERMINALE.
Le due cose non competono: si finanziano a vicenda.

---

## PARTE 3 — Il Metodo (il gioco del PFS, reso esplicito e ripetibile)

### La regola del dolore con scadenza
Un servizio vende **organicamente** solo se intercetta un dolore che ha tutte e tre:
1. **urgenza con una data** (arrivo a settembre, registrazione entro 30gg, disdetta),
2. **soldi già in gioco** (deposito trattenuto, cedolare al 21% invece che al 10%),
3. **ricerca attiva** (lo digitano su Google/ChatGPT — non va spiegato che esiste).

Passano il test: deposito trattenuto · contratto da controllare prima di firmare ·
arrivare a Roma senza farsi truffare · mettersi in concordato. NON passano:
"consulenza immobiliare", "assistenza generica", tutto ciò che inizia con "educare
il mercato" (educare = pagare la distribuzione).

### Le 7 regole (già implicite nei servizi che funzionano)
1. **Vendi l'esito, non le ore.** "We get it back", non "consulenza legale".
2. **Prezzo fisso pubblicato + garanzia asimmetrica.** Rimborso se non consegnamo
   (Virtual Viewing), credito sull'upgrade (Contract Check → Deal Assistance),
   success fee solo sul recuperato (Deposit Recovery). Il rischio lo teniamo noi:
   è il motivo per cui uno sconosciuto compra.
3. **Una pagina, un bottone, Stripe.** Il catalogo server-side decide prezzo e copy
   (`api/_catalog.js`); la pagina raccoglie solo il contesto che serve alla consegna.
4. **La macchina consegna, l'umano firma la qualità.** Tutto ciò che esce passa
   dall'`action_queue` con un tap di approvazione — mai bloccante, mai automatico
   verso l'esterno senza controllo.
5. **Strumento gratis → fiducia → prodotto pagato.** La scala: `/canone` gratis →
   pacchetto concordato; guida deposito gratis → recovery; welcome kit gratis →
   concierge. Il gratis DEVE essere d'élite (un tool vero, non un PDF acchiappa-email).
6. **Ogni cliente lascia tre semi:** recensione (journey T+3, `REVIEW_URL` vero),
   referral (`BOOM-<uid6>` già in `/casa`), caso/contenuto (con permesso).
7. **30 giorni, una metrica, poi raddoppia o uccidi.** La metrica è una sola:
   checkout pagati (o lead proprietari per gli strumenti). Niente servizi zombie:
   una pagina che non converte è debito di manutenzione e diluizione del brand.

### Il ciclo settimanale (1 ora, lunedì mattina)
I numeri sono già in casa — vanno solo guardati con cadenza:
1. Stripe: checkout della settimana **per servizio** (5 min).
2. `leads` per `source` (web/scan-inbox/whatsapp/stripe-recovery): dove nasce la domanda.
3. `/canone` lead proprietari della settimana.
4. UNA decisione: 1 esperimento nuovo O 1 miglioria al vincente O 1 kill.
5. Aggiornare la riga del servizio in questo file (data + numero + decisione).

### I 5 filtri per ogni idea nuova (1–5 ciascuno, soglia ~18/25)
| Filtro | Domanda |
|---|---|
| Ricerca attiva | Lo cercano già su Google/AI, con che volume? |
| Asset in casa | Quanto è già costruito nel repo? (≥70% = ottimo) |
| Prezzo | ≥€49 one-shot o ricorrente; il cliente lo paga senza approvazioni di terzi? |
| Distribuzione strutturale | C'è un canale organico OBBLIGATO (SEO, referral, partner)? |
| Consegna automatica | ≥70% macchina, umano solo in approvazione? |

---

## PARTE 4 — Audit del portafoglio attuale (spingere / sistemare / lasciare)

| Servizio | Prezzo | Verdetto | Azione |
|---|---|---|---|
| PFS Property Finding | €350 | **Spingere** — il flagship della domanda, perfetto per settembre | prova sociale in pagina; bundle con Virtual Viewing |
| Deal Assistance | €249 | Tenere — la scala 49→249 è corretta | SEO EN "rental contract check Italy" |
| Contract Check Express | €49 | Tenere — è l'esca della scala | citarlo in ogni contenuto contratti |
| Virtual Viewing | €89 | **Riposizionare** — da solo vende poco, come *primo gradino anti-truffa* è il wedge | dentro il bundle di settembre (Scommessa 2) |
| Deposit Recovery | €99+20% | **Spingere** — il più cercato organicamente in EN | lead magnet "the 1590 letter" gratis (Scommessa 4) |
| Concierge | da €390 | Tenere — WhatsApp-first è giusto | — |
| Move-in Pack / Cleaning | €149/€119 | Tenere — upsell del journey, costo zero | — |
| `/canone` (gratis) | — | **È il gancio proprietari** — vivo, cattura lead | costruirci dietro il prodotto pagato (Scommessa 1) |

Nota di metodo: prima di ogni "spingere", leggere il numero vero su Stripe.
Se un servizio ha 0 checkout in 60 giorni con traffico in pagina → il problema è
l'offerta (prezzo/promessa), non il traffico. Se non ha traffico → è distribuzione.
Le due malattie hanno cure diverse; diagnosticare prima di curare.

---

## PARTE 5 — I nuovi prodotti (portafoglio con priorità)

### ADESSO (30 giorni) — la finestra di settembre + l'asset concordato

#### Scommessa 1 — **Pacchetto Concordato Chiavi in Mano** (proprietari, €349–449)
- **Cosa:** dietro il verdetto gratis di `/canone`: contratto tipo (Allegato B/C già
  generati dal portal), attestazione ARPE gestita (Fascicolo Fiscale + Pack
  Registrazione **già costruiti**), registrazione RLI, promemoria annualità
  (`fiscal-engine`). Il verdetto del calcolatore mostri il RISPARMIO in euro:
  *"Con questo canone rientri in fascia: cedolare al 10% invece del 21% + IMU
  ridotta ≈ €1.500–2.500/anno. Te lo mettiamo in regola noi: €349."* Spesso col
  concordato il proprietario **incassa meno ma guadagna di più** — è questa frase,
  quantificata sul suo caso, che vende.
- **Perché vince:** il calcolo è il nostro monopolio tecnico (vantaggio #3); la
  consegna è già costruita al ~90%; ogni cliente concordato è un mandato potenziale
  (alimenta il volano). Ricerca attiva reale: "canone concordato roma calcolo /
  conviene / attestazione" — e chi cerca è ESATTAMENTE il proprietario che vogliamo.
- **Da costruire:** pagina prodotto + voce catalogo + CTA con risparmio nel verdetto
  di `/canone`. ~2–3 giorni. Filtri: 5/5/5/5/4 = **24/25**.
- **Stato: LIVE 2026-08-02** — `/pacchetto-concordato` (kind `concordato-pack`,
  €349) + CTA con parametri dal verdetto di `/canone`; email cliente in italiano.

#### Scommessa 2 — **September Landing / Remote Move Pack** (studenti+expat, €299)
- **Cosa:** bundle Virtual Viewing + Deal Assistance + coordinamento move-in in un
  solo prodotto: *"arrivi a settembre, chiudi casa dall'estero senza farti truffare —
  visita video live, contratto controllato in inglese, utenze pronte"*. Prezzo bundle
  €299 (vs €338 separati) o €0 sul fee se affitti con BOOM.
- **Perché vince:** è il 1° agosto — le coorti arrivano tra 4–8 settimane e gli
  housing office decidono ORA (finestra maggio–agosto, `docs/university-outreach.md`).
  I competitor remoti non hanno nessuno sul posto; le agenzie locali non parlano
  inglese. Video-first + firma EN + Wallet = esattamente la nostra macchina.
- **Da costruire:** 1 pagina bundle + 1 voce catalogo (1 giorno). Il resto è
  ESECUZIONE dell'outreach già scritto: 5–6 uffici, non 5.000 studenti.
  Filtri: 5/5/4/5/4 = **23/25**. **La più urgente per calendario.**
- **Stato: LIVE 2026-08-02** — `/remote-move-pack` (kind `remote-move-pack`,
  €299) nella famiglia Services 2.0. Resta l'outreach università: quello è umano.

### DOPO (60–90 giorni) — il ricavo ricorrente

#### Scommessa 3 — **BOOM Gestione** ("il gestionale + il gestore", 6% del canone o €69/mese/unità)
- **Cosa:** per il proprietario (soprattutto remoto/estero): incasso con causale
  `BOOM-XXXXXX` + riconciliazione bancaria automatica (già vivi), solleciti (il
  Gestore), scadenzario fiscale + pacchetto commercialista (il Contabile + taxpack),
  manutenzione con triage (da `/casa`), rinnovi (journey T-90), documenti che si
  archiviano da soli (lo Smistatore). Un report mensile in email design system.
- **Perché vince:** i property manager romani prendono 8–12% **con umani**; il nostro
  costo marginale è software (vantaggio #1). E ogni unità gestita = la prossima
  vacancy in esclusiva. È il prodotto che trasforma BOOM da fee-business a rendita —
  10 unità ≈ €8–12k/anno ricorrenti a costo quasi zero, e il churn dei gestionali è
  bassissimo.
- **Da costruire:** onboarding proprietario + report mensile + pagina (~1–2
  settimane). **Pilota sui proprietari già in portafoglio** (sono già nel sistema).
  Filtri: 4/5/5/4/4 = **22/25**.

#### Scommessa 4 — **Scudo Deposito, due lati** (€79 il verbale, recovery già vivo)
- **Cosa:** lato prevenzione: *Verbale di consegna fotografico* check-in/check-out,
  PDF firmabile (pdf-lib + storage già in casa) — vendibile a ENTRAMBI i lati e
  incluso nei contratti BOOM come standard di qualità. Lato cura: il recovery
  esistente, potenziato dal lead magnet **"the 1590 letter"** — template gratuito
  della lettera di messa in mora → la pagina EN più linkabile del sito ("landlord
  won't return deposit Italy" è una ricerca disperata e costante).
- **Da costruire:** generatore verbale (1–2 giorni) + articolo/template (1 giorno).
  Filtri: 5/4/3/5/4 = **21/25**.

### ORIZZONTE (6–12 mesi) — le opzioni sul tavolo

| # | Idea | Perché sì | Perché non ora |
|---|---|---|---|
| 5 | **Relocation B2B** (aziende che spostano dipendenti; transitorio = nostra specialità; `docs/corporate-outreach.md` già pronto) | 1 contratto HR = N inquilini/anno, fattura alta | ciclo di vendita lungo; serve un caso studio → farlo DOPO 2–3 corporate organici |
| 6 | **BOOM OS white-label** (visite self-booking + Magic Sign + Pack RLI + solleciti come SaaS per piccole agenzie, €199–399/mese) | TAM enorme (decine di migliaia di agenzie ferme al fax); il software esiste | richiede vendita e supporto B2B; il pitch giusto è "lo usiamo noi su N contratti" — serve prima l'N |
| 7 | **Rome Rent Index** (report trimestrale: asking veri dal radar PFS + fasce concordato per zona) | PR, link, autorità: è il tipo di contenuto che i giornali riprendono; costo ~zero (i dati li raccogliamo già) | ritorno in brand/link, non in cassa: farlo quando le scommesse 1–3 girano |

### Idee valutate e SCARTATE (con il perché — il no è metà del metodo)
- **Screening inquilini venduto come report ai privati (€49):** GDPR delicato su dati
  di terzi + il valore vero dello screening sta DENTRO la gestione (Scommessa 3),
  non standalone.
- **Portale/marketplace aperto:** guerra frontale coi portali, CAC infinito, distrugge
  il posizionamento "verificato". Mai.
- **Corsi/info-prodotti ("come affittare a Roma"):** monetizzano il pubblico sbagliato
  e diluiscono il brand *fatto-per-te*. Il contenuto resta gratis e vende i servizi.
- **Espansione Milano:** il motore è parametrico (zone, accordo, engine) ma il gioco
  ora è la DENSITÀ su Roma (recensioni, mandati, brand locale). Rivalutare a
  pipeline Roma satura.

---

## PARTE 6 — Distribuzione organica (l'ordine giusto dei canali)

1. **SEO transazionale IT lato proprietari** — "canone concordato roma calcolo /
   conviene / attestazione", "registrazione contratto affitto", "contratto transitorio
   roma": `/canone` è la landing; le P0 dell'audit SEO (`docs/seo-conversion-audit.md`)
   si eseguono questa settimana (blog ricostruiti sul design system, FAQPage, titoli).
2. **SEO + AI answer engines EN lato inquilini** — deposit/scams/moving-to-rome sono
   già forti; mantenere fatti specifici e citabili (prezzi, tempi, articoli di legge):
   è ciò che i motori AI premiano. `llms.txt` è già avanti: tenerlo allineato ai nuovi
   prodotti.
3. **Università, ADESSO** — eseguire `docs/university-outreach.md`: 5–6 uffici
   housing, con la Scommessa 2 come offerta concreta da mettere nella loro lista.
   È fiducia trasferita: il canale che converte mentre la SEO matura.
4. **Recensioni** — il journey T+3 già chiede; verificare che `REVIEW_URL` sia il
   vero `g.page/r/…`. Il local pack per "estate agent rome english" si vince con
   30–50 recensioni: ogni contratto DEVE lasciarne una.
5. **Referral con incentivo esplicito** — il codice esiste (`BOOM-<uid6>` in `/casa`):
   dargli un valore dichiarato (es. €50/€50 in credito servizi) e mostrarlo nel
   journey. Gli expat vivono in community: il referral è il loro canale naturale.
6. **Commercialisti/CAF come canale** — il Pack Registrazione gli fa risparmiare ore:
   *"mandami il proprietario, ti mando il fascicolo pronto"*. Dieci studi che
   conoscono BOOM = un flusso di mandati concordato senza ads.
7. **Community expat** (FB groups, Reddit r/rome) — rispondere con lo strumento
   gratis (guida, calcolatore, template 1590), mai con l'annuncio. La regola: essere
   la risposta più utile del thread.

---

## PARTE 7 — 90 giorni, concretamente

| Quando | Cosa | Perché ora |
|---|---|---|
| Sett. 1–2 | **Scommessa 2 live** (pagina bundle + catalogo) + partenza outreach università + SEO P0 | la finestra di settembre non aspetta |
| Sett. 3–4 | **Scommessa 1 live** (pacchetto dietro `/canone`, risparmio nel verdetto) + primo contenuto IT proprietari | l'asset è pronto al 90%, il canale IT parte prima possibile |
| Mese 2 | **Scommessa 3 pilota** sui proprietari in portafoglio + incentivo referral + verbale deposito (Scommessa 4a) | il ricorrente si semina quando il one-shot gira |
| Mese 3 | Numeri alla mano: raddoppiare sui vincenti, uccidere il resto; "1590 letter" EN; primo Rent Index se c'è respiro | il metodo È la cadenza |

**Le metriche che contano (una per riga, lette ogni lunedì):**
- checkout pagati / settimana, per servizio (Stripe);
- lead proprietari da `/canone` / settimana;
- mandati nuovi / mese (il numero del volano);
- recensioni Google cumulate;
- unità in gestione (da mese 2) — il ricavo ricorrente mensile che ne deriva.

---

## Chiusura — la frase da appendere al muro

BOOM non è un'agenzia con un bel sito: è **una fabbrica di servizi immobiliari a
costo marginale ~zero, English-first, con un monopolio tecnico sul concordato
romano e la fiducia come sistema**. Il gioco dei prossimi 90 giorni: monetizzare
la domanda che già arriva (settembre), usare gli strumenti gratis per conquistare
i proprietari, e trasformare i proprietari in rendita. Una scommessa alla volta,
una metrica alla volta, e il lunedì si decide col numero — non con l'entusiasmo.
