# BOOM · Piano Operativo Agosto 2026

**Il documento di rotta per i 15–20 giorni di definizione (1–20 agosto).**

Questo è il momento in cui BOOM smette di essere "la divisione nata dentro
un'agenzia immobiliare pura" e diventa un'azienda con sistemi propri,
prodotti con un nome, e un metodo replicabile. L'obiettivo di questi giorni
non è costruire di più — è **decidere, chiudere, scrivere e lanciare**.

Il principio che guida tutto (e che non si negozia):

> **Portale e agenzia allo stesso livello.** Ogni casa su BOOM è verificata,
> vera, sincera. Il cliente paga volentieri perché il problema sparisce.
> Artigianale non vuol dire lento: vuol dire che niente esce senza cura.
> Non si diventa malati per i soldi — si diventa bravissimi a meritarli.

---

## 0 · Fotografia onesta — cosa esiste OGGI

Prima di pianificare, l'inventario. Questo è ciò che è **vivo in produzione**
adesso (112 pagine, ~40 endpoint API, 7 cron attivi):

### Sistemi core (live)

| Sistema | Cosa fa | Stato |
|---|---|---|
| **Sito + Discovery + Listing** | boomrome.com, /apartments, /listing/:id, hub Moving-to-Rome, blog cluster, /tour, GDPR Consent v2 | ✅ Live |
| **Portale admin** (`portal.html`) | CRUD completo, pipeline lead, contratti, dashboard, analytics, archivio documentale | ✅ Live |
| **3 portali ruolo** | owner-dashboard (proprietari), tenant (inquilini), client-portal (clienti PFS swipe) | ✅ Live |
| **Pre-Agreement suite** | Proposta d'affitto tokenizzata: crea → link → cliente si auto-compila → accetta → Stripe → email. Console admin con edit/duplica/revoca | ✅ Live |
| **Magic Sign** | Firma contratti via token (tenant+landlord), scrive tutto server-side: firma, RLI deadline, chiusura lead, bootstrap tenant | ✅ Live |
| **BOOM Pass** (Apple Wallet) | 4 tipi di pass: viewing, tenant, referral, landlord + pagina delivery | ✅ Live |
| **PFS Radar** | scan-inbox (IMAP alert Idealista/Immobiliare, */15min), scan-market, sync-searches, ingestione condivisa, scoring per cliente, push nello swipe deck, health + alert Telegram | ✅ Live |
| **Homie / Agent layer** | 17 tool HTTP (`api/agent/*`), modello tier 1 (auto) / tier 2 (approvazione), action queue, approvazioni via Telegram, activity log completo | ✅ Live |
| **Telegram wizard** | Bot pubblicazione annunci: publish/describe (AI bilingue)/upload foto | ✅ Live |
| **Saved-search alerts** | Salvataggio ricerche pubblico + matcher cron 3×/giorno con digest email e unsubscribe | ✅ Live |
| **Services 2.0** | Virtual Viewing €89, Deal Assistance €249, Property Finding €350, Concierge (WhatsApp) — pagine prodotto + Stripe checkout + webhook + email | ✅ Live |
| **Documenti** | Share tokenizzato per il commercialista (`share.html`), OCR AI (categoria, entità, CF, IBAN) | ✅ Live |
| **Motori fiscali** | `taxpack-engine.js` (cedolare, checklist, zip) + `fiscal-engine.js` (scadenze per immobile/contratto + società) | ✅ Live |
| **Daily Brief AI** | Briefing operativo giornaliero in italiano su Telegram (ultime 48h: annunci, match, outreach, salute fonti), cron 06:00 | ✅ Live |

### Cron attivi (il battito della macchina)

```
*/15  reminder-cron            promemoria email
*     telegram/notify-pending  approvazioni pendenti → Telegram (ogni minuto)
*/15  pfs/scan-inbox           radar da email alert (fonte load-bearing)
2×/h  pfs/scan-market          scraping best-effort
04:00 pfs/sync-searches        rigenerazione ricerche per cliente
06:00 pfs/brief                briefing AI su Telegram
3×/g  search/matcher           alert ricerche salvate
```

