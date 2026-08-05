# STUDIO — BOOM AUTONOMA · v2
### Riscritto dopo l'obiezione dell'operatore. Formato: decisioni, non opzioni.

*Agosto 2026. La v1 presentava alternative; questa DECIDE. Ogni "esiste già"
è verificato nel repo. La tappa 1 non è più un piano: è costruita e testata
(vedi §3).*

---

## 1 · L'obiezione, accolta: gli alert email NON bastano

La domanda era: *"davvero il modo migliore è impostare alert email e leggerli
in automatico?"* Risposta onesta: **no, da soli no** — e il motivo è
strutturale, non di gusto.

Un alert email racconta le **nascite** (è il portale che ti annuncia un
annuncio nuovo). Non racconterà **mai le morti** — e le morti sono metà del
valore: un annuncio che sparisce è (proxy) un affitto concluso, e da lì
vengono i **giorni di assorbimento per zona**, il dato che trasforma "il tuo
prezzo è alto" in *"a questo prezzo in zona si affitta in 12 giorni; il tuo è
fermo da 30"*.

L'architettura decisa copre il **ciclo di vita intero**:

| Fase | Fonte | Perché questa fonte |
|---|---|---|
| **Nascite** | Alert email + occhi di Homie + scan (porte ESISTENTI) | Il portale te le annuncia da solo; gratis, senza guerra di scraping |
| **Vita** | Ri-avvistamenti dalle stesse porte | Bump di "ancora vivo", storia prezzi, ribassi dei competitor |
| **Morte** | **Verifiche attive via il Mac di Homie** (IP residenziale, browser vero) | I portali 403-ano gli IP datacenter; il Mac no. Con la regola che regge tutto: **un blocco non è una morte** — un 403 è "non so", mai "affittato" |
| **Verità** | I canoni **firmati** nostri | Il dato che Casafari non avrà mai: chiesto vs ottenuto |

Il tuo motto vale qui alla lettera: la parte *semplice* (leggere email) era
già in piedi; la parte *non facile* — il ciclo di vita, il verdetto di morte
che non si fa ingannare dai blocchi, l'onestà del campione — è esattamente
ciò che è stato costruito.

---

## 2 · Le decisioni

- **D1 — Niente censimento totale.** Il "tutto il portale" è il gioco di
  Casafari (flotte di proxy). Il nostro: ciclo di vita **completo** del
  sottoinsieme rilevante — ogni annuncio che le nostre porte vedono nelle
  zone dove operiamo. Bounded, robusto, senza guerra.
- **D2 — Un libro mastro, una porta.** `marketListings`, stesso spazio di id
  di `pfsProperties` (sha1 dell'URL): un annuncio è lo stesso annuncio nei
  due mondi. Ogni fonte passa dallo stesso fold puro → le regole valgono per
  tutte insieme.
- **D3 — Il verdetto di morte lo dà il server, mai il Mac.** Homie riporta
  fatti (status HTTP, marker della pagina); la decisione sta nel motore,
  dove "403 ≠ morte" è asserito per mutazione.
- **D4 — Sotto campione non si pubblica.** Una mediana su 3 annunci è
  un'opinione travestita: le statistiche dicono "campione insufficiente",
  mai un numero debole.
- **D5 — GDPR per costruzione.** Il libro mastro tiene i FATTI (prezzo, mq,
  zona, date), mai i contatti del privato: il motore li scarta alla porta,
  e un test fallisce se qualcuno riapre lo spiraglio.
- **D6 — Il Perito è un dipendente come gli altri.** Registro, lettera di
  assunzione, manopole collegate (lotto verifiche, lotto arricchimenti,
  campione minimo), heartbeat, anti-deriva sui cron.
- **D7 — Il Ragioniere è la tappa 2 ed è questione di conformità**, non di
  comodità: nel codice non esiste FatturaPA/SDI da nessuna parte. XML
  deterministico nel motore, trasmissione PEC→SDI (costo zero) o provider —
  si decide con le tue risposte. Sella: livello 1 subito (sella.it è già
  riconosciuta dallo scanner — attivi gli avvisi email e parte), livello API
  da verificare col gestore.
- **D8 — L'Ispettore compone, non inventa.** Vetrina in una pagina: voto,
  foto, testo, data di libertà che non mente, percentile prezzo e giorni in
  vetrina contro l'assorbimento di zona (dal Perito).
- **D9 — Oracolo e Valutazione pubblica dopo il Perito.** Uno restituisce
  tempo (/chiedi, sola lettura), l'altro porta mandati (la stima pubblica
  coi dati veri → lead proprietario in pipeline).
