# BOOM Roma — la mappa

BOOM gestisce affitti a Roma per EGIDI IMMOBILIARE S.R.L.: sito pubblico
(https://www.boomrome.com), portali per inquilini e proprietari, console
dell'operatore, automazioni sul server e un Mac mini che lavora su WhatsApp e
sui portali. BOOM è solo agenzia, senza subaffitto: canoni e depositi che
passano da Stripe sono soldi dei proprietari, non ricavi.

Questo file è la MAPPA. Il dettaglio e la storia di ogni area sono in
`docs/aree/` (indice al §4): leggi il file dell'area PRIMA di toccarla.
Il file resta sotto le 300 righe e qui non si aggiunge storia
(`tests/contesto` lo verifica).

## 1 · Prima di ogni lavoro: `ORA.md`

`ORA.md` dice cosa si fa adesso, chi costruisce e cosa non si fa. Vince su
tutto: su questo file, su `AGENTS.md`, sugli studi `STUDIO_*.md` e sui prompt
in `docs/PROMPT_*.md`.

- La richiesta è in `ORA.md` → procedi.
- Non c'è → **fermati prima di scrivere codice.** Dillo in una riga e chiedi a
  Valentino se entra e cosa esce per farle spazio. Un'idea nuova va nella
  coda di `ORA.md`, non nel codice.
- Sempre ammesso: un guasto in produzione sul binario dei soldi (§3) o
  qualunque cosa che blocchi un cliente pagante.
- Al massimo 2 rami di lavoro aperti in tutto il repo; un ramo tocca un'area.
- Mai unire una PR prima che la CI sia verde (dura circa 16 minuti).
- Un obiettivo per sessione. Una sessione lunghissima lavora peggio: si
  chiude e se ne apre una nuova.
- Il lunedì il resoconto si chiede con `/lunedi` (`.claude/skills/lunedi`).

## 2 · Il sistema in una schermata

| Pezzo | Dove | Nota |
|---|---|---|
| Sito, portali, console | `*.html` nella radice (146 pagine) | HTML/CSS/JS senza build; Firebase da CDN |
| Logica condivisa | `js/*-engine.js` e gli altri `js/*.js` | motori puri UMD, usati da browser e da `api/`, testati |
| Server | `api/**` (Vercel Functions, Node ESM) | Firestore è l'UNICA verità |
| Firestore dal server | `api/homie/_lib.js` (`fsGet`, `fsPatch`, `fsCreate`, `fsList`, `fsCommit`…) | id deterministici per l'idempotenza |
| Modelli AI | `api/_ai.js` + `js/ai-registry.js` | mai una `fetch` diretta ad Anthropic |
| Cron | `vercel.json` (31, tre ogni minuto) | ogni cron scrive un battito di salute |
| Regole | `firestore.rules`, `storage.rules` | deployate dal job `deploy-rules` della CI |
| Mac mini | `bot/`, `homie-bridge/` | Homie (WhatsApp), bot Telegram, scout, contatto, postino, publisher, modello locale |
| Test | `tests/` (`npm test`) | §6 |

## 3 · Il binario dei soldi: il cuore, va protetto prima di tutto

Contatto → visita → proposta pagata → contratto → firma → registrazione →
incasso. Tutto il resto è contorno.

1. **Contatti**: portali via email (`api/leads/scan-inbox.js`), WhatsApp via
   Homie (`api/homie/message.js`), sito (`api/apply-lead.js`); voto
   (`api/leads/brain.js`) e card Telegram (`api/telegram/notify-pending.js`).
2. **Visite**: `book.html` e `api/viewings/*`; la griglia degli orari è UNA
   (`api/viewings/_avail.js`).
3. **Proposta**: console `pre-agreement-admin.html`, pagina del cliente
   `pre-agreement.html`, `api/preagreement/*`; il pagamento arriva da
   `api/stripe-webhook.js`.
4. **Contratto**: `api/preagreement/convert.js`; impaginato
   `js/contract-pdf.js`; campi `js/contract-fields.js`; anagrafica
   `scheda.html` + `api/profile/*`.
5. **Firma**: `sign.html`, `api/magic-sign/*`, `api/sign/*` (la chiusura è
   `api/sign/_finalize.js`).
6. **Registrazione**: `api/fiscal/*` (iter ASPI, fascicolo, scheda ARPE).
7. **Incasso dei canoni**: `api/payments/*`, `/casa` (`tenant.html`),
   motore `js/rent-engine.js`.
8. **Console dell'operatore**: `portal.html` + `js/portal-app.js` (31.000
   righe: si cerca la funzione, non si legge il file), schermata Oggi.