### Materiale campagna GIÀ scritto (in `docs/`)

- `university-outreach.md` — target list completa (JCU, AUR, LUISS, IES, CIEE, Temple, Loyola, Sapienza, Roma Tre, ESN…), offerta partner, template email
- `corporate-outreach.md` — FAO/WFP/IFAD, ambasciate, prezzi founding (€990 / €1.980, sconti volume), risk-reversal
- `owner-outreach.md` — acquisizione lato offerta (proprietari)
- `research-outreach.md`, `seo-conversion-audit.md`, `i18n-plan.md`, `meta-pixel.md`, `attribution.md`, `reviews.md`

**La lettura onesta:** la macchina operativa c'è, ed è oltre quello che ha
la stragrande maggioranza delle agenzie in Europa. Quello che manca non è
software: sono **decisioni prese, processi scritti e la campagna eseguita**.

---

## 1 · I cantieri aperti (da chiudere, non da ampliare)

Ereditati da `PROJECT-STATE.md` e `BOOM_STATUS.md` — in ordine di priorità:

1. **⚠️ Sicurezza: ruotare `STRIPE_WEBHOOK_SECRET`** — esposto in una
   sessione di chat (nota in BOOM_STATUS.md). 10 minuti, va fatto il giorno 1.
2. **Il bivio del redesign** — THE NEW GENERATION è pronta in preview:
   **Aurea** (flagship, oro raffinato), **Notturna** (noir tech), **Meridiana**
   (chiara, travertino). Sfondo ambient: Marmo/Guilloché/Meandro… Tutto
   verificato, zero errori JS. **Manca solo la tua decisione** — poi cutover
   di `/apartments` e `/listing/:id` sulle pagine nuove.
3. **Rifiniture roadmap detail/discovery** (post-cutover): ledger
   "money decoded" computato sul detail, compare come matrice analitica
   (€/m², winner chips), pavimento a11y+SEO (skip-links, JSON-LD, robots).
4. **PFS portal v1 non finito**: accesso passwordless `?pfs=TOKEN`, linea di
   progresso a 8 stadi, tab "PFS Clients" nell'admin (aperto da aprile).
5. **Flusso di pagamento reale mai validato in produzione** (il primo vero
   pagamento È il test — da monitorare consapevolmente, non da scoprire).
6. **Igiene repo**: ~30 pagine `preview-*.html` da archiviare/eliminare dopo
   la decisione design; `CLAUDE.md` non riflette più il sistema agent.

**Regola di agosto: nessun cantiere nuovo finché questi sei non sono chiusi.**

---

## 2 · La struttura dei 20 giorni

Quattro fasi. Ognuna produce un risultato **finito e scritto**, non "avviato".

> **⏰ Unica eccezione al sequenziale — le università NON aspettano la Fase 4.**
> Le decisioni per l'intake autunnale si prendono maggio–agosto (è scritto nel
> nostro stesso playbook). Le prime email agli uffici housing (JCU, AUR, IES,
> CIEE) partono **nei primi 3 giorni di agosto**, in parallelo a tutto il resto.
> Un'ora al giorno di follow-up, ogni giorno, per tutto il mese.

### FASE 1 — Chiudere (1–4 agosto) · "niente di nuovo, tutto finito"

- [ ] Giorno 1: rotazione Stripe webhook secret + giro completo env vars Vercel
- [ ] Giorno 1: **email università batch 1** (JCU, AUR, IES, CIEE, Temple — template già pronto)
- [ ] Giorni 1–2: **la decisione design** — mezza giornata su telefono e desktop
      con Aurea/Notturna/Meridiana + sfondi; si sceglie e non si riapre
- [ ] Giorni 2–3: cutover pagine prodotto su rotte live + smoke test completo
      (discovery→detail→apply→pre-agreement→Stripe test)
- [ ] Giorno 3: email università batch 2 (LUISS, Sapienza, Roma Tre, ESN, scuole di lingua)
- [ ] Giorno 4: pruning preview + aggiornamento CLAUDE.md/PROJECT-STATE.md
      (il repo deve raccontare la verità a settembre)