- **D10 — Cosa NON si fa:** niente gestionale comprato, niente guerra di
  scraping oltre Homie, niente "commercialista sostituito" (gli si consegna
  un fascicolo perfetto), niente rubrica di privati nel magazzino.

---

## 3 · Costruito e testato (questa sessione — tappa 1 server-side COMPLETA)

- **`js/market-engine.js`** — il motore puro: fold delle osservazioni,
  storia prezzi (solo sui cambi), rientri con vite archiviate, verdetto di
  morte, coda di verifica, statistiche di zona (mediana/percentili €/mq,
  assorbimento, ribassi 30gg), posizione prezzo, comparabili (stessa zona,
  ±25% mq, mai un morto, mai sé stesso, lowSample dichiarato).
  **18 test + 3 mutazioni catturate** (403→morte, contatti→dentro,
  campione piccolo→pubblica: tutte fanno fallire la suite).
- **`api/market/_ledger.js`** — la porta unica del libro mastro
  (best-effort: non può mai rompere l'ingestione PFS).
- **Tap in `api/pfs/_ingest.js`** — ogni annuncio visto da qualsiasi porta
  alimenta il libro; anche il corto-circuito di freschezza (un
  ri-avvistamento rimanda la verifica di morte).
- **`api/market/pulse.js`** — cron 05:50: statistiche per zona in
  `marketStats/<zona>` (un doc per zona — il portal leggerà quello, mai il
  registro intero), verdetto esplicito su libro vuoto e backlog verifiche.
- **`api/homie/market.js`** — gli occhi: GET lotto (verifiche +
  arricchimenti, manopole del registro), POST esiti (verdetto lato server),
  heartbeat sotto l'allerta Telegram esistente. Mandato scritto in
  `bot/HOMIE.md`.
- **Rules** (`marketListings`/`marketStats` admin-only — lezione
  propertyLocks), **cron in vercel.json**, **Il Perito nell'organigramma**
  con 3 manopole collegate e testate.
- **`tests/market/wiring.mjs`** — le giunzioni asserite sulla sorgente
  (ordine del tap, verdetto solo server, rules, cron).
- **42 suite verdi.**

Dal momento del deploy il libro si riempie DA SOLO a ogni giro del radar.
Manca solo il lato Mac (Homie che chiama la sua porta — mandato pronto) e
la comps card nel portal (tappa 1b).

---

## 4 · La lista che resta

| # | Cosa | Stato / blocco |
|---|---|---|
| 1b | Comps card nel portal (immobile + PA) + ricerche di copertura zone | libera — prossima |
| 2 | Ragioniere: invoice-engine + XML FatturaPA + PEC→SDI + chiusura mese | **bloccata dalle risposte 1 e 3** |
| 2s | Sella livello 1 | **azione TUA**: attiva gli avvisi email movimento nell'home banking |
| 3 | Ispettore: sezione Vetrina | dopo 1b |
| 4 | Oracolo + Valutazione pubblica | dopo 1b |

---

## 5 · Le 4 domande (le stesse della v1, ancora aperte)

1. **[tappa 2]** Le fatture Egidi passano già dallo SDI da qualche parte?
   Regime fiscale (ordinario/forfettario)?
2. **[Sella API]** Il contratto business include l'accesso API al conto
   (Fabrick/Sella API)? Intanto: attiva gli avvisi email di movimento.
3. **[SDI]** Egidi ha una PEC?
4. **[Perito]** Zone di copertura: le ~10 dove operate, o tutta la mappa?
   (Il libro intanto si riempie con ciò che le porte già vedono.)
