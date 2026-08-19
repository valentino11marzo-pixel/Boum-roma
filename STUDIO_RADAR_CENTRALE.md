# STUDIO — LA CENTRALE DEL RADAR (Radar 2.0) · v1
### Formato: decisioni, non opzioni. Costruito e testato in questa sessione.

*Agosto 2026. Domanda dell'operatore: "miglioria, volendo totale, dei nostri
software interni per la ricerca degli immobili, gli alert, il radar — cose
tangibili, utili, semplici, interconnesse coi clienti PFS o altri impostati a
nostro piacimento; potente quanto un Casafari". Risposta: non un censimento
più grosso (quello è il gioco di Casafari, flotte di proxy — D1 dello studio
Autonoma, confermata), ma i QUATTRO poteri che Casafari vende, costruiti sul
ciclo di vita che il Perito già registra e sul dato che Casafari non avrà
mai: i canoni FIRMATI nostri.*

---

## 1 · Cosa vende Casafari, e cosa avevamo già

Letto sul loro materiale pubblico: (1) aggregazione con **deduplica
cross-portale** — la stessa casa vista ovunque è UNA scheda con tutta la sua
storia; (2) **alert** su ricerche salvate, in particolare "un privato è
appena uscito"; (3) **valutazione** con comparabili scelti in automatico;
(4) analytics di mercato: storia prezzi, giorni in vetrina, sparizioni.

BOOM aveva già: le porte (alert email, occhi di Homie, scan), il libro
mastro del Perito (nascite/vita/morte provata, statistiche di zona), il
punteggio annuncio↔cliente coi mazzi di swipe. Mancavano esattamente i
quattro poteri sopra — e due difetti alla base li avrebbero affamati
comunque (§3).

## 2 · Le decisioni

- **D1 — Un motore puro, quattro poteri.** `js/radar-engine.js`
  (`BOOM_RADAR`, UMD; riusa `normalizeZone` di market-engine — UNA copia):
  **l'Impronta** (gemellaggio cross-portale), **il Fiuto** (punteggio
  occasione), **le Vedette** (ricerche libere), **il Valutatore** (fascia
  canone). Il giudizio sta nel motore, testato anche per mutazione; l'I/O
  sta nelle porte.
- **D2 — Un falso gemello è peggio di uno mancato.** Fondere due case
  diverse nasconde una casa a un cliente. Quindi: vie diverse = MAI gemelli
  (qualunque sia il resto); stessa fonte = soglia più alta E un segnale
  identitario obbligatorio (la trappola vera: dieci unità gemelle della
  stessa agenzia, prezzo e mq identici, case diverse); il segnale dei
  titoli esige ≥2 token significativi (un solo "eur" condiviso non è
  identità). E la via non distruttiva: si annota il cluster, non si
  cancella niente.
- **D3 — La stessa casa, una volta sola, ovunque.** Il de-dup di cluster
  vale per il mazzo del cliente (due card della stessa casa fanno sembrare
  il servizio un aggregatore), per il feed occasioni e per le vedette —
  dove però è PER CANALE e per vedetta: il gemello PRIVATO di un annuncio
  d'agenzia passa eccome dalla vedetta "solo privati".
- **D4 — Il fiuto tace senza campione** (la D4 del Perito, ereditata):
  niente verdetto in una zona senza statistiche sufficienti. E un prezzo
  troppo bello è **'sospetto'**, mai 'occasione': le truffe vivono sotto il
  25° percentile, e segnalarle come affari brucia la fiducia nel radar.
- **D5 — Le vedette vedono solo il futuro.** Un annuncio nato prima della
  vedetta non la fa scattare (la semina del Segugio, gratis per
  costruzione). Telegram all'operatore è istantaneo (dentro l'ingestione);
  l'email a terzi esce come digest 3×/giorno, max 6 case, mai due volte lo
  stesso annuncio. Un criterio dichiarato che l'annuncio non può dimostrare
  è un NO che dice perché (fail closed).
- **D6 — Il Valutatore dichiara le sue basi.** Fascia dai quantili del
  CHIESTO di zona, corretta sul rapporto chiesto→FIRMATO dei contratti BOOM
  (≥3 firme, cap [−20%, +10%] — fuori è un artefatto del campione, non un
  mercato), sempre dichiarata nel risultato. Sotto campione: 'small_sample',
  mai un numero debole.
- **D7 — Il radar mandati produce CARD, mai messaggi.** Privato fermo oltre
  1.5× l'assorbimento della sua zona (o 60g fissi, dichiarati, dove
  l'assorbimento non ha campione) → card in /radar calcolata dal Perito
  (pulse). La D5 del Perito (niente rubrica di privati) non si tocca: nel
  doc viaggiano solo i fatti e l'URL pubblico. Sancito dallo studio Homie §3.
- **D8 — Best-effort, come il Perito.** Il tap del radar gira DOPO la
  scrittura master e DOPO il libro mastro; qualunque suo guasto torna null
  e l'ingestione PFS — il servizio pagato — prosegue identica. Asserito nel
  giro vero: con TUTTO il radar giù, il cliente riceve comunque la casa.
- **D9 — L'indice è una cache della verità.** Il gemellaggio legge UN
  documento compatto (`radarState/index`, cap 800 voci, 90g) — 1 lettura +
  1 scrittura per ingestione, mai una scansione. Una voce persa per un
  write concorrente degrada (un gemello mancato), non rompe.