**Risultato Fase 1:** produzione allineata alla visione, zero debiti di
sicurezza, università già in moto.

### FASE 2 — Definire (5–9 agosto) · il Manuale Operativo BOOM

Il cuore del tuo obiettivo ("definire bene tutti i sistemi operativi").
Per ogni processo si scrive UNA pagina: **trigger → passi → chi/cosa agisce
(tu, Homie tier 1, Homie tier 2 con approvazione) → dove vive → SLA → cosa
può andare storto**. Non prosa: checklist eseguibili. Diventa
`docs/manuale-operativo.md` — la base per formare chiunque, a Roma o altrove.

I 9 processi da scrivere (uno-due al giorno):

1. **Lead in ingresso** (web apply / Homie / WhatsApp / radar) → qualifica → risposta < 2h lavorative
2. **Viewing** (fisico + Virtual Viewing €89) → pass Wallet → follow-up
3. **Deal** — lead → pre-agreement (console, link, edit terms) → acconto Stripe
4. **Contratto e firma** — portale → Magic Sign → RLI → bootstrap tenant portal
5. **Onboarding casa nuova** (lato proprietario): verifica di persona, foto, wizard Telegram, pubblicazione — **la checklist "verificato BOOM" scritta nero su bianco** (questo È il brand)
6. **PFS end-to-end** — pagamento → intake → radar → swipe → shortlist → chiusura
7. **Fiscale/adempimenti** — motori taxpack+fiscal, condivisione commercialista, scadenze
8. **Manutenzioni e tenant care** (tenant portal → maintenance)
9. **Rituali della macchina**: cosa controlli ogni mattina (daily brief 06:00, needsAttention, action queue), cosa settimanalmente (health fonti, pipeline review)