Ricavi BOOM = provvigioni, servizi e commissioni. Mai sommarci canoni e
depositi dei proprietari.

## 4 · Indice delle aree

| Area | Leggi prima | Codice principale |
|---|---|---|
| Stack, struttura, deploy, variabili d'ambiente, CI, guasti di classe, convenzioni | `docs/aree/infrastruttura.md` | `vercel.json`, `.github/workflows/ci.yml`, `api/_*.js` |
| Proposte e lucchetto sull'immobile | `docs/aree/proposte.md` | `api/preagreement/*`, `pre-agreement*.html` |
| Contratti: Scheda, dizionario, modelli A/B/C, revisione | `docs/aree/contratti.md` | `js/contract-pdf.js`, `js/contract-fields.js`, `api/profile/*`, `api/contracts/*` |
| Firma e mandati | `docs/aree/firma.md` | `api/magic-sign/*`, `api/sign/*`, `sign.html` |
| Pagamenti e canoni | `docs/aree/pagamenti.md` | `api/payments/*`, `api/stripe-webhook.js` |
| Fisco, ASPI, rendiconto, banca | `docs/aree/fiscale.md` | `api/fiscal/*`, `api/owners/*`, `api/banking/*` |
| Inquilino: /casa, journey, verbale, inventario | `docs/aree/inquilino.md` | `tenant.html`, `api/journey/*`, `api/contracts/*` |
| Lead e WhatsApp | `docs/aree/lead-whatsapp.md` | `api/leads/*`, `api/homie/*` |
| Squadra, scala della fiducia, Segretaria (Oggi) | `docs/aree/segretaria-squadra.md` | `api/segretaria/*`, `api/employees/*`, `js/segretaria*.js` |
| Visite e Regista | `docs/aree/visite.md` | `api/viewings/*`, `api/regista/*`, `book.html` |
| Telefono | `docs/aree/telefono.md` | `api/phone/*`, `chiamate.html` |
| Catalogo, bot Telegram, disponibilità, foto | `docs/aree/catalogo.md` | `api/wizard/*`, `js/dispo-engine.js`, `bot/boom_listing_wizard.py` |
| Sito pubblico e SEO | `docs/aree/sito.md` | pagine pubbliche, `tests/seo/` |
| PFS e mercato | `docs/aree/pfs-radar.md` | `api/pfs/*`, `api/market/*`, `api/radar/*` |
| AI e documenti | `docs/aree/ai-documenti.md` | `api/_ai.js`, `api/portal/ingest.js`, `api/scrivano/*`, `api/documents/*` |
| Portal e portali | `docs/aree/portal.md` | `portal.html`, `js/portal-*.js`, `js/boom-portal.js`, `login.html` |

Il riordino dei rami del 12/10/2026 è in `docs/TRIAGE_2026-10-12.md`.

## 5 · Regole che non si violano

Ognuna è nata da un guasto vero; il racconto è nel file d'area.

1. **Mai inventare.** Un dato ambiguo è «non lo so», mai un fatto finto: né
   in una pagina, né in un'email, né in un PDF.
2. **Firestore solo da `api/homie/_lib.js`.** Una collection nuova vuole la
   sua regola in `firestore.rules` (dimenticata sei volte: `tests/guasti` la
   cerca); un prefisso Storage nuovo, la sua in `storage.rules`.
