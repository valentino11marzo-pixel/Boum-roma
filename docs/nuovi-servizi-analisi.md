# BOOM · Nuovi servizi — analisi di portafoglio (approfondimento)

**Data:** 2026-08-02 · **Cosa è:** l'approfondimento operativo della Parte 5 di
`docs/strategia-servizi-digitali.md`. Le Scommesse 1 e 2 sono **LIVE da oggi**
(`/pacchetto-concordato` e `/remote-move-pack`); questo file analizza — candidata
per candidata — cosa viene dopo, con i 5 filtri (ricerca attiva · asset in casa ·
prezzo · distribuzione organica · consegna automatica, 1–5 ciascuno, soglia ~18/25),
il disegno di consegna sugli asset ESISTENTI e il verdetto. Il no motivato vale
quanto il sì: metà del valore di questo file sono le idee scartate.

---

## 1 · L'architettura dei prezzi (la scala, resa esplicita)

La regola: **ogni gradino accredita sul successivo**, così nessun acquisto è mai
un vicolo cieco e il cliente sale da solo.

| Gradino | Prezzo | Prodotti | Funzione |
|---|---|---|---|
| Gratis d'élite | €0 | `/canone`, Welcome to Rome, (futura) 1590 letter | fiducia + lead. MAI un PDF acchiappa-email: strumenti veri |
| Esca | €49–99 | Contract Check €49 (→ scala su DA), Virtual Viewing €89 (→ fee), Deposit Recovery €99 (+20% successo), (futuro) Verbale €79 | prima transazione, rischio ~zero per il cliente |
| Core | €249–449 | Deal Assistance €249, **Remote Move Pack €299**, PFS €350, **Pacchetto Concordato €349** | il margine vero; ognuno accredita su fee/gestione |
| Ricorrente | 6% o €69/mese | BOOM Gestione (Scommessa 3, mese 2) | il valore terminale; ogni unità = mandato in esclusiva |

Due regole di igiene: (a) mai due prodotti che rispondono alla stessa ricerca allo
stesso prezzo — si cannibalizzano in SERP prima che in cassa; (b) il gradino
gratis deve essere così buono da sembrare "troppo" — è il costo di acquisizione,
non un prodotto monco.

---

## 2 · Le candidate, una per una

### 2.1 Verbale di Consegna fotografico — €79 · verdetto: **FARE (mese 2)** · 21/25
- **Il dolore:** quasi ogni lite sul deposito nasce dall'assenza di uno stato di
  consegna documentato. Sia il proprietario che l'inquilino lo vogliono — DOPO,
  quando è tardi.
- **Consegna con gli asset di casa:** form guidato (stanza per stanza) + upload
  foto → PDF con firma typed di entrambe le parti (pdf-lib + Storage + il pattern
  firma di Magic Sign, tutto già nel repo), conservato nel fascicolo del
  contratto. Per i contratti BOOM diventa **standard incluso** (argomento di
  vendita per la gestione); standalone per chi affitta per conto suo.
- **Distribuzione:** SEO IT ("verbale di consegna immobile fac simile" — ricerca
  costante) + EN dentro il contenuto deposito; e ogni verbale porta il logo BOOM
  in casa di un proprietario non-cliente.
- **Attenzione:** il valore è la PROVA, quindi il PDF deve avere hash + timestamp
  (già sappiamo farlo — certificato FES).

### 2.2 The 1590 Letter — gratis · verdetto: **FARE (mese 2, 2 giorni)** · magnet
- **Cosa:** generatore della lettera di messa in mora ex art. 1590 c.c. —
  compili nome/indirizzo/importi/date, esce il PDF in italiano legale corretto +
  la guida su PEC/raccomandata. In inglese l'interfaccia, in italiano la lettera:
  esattamente il ponte che l'expat non sa costruire.
- **Perché:** "landlord won't return deposit Italy" è una ricerca disperata,
  costante, senza un buon risultato. Chi scarica e non ce la fa da solo → Deposit
  Recovery €99 (upsell naturale, dichiarato nella pagina). È il gemello EN di
  `/canone`: strumento vero, gratis, che vende il servizio dietro.
- **Asset:** template + pdf-lib; un pomeriggio di lavoro legale sul testo (farlo
  rivedere) + un giorno di pagina.