- [ ] Bonus della fase (unico sviluppo ammesso): chiudere **PFS portal v1**
      (cantiere #4) — serve al processo 6 e sblocca l'esperienza cliente pagante

**Risultato Fase 2:** il "sistema operativo" di BOOM esiste su carta come
esiste nel codice. Chiunque potrebbe operare la macchina leggendolo.

### FASE 3 — Il Playbook Città (10–13 agosto) · replicabilità autentica

La domanda: **cosa serve davvero per aprire BOOM in una seconda città senza
tradire l'artigianalità?** Si scrive `docs/playbook-citta.md`:

- **Audit Roma-specifico vs universale**: i motori (radar, agent, pre-agreement,
  Magic Sign, fiscale, pass) sono già città-agnostici; sono Roma-specifici le
  zone hard-coded, le pagine `apartment_*`, il blog, i playbook paese.
  Elenco preciso di cosa si parametrizza.
- **I requisiti minimi di apertura** (proposta da validare): 10–15 case
  verificate di persona prima del lancio · 1 persona locale formata sul
  Manuale Operativo · pagine zona + discovery configurata · radar attivo sui
  portali locali · convenzione con 2–3 università/istituzioni locali ·
  fiscale: identico in Italia, da studiare per l'estero.
- **La sequenza**: supply prima della domanda, sempre (senza case verificate
  non c'è BOOM — vale a Roma e varrà ovunque).
- **Il test di autenticità**: se una scelta di espansione richiede di
  pubblicare case non viste, la risposta è no. Scritto nel playbook.
- [ ] Scegliere le 2–3 città candidate e fare solo desk research (domanda
      studenti/expat, portali attivi, concorrenza) — **la decisione su quando
      si apre NON si prende ad agosto**; si prende quando Roma gira da sola
      col manuale.

**Risultato Fase 3:** l'espansione smette di essere un sogno e diventa una
checklist con prerequisiti misurabili.

### FASE 4 — Campagna e Brand (14–20 agosto) · settembre si prepara ad agosto

Settembre a Roma = il picco assoluto (studenti, ricercatori, corporate).
Tutto quello che si lancia qui deve essere **in aria entro il 25 agosto**.

**Campagna clienti:**
- [ ] Follow-up università (le email partite in Fase 1 ora si coltivano:
      call, materiale partner, pagina dedicata `/universities` se serve)
- [ ] Corporate batch 1: FAO/WFP/IFAD + 3 ambasciate — email col
      risk-reversal ("paghi solo alle chiavi in mano") da `corporate-outreach.md`
- [ ] Proprietari (il lato offerta è metà del business): eseguire
      `owner-outreach.md` — target self-listing su Immobiliare/Idealista,
      ex-host Airbnb in fuga dalle regole short-let
- [ ] Attribution + Meta Pixel attivi sulle pagine servizio (docs già pronti)
- [ ] Recensioni: sistema di raccolta post-firma (da `reviews.md`)

**Brand → prodotti con un nome.** Hai ragione: il brand è forte ma i prodotti
vanno **nominati e resi visibili**. Non serve costruire nulla — serve dare
un nome pubblico a ciò che già esiste e che nessun'altra agenzia ha:

| Prodotto (nome proposto) | Cos'è già oggi | Perché è primo-al-mondo (per un'agenzia) |
|---|---|---|
| **BOOM Verified** | La checklist di verifica di persona (Fase 2, processo 5) | La promessa centrale, resa esplicita e mostrata su ogni listing |
| **Magic Sign** | Firma contratti tokenizzata | Firma in 2 minuti dal telefono, senza account |
| **BOOM Proposal** | Pre-agreement suite | Proposta legale self-service con acconto integrato |
| **BOOM Pass** | Apple Wallet passes | La chiave del rapporto nel telefono del cliente |
| **Radar** | PFS radar + swipe deck | Il mercato scandagliato ogni 15 minuti per ogni cliente |
| **Homie** | Agent layer tier 1/2 | L'operatività assistita da AI con controllo umano |
| **TaxPack** | Motori fiscali | La cedolare e le scadenze gestite, non subite |

- [ ] Una pagina `/method` (o sezione in /how-it-works) che racconta i
      prodotti col loro nome — il "sistema BOOM" come motivo per scegliere noi
- [ ] Giorni 19–20: **buffer + retrospettiva** — cosa è slittato, aggiornare
      questo documento, scrivere il piano di settembre (una pagina, non venti)

**Risultato Fase 4:** campagna in volo prima del rientro, brand che parla
per prodotti e non per aggettivi.

---

## 3 · Metriche (poche, vere)

Da guardare ogni lunedì, non ogni ora:

- **North Star: deal chiusi/mese** e **tempo mediano lead→firma**
- **Supply: nuove case verificate/mese** (senza questa, tutto il resto è vetrina)
- **Pipeline: lead qualificati/settimana** per fonte (web, radar, Homie, referral)
- **Partner: convenzioni università/corporate attive** (target: 5–6 uffici + 3 logo corporate entro dicembre)
- **Qualità: % deal senza problemi post-firma** — la metrica dell'artigianalità

Il daily brief delle 06:00 già compatta le 48h; le metriche settimanali si
leggono dal portale. Nessuna dashboard nuova ad agosto.

---

## 4 · Le regole d'oro del mese

1. **Chiudere batte iniziare.** Ogni giorno la domanda è "cosa ho finito?",
   non "cosa ho avviato?"
2. **Una decisione al giorno.** Le decisioni di rotta (design, città, prezzi)
   si prendono in fretta e per iscritto — la reversibilità è già nel sistema.
3. **Le università non aspettano.** Un'ora al giorno, ogni giorno, da giorno 1.
4. **Nessun sistema nuovo** salvo PFS portal v1. Se ad agosto viene un'idea
   nuova, si scrive in fondo a questo file e si rilegge il 1° settembre.
5. **La verifica di persona non si delega e non si salta.** Mai. È il prodotto.
6. **Scrivere tutto come se domani dovessi formare qualcuno.** Perché è
   esattamente quello che il playbook città richiederà.

---

## 5 · Parcheggio idee (scrivile qui, riaprile a settembre)

- …

---

*Documento creato il 14 luglio 2026 sul branch `claude/boum-operational-planning-i1fi2m`.
Fonti: stato reale del repo (112 pagine, ~40 API, 7 cron), `PROJECT-STATE.md`,
`BOOM_STATUS.md`, `docs/*-outreach.md`. Da aggiornare a fine agosto con la retrospettiva.*
