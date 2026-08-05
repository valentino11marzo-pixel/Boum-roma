# Studio nuovi servizi — Agosto 2026

**Domanda**: Deal Room sì o no, e quale NUOVO servizio ha davvero senso creare.
**Metodo**: catalogo reale (`api/_catalog.js` + pagine live), dati vendite dell'audit di luglio (194 sessioni Stripe), asset unici della piattaforma. Decisione, non brainstorming.

---

## 1. Deal Room (#19): il verdetto onesto è NO, non ora

L'idea (un deal, una schermata) è giusta **per un'agenzia con 15 deal simultanei**. Oggi BOOM ne ha 1-3 alla volta, e il lavoro vero del deal vive già in tre posti che funzionano:
- **Telegram** è la command room reale (card lead con WhatsApp, conferme visite, ⛔ firme, il Foglio di Chiamata del Regista alle 07:30);
- la **Dashboard "Oggi"** mostra visite, firme pendenti, urgenze;
- il **dettaglio contratto** è già la deal room del post-accettazione: funnel firme per persona, Fascicolo, Pack, Verbale, Share Hub.

Costruire ora una quarta superficie da ~1.500 righe che ricuce 6 collezioni = manutenzione perpetua per rivedere informazioni già a portata di pollice. È esattamente "fare troppo e di poca qualità".

**Cosa invece sì, quando serve**: una **striscia-timeline nel dettaglio contratto** (lead → visita → proposta → firma → prima rata, con date) — 50 righe, zero pagine nuove. Da fare quando i deal simultanei superano la soglia in cui la memoria non basta (≈8-10). Il task #19 resta in lista con questo scope ridotto.

---

## 2. La fotografia del catalogo (per non inventare doppioni)

**Inquilini (EN)**: Virtual Viewing €89 · Deal Assistance €249 · Contract Check €49 · Deposit Recovery €99+20% · Remote Move Pack €299 · Move-in Pack €149 (utenze) · Cleaning Premium · Concierge (WhatsApp).
**Proprietari (IT)**: Pacchetto Concordato €349 (alimentato dal calcolatore /canone) · Property Finding €350 · **Gestione con mandato** (owners.html: garanzia solvibilità nel mandato, fee annuale opzionale — la pagina esiste ed è forte) · Rendiconto mensile automatico (da oggi: è il *proof of work* della gestione).
**Canali**: referral con codice · università/aziende · one-tap buy dalle email del journey · motore recensioni.

**Cosa dicono i numeri (luglio)**: €7.732 in un mese, quasi tutto **pre-agreement** (la macchina contratti) e servizi **con un umano dietro** (PFS 22% conversione). I self-serve puri: 28 sessioni, 0 vendite. La lezione: *il catalogo non ha buchi di offerta — vende ciò che tocca un deal vero.* Aggiungere l'ennesimo prodotto-da-scaffale non è intelligenza, è rumore.

---

## 3. Il ragionamento: dove c'è domanda NON servita che tocca un deal vero

Ogni transazione d'affitto a Roma ha **un vincitore e N-1 perdenti**. BOOM monetizza solo il vincitore (contratto, servizi, gestione). I perdenti — decine per ogni buon bilocale — sono espati motivati, con urgenza, **già in cerca**… e nessuno vende loro nulla. Sono anche esattamente il pubblico di BOOM (EN-first, senza garante italiano, spaventati dalle truffe).

Gli asset unici già costruiti che nessun concorrente ha: **La Scheda con OCR** (identità che si compila da una foto), il **motore di underwriting** (score di rischio, oggi "elegante ma zero transabile" — parole dell'audit), **pdf-lib industriale** (certificati, fascicoli), **token derivati** per pagine di verifica pubbliche, **Stripe checkout** già cablato.

---

## 4. Le idee valutate

| Idea | Pull di mercato | Sforzo | Fit con gli asset | Verdetto |
|---|---|---|---|---|
| **A. BOOM Tenant Passport** — dossier inquilino verificato €49, pagato dall'INQUILINO, spendibile su QUALSIASI candidatura (anche non-BOOM) | Alto: il dolore n°1 di chi perde le case ("il proprietario ha scelto un altro") | Medio-basso: OCR+underwriting+PDF+verify page = tutto già in casa | Perfetto | **★ COSTRUIRE** |
| B. Voltura/subentro concierge | Reale | Basso | Buono | **Già esiste** (Move-in Pack €149) — semmai agganciarlo al giorno del verbale |
| C. Adeguamento ISTAT + repricing per proprietari | Medio | Basso (fiscal+canone engine) | Ottimo | Non standalone: è **retention della gestione** — dentro il rendiconto/T-90, non a listino |
| D. Magic Sign white-label per altre agenzie | Potenziale enorme | Alto (multi-tenant, supporto) | Ottimo | Parcheggiata: da riaprire quando la macchina ha 6 mesi di rodaggio interno |

---

## 5. La scelta: BOOM Tenant Passport (€49)

**Cos'è per il cliente**: carichi documento, prova di reddito/iscrizione università, referenze → BOOM verifica (OCR + motore di rischio + occhio umano ≤24h) → ricevi un **dossier PDF elegante e bilingue** con badge "Verified by BOOM", punteggio di affidabilità, sintesi redditi/garanzie, e un **QR di verifica** (pagina pubblica con token derivato: il proprietario scannerizza e vede che il dossier è autentico e non scaduto). Lo alleghi a ogni candidatura — Immobiliare, Idealista, gruppi Facebook — e smetti di essere "uno straniero senza garante" per diventare il candidato col dossier migliore della pila.

**Perché è la scelta intelligente**:
1. **Monetizza il lato perdente del mercato** — N-1 clienti per ogni casa, oggi a ricavo zero, con urgenza vera.
2. **Ogni acquirente è un lead caldissimo** con budget e documenti GIÀ verificati → pipeline PFS/listings gratis (il servizio si ripaga anche a margine zero).
3. **Sforzo contenuto, qualità alta**: intake = pattern /scheda (OCR incluso), scoring = underwriting engine che aspetta solo di diventare transabile, PDF = pdf-lib con `wa()`, verifica = token derivato come manageToken, incasso = service-checkout esistente.
4. **Difendibile**: il QR di verifica ha valore solo se emesso da qualcuno con reputazione — il brand fa da fossato.
5. EN-first, self-serve MA con tocco umano finale (la lezione di luglio: vende ciò che ha un umano dietro — qui l'umano c'è, 5 minuti a dossier).

**v1 concreta** (in ordine di build):
1. `tenant-passport.html` (EN, pattern Services 2.0) + voce catalogo `tenant-passport: €49` + ramo webhook.
2. Intake post-pagamento: pagina con token derivato (upload documento+reddito via pattern `profile/upload`, OCR).
3. `api/passport/build` (operatore, un tap): underwriting score + PDF dossier + QR → Storage; email al cliente col PDF.
4. `verify.html?t=` pubblica: "✓ Dossier autentico — emesso il X, valido 90gg" (mai i dati, solo la conferma).
5. Card in Telegram quando arriva un intake completo (approvazione = un tap, come tutto il resto).

**Prezzo**: €49 lancio (ancora sotto la soglia "ci penso"), €69 a regime. Validità 90 giorni, rinnovo €19.

---

## 6. Già coperto altrove — non toccare
Gestione proprietari (owners.html vende già il mandato con garanzia; il rendiconto da oggi è la demo mensile) · volture (Move-in Pack) · repricing (dentro gestione) · Deal Room (vedi §1).

*Studio del 2026-08-05.*