3. **Nessuna scrittura dopo la risposta.** Ogni `fsPatch/fsCreate/…` si
   attende prima di `res.json`: Vercel congela la funzione e la scrittura
   muore in volo.
4. **Modelli solo da `api/_ai.js`**, con lo scopo in `js/ai-registry.js`;
   il JSON di un modello si legge con `api/_modeljson.js`; ogni chiamata
   esterna ha un tetto di tempo (`api/_budget.js`); nei log va la forma,
   mai il contenuto (passano CF, IBAN e documenti veri).
5. **Dipendenze.** Un pacchetto usato da `api/**` va in `api/package.json` E
   in `package.json` (più il lockfile), con import statico in cima al file:
   un `await import()` non viene impacchettato da Vercel.
6. **`vercel.json`**: al massimo 50 regole `functions` (oggi 49); si
   raggruppa con glob esatti, mai una regola in più a caso
   (`tests/vercel-functions`).
7. **URL dati a servizi esterni**: sempre `https://www.boomrome.com`; l'apex
   reindirizza e webhook e tool non seguono il redirect.
8. **Best-effort dichiarato.** Un anello secondario (AI, Telegram, email,
   allegato) che fallisce non perde mai il dato primario: il dato si salva
   comunque, con scritto cosa manca.
9. **Prezzo e trattativa** non si delegano a un modello. Serve approvazione
   umana su ciò che non è provato, e ogni autonomia ha interruttore,
   escalation e idempotenza.
10. **PDF, numeri e date.** Testi dei PDF passati da `wa()` di
    `api/_pdfbrand.js`; numeri all'italiana formattati a mano (mai
    `toLocaleString`, che cambia formato su runtime ridotti); date di Roma da
    componenti numeriche (mai il mese testuale di `Intl`).
11. **Safari.** Niente `await` sul percorso di avvio di una pagina;
    `localStorage` sempre in try/catch; `-webkit-backdrop-filter` accanto a
    `backdrop-filter`. Il login è uno solo: `/login?next=<pagina>`.
12. **Marchio.** Fondo scuro; oro `#D4AF37` nel portal, `#FFD700` sul sito
    nuovo (`css/boom-2026.css`); Helvetica Neue 300 con Inter di riserva.

## 6 · Test e CI

- `npm test` esegue tutte le suite (`tests/run-all.mjs`); `npm test -- money
  firma` solo quelle nominate. Una suite nuova si registra in
  `tests/run-all.mjs`.
- Nessun framework: ogni suite guida il handler VERO con un Firestore in
  memoria e finge solo la rete o il browser. Le regole delicate si provano
  per mutazione: rimetti il difetto, il test deve cadere. Un test non si
  salta, non si disabilita, non si allenta.
- Le suite col browser usano Chromium (`tests/_browser.mjs`); dove manca
  dicono SKIP invece di fallire.
- CI in `.github/workflows/ci.yml`: i test (circa 16 minuti) e `deploy-rules`
  (regole Firestore e Storage con credenziale federata). Dettagli in
  `docs/aree/infrastruttura.md`.

## 7 · Deploy

- Push su `main` = deploy di produzione su Vercel (nessun build,
  `outputDirectory: "."`); ogni ramo ha la sua anteprima.
- Le PR le unisce Valentino, e solo con la CI verde.
- Variabili d'ambiente: elenco completo in `docs/aree/infrastruttura.md`.

## 8 · Dove si scrive la documentazione

- Un cambiamento di comportamento = 3-8 righe nel file d'area di
  `docs/aree/`: cos'era, cosa cambia, dove sta il test. Mai qui.
- Un'area nuova = un file nuovo in `docs/aree/` più una riga nell'indice §4
  (`tests/contesto` controlla che indice e cartella coincidano).
- Niente studi, audit o piani nuovi senza una voce in `ORA.md`.
