# STUDIO ARSENALE II — le console, le prove, la nuova kill list
*2026-08-21 · segue STUDIO_ARSENALE_2026-08.md (che censiva le 28 sezioni del
portal). Innesco: il fondatore segnala «il pfs command ha problemi e bug, e
tanti altri tool». Questo studio allarga il censimento a TUTTO il patrimonio
admin — portal + 16 pagine console — e questa volta parte dalle PROVE.*

---

## 0 · Il metodo: l'ispettore, non le opinioni

Prima di giudicare, è stato costruito un **ispettore meccanico** che scandaglia
ogni pagina admin cercando tre classi di rottura che l'occhio non vede:

1. **bottoni morti** — handler inline che chiamano funzioni mai definite
   (la classe del bug «d'Oro» appena guarito nel portal);
2. **API fantasma** — `fetch` verso endpoint `/api/` che non esistono più;
3. **id orfani** — `getElementById` su elementi assenti dall'HTML.

### Esito, pagina per pagina

| Pagina | Righe | Verdetto ispettore |
|---|---:|---|
| pfs-command.html | 2.985 | pulita (7 canali realtime, 60+ funzioni, tutte definite) |
| radar.html | 470 | pulita |
| banca.html | 595 | pulita |
| team.html | 334 | pulita |
| salute.html | 166 | pulita |
| pre-agreement-admin.html | 1.041 | pulita (i «fantasmi» segnalati erano overlay creati a runtime) |
| media-studio / photo-lab / risposte / scheda-canone / verbale / doc-parser / watermark | — | pulite |
| **cockpit-preview.html** | **3.442** | pulita ma **orfana** (v. §2) |
| **public/deals_v2_commandcenter.html** | **1.969** | **zombie**: toast rotto (`boomToast` assente), campi conduttore morti, raggiungibile solo per URL diretto |

**La lettura onesta**: le console NON sono rotte nel cablaggio. I bug che
l'operatore incontra sono di un'altra classe — e l'ispettore ha portato
dritti alla più grave.

### Il difetto portante trovato (e già guarito oggi)

`BoomPortal.listen` — il canale realtime usato da **tutte** le console —
ritentava sugli **errori**, ma un canale che non si apre mai (WebKit
incastrato, il difetto documentato e già visto sul portal) non chiama né i
dati né l'errore: **le 7 sezioni di pfs-command restavano vuote per sempre,
senza un segnale**. Su iPhone la plancia sembrava rotta anche quando era
sana: pipeline vuota, feed vuoto, zero errori. È la lezione watchPAs (la
console proposte fu guarita così ad agosto) mai portata nella copia
condivisa. **Corretto in `js/boom-portal.js`**: dopo 6s di silenzio arriva
una lettura one-shot, il canale resta armato e quando apre prende il
comando. Guarite in un colpo: pfs-command, banca, team, salute, radar.
Test: `node tests/listen/run.mjs`.

### Il buco che resta: i bug arrivano come «ha problemi»

La segnalazione del fondatore è sacrosanta ma anonima: QUALI righe, QUALI
tap. Oggi tra il suo pollice e questo repo non c'è un canale. La risposta è
la creazione **C (🐞 Segnala)** in §4 — due ore di lavoro che chiudono il
buco per sempre.

---

## 1 · Il censimento completo (quello che il primo Arsenale non copriva)

Il primo studio censiva le sezioni DENTRO il portal. Il patrimonio vero:

- **1 portal** (~27 sezioni dopo i primi 2 tagli del Machete, eseguiti oggi:
  Command Center → alias di Oggi, Zone Intelligence → lapide verso /radar);
- **16 pagine console** fuori dal portal, per ~13.000 righe;
- **23 cron** e ~19 agenti server-side (censiti nell'organigramma).

Il fatto che salta all'occhio coi numeri in mano: **cockpit-preview.html è
la seconda pagina più grande dell'intero repo** (3.442 righe — più di
pfs-command) ed era raggiungibile da UN solo bottone… dentro il Command
Center appena tagliato. Oggi è di fatto orfana. Homie ha cambiato mandato
(niente più analisi per-lead sul Mac): la pagina che ne faceva da cockpit è
un monumento a un'architettura che non c'è più.

---

## 2 · La diagnosi architetturale: la Caccia ha tre teste

Il mestiere «trovare casa ai clienti paganti» (PFS) ha UN ciclo: criteri →
ricerche → avvistamenti → triage → proposta → visita → esito. Oggi quel
ciclo è spalmato su TRE superfici che leggono le stesse collection:

| Superficie | Cosa fa | Sovrapposizione |
|---|---|---|
| **/pfs-command** (2.985 r.) | pipeline clienti, fascicolo drawer, feed radar, triage, **vedette**, **occasioni**, salute fonti, brief AI | — |
| **/radar** (470 r.) | polso per zona, **occasioni** 💎, **vedette** (CRUD!), valutatore, gemelli, mandati | occasioni e vedette DOPPIE con la plancia |
| **portal → Property Radar + Property Finder** | ricerche e confronto client-side, generazione precedente | superate da entrambe (kill list I) |

Le **vedette hanno due CRUD** e le **occasioni due viste**. Quando qualcosa
«non torna», l'operatore non sa quale delle tre superfici stia mentendo — e
ogni bug va cercato in tre posti. Questo È il «pfs command ha problemi»
strutturale, al di là dei singoli difetti.

### Verdetto: LA FONDERIA — una console sola per la Caccia

**/pfs-command assorbe i 4 pannelli di /radar** (polso zone, valutatore,
gemelli, mandati) come tab «📊 Mercato» — occasioni e vedette esistono già
in plancia, si spengono i doppioni — e **/radar diventa una lapide gentile**
verso la plancia. Le sezioni portal Property Radar / Property Finder →
lapidi verso /pfs-command. Risultato: **un posto solo, uno stato solo, metà
della superficie da mantenere**, e ogni bug futuro ha UNA casa.

*Alternativa considerata e scartata*: costruire una console nuova («/caccia»)
da zero. No: la plancia è l'abitudine dell'operatore, è la pagina più
completa e più testata, e 470 righe si trasferiscono in un giorno; 3.000 se
ne riscrivono in una settimana, coi bug nuovi in omaggio.

---

## 3 · La nuova kill list (v2 — sostituisce la v1 dove diverge)

| # | Superficie | Verdetto | Perché |
|---|---|---|---|
| ✅ 1 | Command Center (portal) | **FATTO** → alias di Oggi | eseguito oggi (#183) |
| ✅ 2 | Zone Intelligence (portal) | **FATTO** → lapide verso la Centrale | eseguito oggi (#183) |
| 3 | radar.html | **fold in /pfs-command** (tab Mercato) → lapide | §2: vedette e occasioni doppie; una console sola per la Caccia |
| 4 | Property Radar (portal) | lapide → **/pfs-command** | *(correzione v1, che diceva /radar: il feed vive in plancia)* |
| 5 | Property Finder (portal) | lapide → **/pfs-command** | idem |
| 6 | Market Intelligence (portal) | lapide → la Centrale (oggi /radar, domani tab Mercato) | client-side su dati stantii = disinformazione |
| 7 | Photo Studio (portal) | lapide → **/media-studio** | il superset con i binari di pubblicazione |
| 8 | photo-lab.html | fold: lo stato dello sweep → /media-studio o /salute, poi lapide | 118 righe, mestiere assorbito |
| 9 | Inbox (portal) | parcheggio dietro Console, poi fold nella timeline del lead | le conversazioni arrivano già come lead (homie/message) |
| 10 | deals_v2_commandcenter.html | **ritiro** (tombstone file) | zombie provato: 1.969 righe, toast rotto, nessun link entrante; l'erede è il Deal Link del portal |
| 11 | cockpit-preview.html | **parcheggio 30gg**, poi ritiro o fusione | 3.442 righe orfane di fatto; Homie ha cambiato mandato; se serve una «storia dell'agente», vive nel portal (activityLog c'è già) |
| 12 | Landlord DB · Rischio · Zero (portal) | parcheggio 30gg dietro Console | invariato da v1: se restano muti → via |
| 13 | AdminFlats (portal) | rinomina **«Vetrina»** | il nome deve dire il mestiere |
| — | watermark-studio.html | **TENERE** | l'onestà vale nei due sensi: è l'unico tool SENZA login (stagisti/squadra foto), il suo valore È quello — media-studio non lo sostituisce per quel pubblico |

Da ~27+16 superfici a **~15 portal + 10 console**, con la Caccia a una testa.

---

## 4 · Le creazioni — cosa rende il portale DAVVERO più potente

Ordinate per valore/sforzo. Ogni voce dichiara il numero che muove.

**A. La Fonderia della Caccia** *(= §2; muove: bug ÷2, superficie ÷2)* —
½–1 giorno. È ANCHE la risposta ai «problemi e bug» della plancia: un posto
solo dove cercarli e correggerli.

**B. 🐞 «Segnala» — il canale dei bug** *(muove: il tempo tra «ha problemi»
e il fix)* — 2 ore. Un bottone discreto in ogni console e nel portal:
un tap → doc `bugReports` con pagina, hash, dispositivo, **gli ultimi errori
client già raccolti da /api/log**, più una riga di testo opzionale → ping
Telegram + riga in Oggi. La prossima segnalazione non sarà «ci sono bug»:
sarà una lista puntata, con contesto tecnico allegato da sola.

**C. Il Tabellone del Vuoto** *(muove il numero che nessuna pagina mostra:
€ persi al giorno)* — ½ giornata. Per ogni casa sfitta: giorni × canone =
contatore che sale, e le azioni DENTRO la riga, tutte già costruite:
«chi la cercava?» (ricerca rovesciata), «richiama» (campagna un-tap), stato
Pubblicista, «fuori fascia?» (Valutatore). Entra anche come voce in Oggi.

**D. L'Ispettore in CI** *(muove: mai più un bottone morto in produzione)* —
1 ora. Lo script di questo studio entra in `scripts/` e nella CI: handler
morti, API fantasma e id orfani **bocciano il push**. La classe «d'Oro»
diventa impossibile da reintrodurre, su TUTTE le pagine.

**E. Oggi atto II — i task del Regista** *(muove: zero decisioni fuori
coda)* — ½ giornata. ✓ Fatta / ⏰ +1g dalla coda, via un piccolo endpoint
server (NON client-side: la Fatta deve cancellare l'evento calendario, e
quella semantica vive in `api/regista/_tasks.js` — farlo dal browser
disallineerebbe il telefono dall'agenda).

**F. La Proposta al Proprietario** *(il più strategico: conquista case)* —
1 giorno. Il Radar Mandati trova i privati fermi; manca il colpo: un tap →
PDF di valutazione (fascia dal Valutatore corretta sui FIRMATI — il dato che
Casafari non ha — assorbimento zona, cosa fa BOOM, fee) + WhatsApp pronto.

**G. «Scrivi a…» universale** *(comfort quotidiano)* — da ⌘K: persona →
compositore col contesto (contratto, rate, lingua) e le risposte rapide.

### Cosa NON fare (le guardie)

- **Nessuna console nuova.** Ogni metro quadrato di UI nuovo si paga in
  fiducia e manutenzione: prima si fonde, poi (forse) si costruisce.
- **Nessun rebuild.** La plancia si rifonde per trasloco di pannelli, mai
  per riscrittura.
- **Nessun framework.** Il no-build è un vantaggio competitivo di questo
  repo (deploy in secondi, zero pipeline da curare).
- **Nessuna «analytics dashboard».** Lo Studio esiste; i numeri che contano
  (vuoto, ritardi, pipeline) vivono nelle CODE con le azioni, non nei grafici.

---

## 5 · La sequenza consigliata

1. **B — 🐞 Segnala** (2h): da qui in poi ogni bug arriva con nome e cognome.
2. **A — Fonderia della Caccia** (½–1g): tab Mercato in plancia, lapidi.
3. **C — Tabellone del Vuoto** (½g).
4. **D — Ispettore in CI** (1h).
5. **E — Oggi atto II** (½g).
6. **F — Proposta al Proprietario** (1g).
7. Machete restante: voci 6–13 della kill list (mezza giornata, in coda alle
   fusioni così ogni lapide punta a un erede già pronto).

*Il filo che tiene tutto: meno superficie, più code con le azioni dentro,
e ogni segnale — bug compresi — che arriva già strutturato dove lo leggi.*