## 3 · I due difetti alla base, guariti

1. **Le zone.** La fonte PORTANTE (scan-inbox) non passava nessuna zona, e
   scan-market passava la LABEL della ricerca ("Immobiliare · Roma · prati ·
   privati · ≤€1500") come zona → slug spazzatura che frammentava
   marketStats. Guarito in tre punti: `inferZone()` nel motore (lessico
   curato di ~38 zone romane; parole intere; l'alias lungo batte il corto
   contenuto — 'monti tiburtini' → Tiburtino, non Monti; due zone nel testo
   = ambiguo = null, mai indovinare) applicata in `_ingest` su
   titolo+indirizzo (MAI la descrizione: "a due passi da Trastevere" è
   marketing) con provenienza dichiarata (`zoneInferred`); `_searchurls`
   emette la zona PULITA della ricerca; `sync-searches` la persiste
   (`zoneName`) e `scan-market` passa quella. Gli slug sporchi a libro si
   auto-guariscono al ri-avvistamento (observe aggiorna zoneSlug).
2. **Due battiti bugiardi.** `pfsRadarHealth/sync` era LETTO da
   pfs-command e /api/pfs/health ma nessuno lo scriveva (fonte eternamente
   assente qualunque cosa facesse); gli occhi del Perito
   (`homie/market.js`) scrivevano il battito A MANO bypassando
   `alertDecision` — il commento prometteva "l'allerta Telegram esistente"
   e non era vero: potevano morire in silenzio per sempre. Ora entrambi
   passano da `reportHealth`.
3. *(bonus)* Un prezzo cambiato dentro la finestra di freschezza non
   aggiornava il doc (restava stantio) e non era una notizia. Ora si
   aggiorna, e un RIBASSO riapre fiuto e vedette (`priceJustDropped`).

## 4 · Costruito in questa sessione

- **`js/radar-engine.js`** — il motore (zona, impronta, indice, fiuto,
  mandati, vedette, digest, valutatore), tutto esportato.
- **`api/radar/_tap.js`** — il radar dentro l'ingestione: identità →
  fiuto scritto su `pfsProperties.radar` → feed occasioni
  (`radarState/occasioni`, cap 60 + card Telegram 💎) → vedette (Telegram
  istantaneo, coda email). Cache di modulo per non appesantire i cron.
- **`api/pfs/_ingest.js`** — inferenza zona alla porta, tap best-effort,
  de-dup di cluster nel push dei mazzi, `zone` nella card del mazzo, riga
  💎 nel Telegram "Match pronto", prezzo aggiornato su skipFresh.
- **`api/radar/valuta.js`** — POST {zone, sqm, rooms} → fascia + comps +
  correzione sui firmati (contracts×properties della zona). Auth come i
  cron PFS (un domani la chiama anche il bot).
- **`api/radar/digest.js`** — cron 3×/giorno (06:10/12:10/17:10 UTC): le
  code delle vedette → email digest (design Segugio, IT), notifiedIds solo
  DOPO l'invio, heartbeat `teamHealth/vedetta`, recap Telegram.
- **`api/market/pulse.js`** — il Perito compila anche
  `radarState/mandati` (mandatoCheck per zona).
- **`radar.html` (`/radar`) — LA CENTRALE**: chips salute fonti, polso del
  mercato per zona (marketStats), feed occasioni, candidati mandato,
  vedette (CRUD client-side, admin rules), Valutatore, gemelli
  cross-portale (dall'indice, un doc). Skeleton team/banca, admin-only,
  noindex + no-store, linkata nel gruppo Console del portal.
- **Registro**: La Vedetta assunta nell'organigramma (cron dichiarato —
  anti-deriva), Scout e Perito con la lettera aggiornata, Perito.console =
  /radar. **Rules**: `radarWatchers` + `radarState` admin-only (lezione
  propertyLocks). **vercel.json**: cron digest + maxDuration 60 + headers
  admin per /radar.
- **`tests/radar/run.mjs` — 102 check**: motore per mutazione (vie diverse
  mai fuse, stessa-fonte senza identità mai, niente verdetto senza
  campione, truffa mai occasione, vedetta solo futuro, digest mai due
  volte), giunzioni sulla sorgente (ordine del tap, label bandita, battiti
  veri, rules/cron/registro/nav), e il giro VERO su Firestore in memoria:
  3 portali → UNA casa nel mazzo, occasione una volta sola, coda vedetta,
  valutatore coi firmati, digest reale (nodemailer mockato via loader),
  radar rotto → servizio pagato intatto. **54 suite verdi.**

## 5 · Cosa NON si fa (ancora)

- Niente flotte di proxy / censimento totale (D1 Autonoma).
- Niente contatto automatico ai privati: i mandati sono card (D7).
- Il match foto (perceptual hash) per l'impronta: predisposto dal design
  (il cluster è additivo), non costruito — prima si misura quanti gemelli
  sfuggono ai soli fatti strutturati.
- La valutazione PUBBLICA (lead proprietario) resta la tappa dopo
  (D9 Autonoma): il Valutatore interno è il suo motore già pronto.
- Comandi bot (/valuta, /vedetta) — la porta accetta già X-Wizard/Homie:
  cablarli è un'aggiunta al Python, quando serve.