### 2.3 Exit Airbnb / Riconversione a medio termine — €249 audit · verdetto: **TESTARE col contenuto prima** · ~20/25
- **Il timing:** la stretta sul breve (CIN, regole keybox, controlli) + stagioni
  corte spingono host romani fuori dal breve. Il medio termine arredato per
  internazionali è ESATTAMENTE il prodotto BOOM.
- **Consegna:** audit di rendimento (asking veri dal radar PFS + fasce concordato
  come pavimento fiscale + occupancy realistica) → piano: contratto giusto
  (transitorio/3+2), foto (photo lab), pricing → sbocco naturale nella gestione.
- **Il test prima del prodotto:** UN contenuto IT ("Conviene ancora Airbnb a
  Roma? I numeri 2026 del medio termine") + lead form. Se in 30 giorni porta
  ≥10 lead proprietari, la pagina prodotto si costruisce; sennò era una tesi.
- **Perché non subito:** la ricerca attiva è meno formata ("exit airbnb" non si
  googla — si googla il dolore: "regole affitti brevi roma 2026"). Serve il
  contenuto-ponte, che è comunque un asset SEO da avere.

### 2.4 Rome Rent Index — gratis, trimestrale · verdetto: **DOPO (quando 1–3 girano)** · brand
- I dati ci sono già (il radar PFS raccoglie asking di mercato; il motore
  concordato dà le fasce legali per zona): un report trimestrale "quanto costa
  affittare a Roma, zona per zona — e quanto SI PUÒ chiedere legalmente" è
  materiale che i giornali riprendono. Ritorno in link e autorità, non in cassa:
  farlo quando c'è respiro, MAI al posto di un prodotto che incassa.

### 2.5 BOOM Verified Tenant / RentPass — gratis · verdetto: **DENTRO il funnel, non prodotto** 
- Profilo inquilino pre-verificato riusabile (documenti già parsati da
  `parse-docs`, reddito dichiarato, referenze) che velocizza ogni application.
- **Perché non venderlo ai proprietari come report:** GDPR delicatissimo (dati di
  terzi trattati su richiesta di chi non è l'interessato) + incentivi storti. Il
  valore giusto: accelera i deal BOOM ("il tuo dossier è pronto, applichi in un
  tap") ed è un argomento per i mandati ("ti porto inquilini già verificati").
  Costruirlo quando il volume di application lo giustifica.

### 2.6 Codice Fiscale Express — €49 · verdetto: **CANDIDATA FORTE (mese 2–3, pagina singola)** · ~20/25
- "Codice fiscale for foreigners" ha volume di ricerca costante e NESSUN player
  commerciale credibile in inglese; la delivery è nota (delega + AA4/8, già
  dentro Concierge come task). Una pagina singola EN, €49 done-for-you remoto,
  consegna in giorni.
- **Il vero valore:** è il PRIMO contatto dell'expat con l'Italia, spesso mesi
  prima della ricerca casa — chi lo compra entra nel journey BOOM prima di
  qualunque concorrente. Il €49 è acquisizione pagata DAL cliente.
- **Attenzione:** non far collassare Concierge (che resta il "tutto fatto" da
  €390): la pagina CF cita Concierge come upgrade, mai il contrario.

### 2.7 Utilities Switch standalone — €99 · verdetto: **NO**
- Mercato affollato di comparatori con CAC industriale; il valore per BOOM è
  DENTRO il journey (movein-pack €149 al T-14, dove il cliente già si fida).
  Una pagina standalone competerebbe con Selectra/Switcho senza vantaggio.

### 2.8 Garanzia affitto (modello Garantme) — verdetto: **NO in proprio · PARTNER se emerge**
- Prodotto assicurativo/finanziario: riserve, IVASS, capitale. Fuori scala per
  BOOM oggi. Se un player italiano apre un programma partner, la DISTRIBUZIONE
  (i nostri inquilini internazionali senza garante italiano) vale oro — tenere
  l'orecchio aperto, non costruire.

### 2.9 Deposito in escrow — verdetto: **NO (regolato)**
- Custodire denaro di terzi = servizi di pagamento. La versione BOOM-compatibile
  già esiste: deposito tracciato nel contratto + verbale di consegna + interessi
  annuali (già nel contratto studenti). Il resto è rischio normativo senza fee
  che lo giustifichi.

### 2.10 Relocation B2B — verdetto: **DOPO, con criterio d'ingresso esplicito**
- Si attiva quando: 2–3 aziende arrivate ORGANICHE (non cercate) + 1 caso studio
  scritto. Allora `docs/corporate-outreach.md` diventa una campagna con un
  retainer (es. €1.500/anno + fee per pratica). Prima è distrazione dal B2C che
  già converte.

### 2.11 BOOM OS white-label — verdetto: **ORIZZONTE, criterio numerico**
- Il pitch vero è "lo usiamo noi su N contratti/anno": serve l'N. Rivalutare a
  fine anno con i numeri della gestione. Nel frattempo ogni pezzo costruito per
  BOOM (visite, firma, RLI pack, solleciti) è già il prodotto.

### 2.12 Annuncio Perfetto per il fai-da-te — €99–149 · verdetto: **PARCHEGGIO**
- Foto migliorate (photo lab) + copy AI + check concordato per il proprietario
  che vuole affittare da solo. Il conflitto: aiutare il DIY cannibalizza i
  mandati. L'unica versione sensata è il **lead magnet parziale** (audit foto
  gratis → "oppure facciamo tutto noi"), da testare dentro l'outreach owners,
  non come prodotto a listino.

---

## 3 · Il calendario delle finestre (quando spingere cosa)

| Periodo | Finestra | Prodotti da spingere |
|---|---|---|
| Ago–Set | arrivi studenti/expat (il picco) | **Remote Move Pack**, PFS, Virtual Viewing; outreach università GIÀ scritto |
| Ott–Nov | uscite e disdette; rinnovi | Deposit Recovery + 1590 letter (lato uscite), Verbale (nuovi ingressi), Concordato per chi ri-affitta |
| Gen–Feb | secondo intake universitario; si pensa alle tasse | Remote Move Pack (spring semester), contenuto concordato/cedolare (dichiarazioni in vista) |
| Mar–Giu | i proprietari decidono la stagione | **Pacchetto Concordato**, BOOM Gestione, Exit-Airbnb |
| Giu–Lug | pre-season mandati | owners outreach + valutazioni |

Il ciclo del lunedì resta il metronomo: la stagione suggerisce, il numero decide.

---

## 4 · Le regole d'oro del NO (ricavate dalle scartate)

1. **Regolato = partner, mai in proprio** (assicurazioni, escrow, credito).
2. **Logistica fisica pesante = no** (traslochi, arredi): il moat è il software,
   non i furgoni.
3. **Se devi educare il mercato, stai pagando tu la distribuzione** — si vende
   solo dove la ricerca esiste già.
4. **Occhio a ciò che cannibalizza i mandati:** aiutare il fai-da-te del
   proprietario è concorrenza a sé stessi travestita da fatturato.
5. **Dati di terzi venduti a terzi = campo minato GDPR:** il valore dello
   screening vive dentro i NOSTRI deal.

---

## 5 · Come si misurano le due appena lanciate

Il funnel GA4 è cablato su entrambe (`view_item → begin_checkout →
add_payment_info → purchase`, item `svc_remote_move_pack` / `svc_concordato_pack`);
il webhook scrive i lead `svc_<sessione>` con `kind`, quindi la riga del lunedì è
una query. Soglie oneste per il verdetto a 30 giorni:

| Prodotto | Segnale minimo (30gg) | Se sotto soglia |
|---|---|---|
| Remote Move Pack | ≥3 checkout O ≥10 begin_checkout | il problema è il traffico → spingere via università/community, non toccare la pagina |
| Pacchetto Concordato | ≥2 checkout O ≥15 lead `/canone` con click sul CTA | guardare DOVE si ferma il funnel: verdetto→pagina (copy) o pagina→pagamento (prezzo/fiducia) |

Diagnosi prima della cura: zero traffico e zero vendite sono DUE malattie diverse.

---

## 6 · Le prossime tre mosse (dopo le due live)

1. **1590 Letter** (2 giorni) — accende il motore organico EN del deposito, il
   nostro dolore più cercato.
2. **Verbale di Consegna** (2 giorni) — €79 standalone + standard nei contratti
   BOOM: prevenzione che si vende da sola due volte.
3. **Contenuto Exit-Airbnb** (1 giorno) — il test da 30 giorni che decide se il
   prodotto di riconversione esiste.

Poi, come da strategia: **BOOM Gestione** in pilota sui proprietari già in
portafoglio — il ricorrente è la destinazione di tutto il resto.
