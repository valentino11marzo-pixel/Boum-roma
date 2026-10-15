# STUDIO — La Home del portale: dove siamo, dove cade, cosa propongo (Claude ⇄ Codex)

**Mandato del fondatore** (15/10/2026): *«con Codex stiamo definendo una nuova
home e tutti gli altri dettagli del portale. Coordinatevi, proponete e
confrontate una soluzione di eccellenza, e dite dove cadrà».*

**In una riga**: la Home di Codex è viva in produzione da stanotte, regge le sue
prove (ho eseguito 16 suite browser su 17 e 11 suite soldi/firme su 12 qui, CI
verde sul commit servito), e **cade su quattro cose che non sono nel suo
codice**: la produzione che gira su un ramo, un lotto unico che mescola Home e
soldi, la prima schermata del telefono che mostra un launcher invece delle
decisioni, e un portale che pesa +227 KB a ogni lotto senza che nessuno lo
misuri. Sotto: i fatti verificati, i punti di caduta in ordine di costo, la
proposta, e le tre decisioni che spettano a Valentino.

---

## 1. Lo stato di fatto (letto, non dedotto)

| Fatto | Fonte |
|---|---|
| Produzione = `4505bdf` del ramo `codex/portal-mobile-connected-20261014` (PR #290), deploy `dpl_G7SNatn23UwnmfWKS9KUMBWFhBb3`, 15/10 00:52 Roma | Vercel API, `list_deployments target=production` |
| In 26 ore la produzione è stata ridistribuita **6 volte da 3 rami diversi** (`main` 3808a5f → `claude/funny-allen` ce289aa, 960f3e2 → `codex/…` 4273304, 0c0ee06, 4505bdf) | stessa lista |
| PR #290: **162 file, +13.259 −2.346, 38 commit**. Contiene per intero #281 (la Home, 17 commit), #289 (Magic Sign ricostruito, ancora *draft*), il ramo proprietari di Claude, il lucchetto/Checkout Stripe, il budget AI, il journey T+3 | `git log main..origin/codex/…`, `merge-base --is-ancestor` |
| CI run 593 verde su `4505bdf` (224 suite) | GitHub Actions |
| Nelle ultime 24 h un solo gruppo di errori runtime in produzione: timeout a 60 s su `scan-replies` / `leads/scan-inbox` (5 casi, preesistenti da luglio) — niente dal portal | Vercel `get_runtime_errors` |
| `portal-app.js`: 2.692.945 → **2.848.631 byte** (+156 KB, +5,8 %). JS totale caricato da `portal.html`: 3.337.018 → **3.564.041 byte** (+227 KB). `<script src>`: 23 → **29**. Fogli CSS: 10 | `wc -c` sui due rami |
| PR #282 (Claude: `ORA.md`, CLAUDE.md corto, 77 rami) **confligge** con #290 su `CLAUDE.md` e `.vercelignore` | `git merge-tree` |

### Cosa è la Home (`oggiPage`, PR #290)
Dall'alto: intestazione → barra di ricerca (motore `portal-search-engine`, 15
fonti) → **16 strumenti fissi** in griglia (4 colonne su telefono, 6 su
desktop) + 3 scorciatoie → fold «Prepara una risposta» (owner command) → fold
**«Da seguire»** aperto (`oggi-desk-engine`: i segnali di `oggi-engine`
raggruppati per pratica, in 5 percorsi, ordinati per urgenza e **lo stesso
punteggio di costo del ritardo** di prima) → fold «Coda completa e verifiche»
chiuso (la lista piatta delle decisioni + i seguiti della Segretaria) → a lato
«Agenda visite» (7 giorni Roma) e «Strumenti e guide».

### Cosa regge davvero (merito a chi l'ha costruita)
- **Una copia sola, rispettata.** La ricerca è UN motore: header, Home,
  selettori del Prontuario e la palette ⌘K lo leggono tutti (`handleSearch` →
  `portalSearchRecords`; `portal-desktop.js` adotta ancora le righe di
  `handleSearch`). Il desk non reinventa l'ordine: usa `BOOM_OGGI.build` e il
  suo `score`. I 16 strumenti sono voci del Prontuario (`BOOM_ACTIONS.homeTools`).
- **La navigazione resta l'indice** (BOOM OS, regola 3): 6 voci primarie, 4
  gruppi, i 38 handler conservati; la tab bar mobile legge la sidebar vera.
- **Niente invii né AI all'apertura**, zero scritture (asserito nei test con
  `testIO.writes === []`), copertura dichiarata («lettura parziale», «esito
  non verificabile») invece che inventata.
- **Le prove girano** anche qui: `oggi` 139, `oggiworkspace` 82, `actions`
  208, `oggideskui` 21, `oggiquicktoolsui` 69, `portalworkspaceui` 41,
  `portaljourneyui` 30, `searchui` 18, `misura` 127, `mobileui` 77, `desktopui`
  29, `safari` 9, `portalsessionui` 24; soldi e firme: `money` 74,
  `paymentlinks` 124, `tenantpayments` 54, `palockrecovery` 20+4, `pacheckout`
  14+5, `mandato` 245, `notify` 100, `signtokens` 54, `finalize` 57,
  `verbale` 30, `sdd` 41, `magicsigncustom` 17 — tutte verdi.

---

## 2. Dove cade — in ordine di costo

### F1 · La produzione gira su un ramo, e ogni merge su `main` la cancella (costo: ore di sito monco, già pagato)
È successo il 13/10 alle 20:24 UTC: il merge di #288 su `main` ha ridistribuito
`main`, che non aveva la Home, e per ore www.boomrome.com è tornato al portale
vecchio (nota di Claude su #281). Il ramo di produzione di Vercel è `main`:
**qualunque** PR unita adesso — #282, una riga di rules, un refuso — ripete il
guasto. È una bomba a orologeria con un solo disinnesco: **#290 su `main`
oggi**. Non esiste il «dopo che l'ho provata»: finché non è su `main`, provarla
è il rischio.

### F2 · Un lotto solo per cose che non si separano (costo: un revert impossibile)
In #290 la Home viaggia con il Magic Sign ricostruito (#289, *draft*: nel suo
stato dichiarato non è pronta, eppure è in produzione), con il lucchetto e la
Checkout delle proposte, col budget Anthropic, col journey. Se la Home avesse
un difetto grave domani, non si potrebbe toglierla senza togliere il
lucchetto dei pagamenti; se il lucchetto avesse un difetto, non si potrebbe
tornare indietro senza perdere la Home. Nel repo la regola scritta è «un lotto
= una PR» (AGENTS.md) e ORA.md (#282) assegna a Codex il ruolo di **revisore**
dei PR che toccano soldi e firma — qui Codex li ha scritti, e nessuno li ha
riletti. L'ho fatto io, per quanto si può in una sessione: le suite dei soldi
e delle firme passano (sopra), il diff del lucchetto (`_lock.js` 238 righe,
`_payment-session.js`) segue la disciplina CAS già in casa. Non ho riletto riga
per riga 13.000 righe: lo dico perché il verde non lo sostituisce.

### F3 · Due manuali che si contraddicono (costo: il prossimo merge rompe l'altro)
#282 riscrive `CLAUDE.md` in corto e mette `ORA.md` a comandare («Codex
rivede, Claude costruisce, redesign della home vietati fino al 10 gennaio»);
#290 aggiunge 231 righe a `CLAUDE.md` e **è** Codex che costruisce la Home.
Valentino ha scelto, nei fatti, la seconda: va scritto, altrimenti chi lavora
domani legge due ordini opposti. Ordine di merge che non perde niente: prima
#290 (è la produzione), poi #282 rigenerato — il suo spezzamento è uno script
(`scripts/aree-split.mjs`), si rilancia sul `CLAUDE.md` unito in un minuto.

### F4 · Sul telefono la prima schermata è un launcher, non una decisione (costo: la lead non risposta)
Misurato sugli screenshot delle suite (viewport 390×844): intestazione, barra
di ricerca, «Fonti e archivio», **16 icone su 4 righe**, 3 scorciatoie. Il
titolo «Da seguire» entra a y≈635 e il primo contenuto a y≈735, con la tab bar
a 785: **il caso urgente della demo («1 caso con incassi, scadenze o
interventi urgenti») si vede solo scorrendo**. La dottrina di Oggi
(CLAUDE.md, 19/08) dice il contrario: *«la macchina lavora da sola e
all'operatore restano le DECISIONI: qui persistono»*. Un launcher non costa
niente se è sotto; una decisione nascosta costa il deal.
Il test `portalnavigationui` lo sa: pretende «Priority action is visible
above the phone tab bar» e `work.y < 680` — e **qui cade a 320 px** (due volte
su due, font Inter installato; in CI passa). Un'asserzione che dipende da
50 px di metrica dei font è il segno che il layout sta sul filo: su un iPhone
reale con Helvetica Neue nessuno sa da che parte cade.

### F5 · Tab bar e strumenti decisi senza misura (costo: il pollice nel posto sbagliato)
Le 4 tab sono diventate Oggi · Persone · Immobili · Contratti: **Incassi** (col
badge dei ritardi) e **Agenda** sono finite nel Menu. Nessun dato dice quali
sezioni Valentino apre dal telefono — Behavior Intelligence misura il sito
pubblico, non il portale. I 16 strumenti e il loro ordine sono una scelta a
ragionamento; la regola di casa è «si misura prima di costruire».

### F6 · Il portale ingrassa senza budget (costo: il boot da telefono, che nessuno vede)
+227 KB di JS e 6 `<script>` in un lotto; 2,85 MB di `portal-app.js` da
scaricare e **parsare a ogni apertura** su telefono. La roadmap di BOOM OS
(P2: spezzare `portal-app.js` per pagina, da 681 KB a ~150 KB critici) è
ferma dall'agosto, e ogni lotto la allontana. Non esiste un test che fermi la
crescita (per le immagini c'è: `tests/media/hosts.mjs` con budget per ruolo).

### F7 · Letture che non servono (costo: la fattura Firestore, la lezione del 5/10)
- Sulla Home girano **insieme** un listener `onSnapshot` su
  `operatorTasks(followUp.open==true)` **e** un polling ogni 30 s di
  `/api/segretaria/follow-up` (pagine da `FOLLOW_UP_LIMIT=200`): con 50 seguiti
  aperti sono ~144.000 letture al giorno per scheda lasciata aperta, e non si
  fermano quando la scheda è nascosta (`visibilitychange` serve solo a
  recuperare, non a sospendere). Il listener c'è: il polling dovrebbe girare
  **solo** quando il listener è in errore.
- `preAgreements.limit(150)` **senza ordine** alimenta ora il desk: è «la
  finestra a caso» del 30/09 (Firestore restituisce i primi 150 per id). Sopra
  150 proposte le più NUOVE possono sparire dalla Home, con la sola riga
  «quadro parziale». Preesistente su `main`, ma ora è la base della prima
  schermata. Idem `viewingRequests.orderBy('createdAt')` (regola scritta:
  mai orderBy+limit, nasconde i doc legacy senza il campo).

### F8 · Nessun umano l'ha ancora usata (costo: scoprirlo dal cliente)
La PR lo dichiara: *«il collaudo interattivo nella sessione reale resta
pendente»*. Tre versioni di `/executive` sono cadute al primo sguardo del
fondatore; qui il primo sguardo non c'è stato. Mezz'ora di uso vero, dal
telefono, con le note, vale più di altre 200 asserzioni.

---

## 3. La proposta (quello che metterei sul tavolo con Codex)

### La Home in tre righe
1. **Adesso** — ciò che costa se ignorato, entro la prima schermata del
   telefono: i 3 casi in testa al desk (urgenti → correnti, stesso punteggio di
   costo del ritardo), ognuno con la SUA azione; la visita di oggi se è entro
   3 ore. Vuoto onesto in una riga: «Niente da decidere». Il resto della coda
   resta sotto, com'è.
2. **Strumenti** — **6 + «Tutti»**, non 16: i sei misurati (finché non c'è
   misura: Persone · Immobili · WhatsApp · Incassi · Agenda · Contratti), il
   chip del contesto quando un record è selezionato; i 16 restano nel catalogo
   a un tap, come oggi.
3. **Cerca** — **una porta per faccia**: sul telefono il 🔍 dell'header (già
   overlay, già lo stesso motore), sul desktop la palette ⌘K. La terza barra
   dentro la Home è un doppione dello stesso motore che occupa 60 px sopra la
   piega.
Sotto, invariati: Agenda 7 giorni, Coda completa, Strumenti e guide.
«Prepara una risposta» (owner command) sta dentro lo strumento WhatsApp/Email,
non in Home: è un'azione, non una decisione.

### Le regole che tengono in piedi la Home (da pinnare nei test)
- **R1 Decisione prima del launcher**: con `counts.urgent + counts.current > 0`
  il primo elemento interattivo sotto l'intestazione è un'azione del desk, a
  320 e a 390 px, **con font di sistema diversi** (il test gira con due
  famiglie: la caduta di F4 non deve dipendere dal runner).
- **R2 Una coda, un ordine**: il desk e la coda completa sono due viste degli
  stessi segnali (già vero) — il nome «Coda completa e verifiche» diventa
  «Archivio e verifiche», perché «completa» fa credere che il desk sia
  incompleto.
- **R3 Si misura, poi si fissa**: 14 giorni di `boom-track` sul portale
  (`/api/analytics/collect` esiste già; `page:'portal'`, `section`,
  `tool`) → `/behavior` guadagna la scheda «Portale» → le 4 tab e i 6
  strumenti escono dai numeri e il test li pinna. Niente nuovo stato: è la
  collection `webJourneys` che c'è già, scade a 90 giorni.
- **R4 Il badge dei soldi non si nasconde**: se Incassi non è una tab, i
  ritardi contano sul badge di Oggi (oggi contano solo azioni e visite).
- **R5 Listener O polling, mai entrambi**; polling sospeso a scheda nascosta;
  finestre ORDINATE (`createdAt desc` + filtro di stato) per proposte e
  visite, con il fallback non ordinato solo per i doc legacy — la disciplina
  di `pendingNewLeads`.
- **R6 Budget a cricchetto in CI** (`tests/portale/budget.mjs`): byte totali
  del guscio del portale e numero di `<script>` ≤ al valore corrente; chi deve
  superarlo lo alza nel test, nella stessa PR, dicendo perché. Più UNA misura
  di tempo-a-utile in Chromium con CPU a ¼ (la tecnica già usata per
  `boom-ambient.js`), con soglia. Poi P2: `import()` per pagina senza build.
- **R7 Produzione = `main`**: una promozione di ramo vive al massimo 24 ore;
  il numero del lunedì (`/lunedi`) stampa «commit in produzione ∈ main? sì/no».

### La divisione del lavoro (perimetri senza file in comune)
| Chi | Cosa | File |
|---|---|---|
| **Codex** (lotto Home) | Tre righe, R1 R2 R4 R5 | `js/portal-app.js` (sezione `oggi*`), `js/oggi-*-engine.js`, `css/oggi-workspace.css`, `js/portal-mobile.js` (tab), `tests/oggi`, `tests/portal-workspace` |
| **Claude** | R3 (misura), R6 (budget + tempo), R7 (lunedì), rebase di #282 dopo #290 | `js/boom-track.js`, `api/analytics/*`, `behavior.html`, `tests/portale/`, `scripts/aree-split.mjs`, `ORA.md` |
| **Valentino** | merge di #290, le tre decisioni sotto, mezz'ora di uso vero | — |

---

## 4. Le tre decisioni (spettano al fondatore)

1. **#290 su `main` oggi** — sì o no. Il «no» significa accettare che il
   prossimo merge qualunque cancelli la Home, e che il Magic Sign ricostruito
   resti in produzione come *draft*. Raccomandazione: **sì**, con CI verde (lo
   è), e da domani un lotto = una PR.
2. **Decisione prima del launcher** — la prima schermata del telefono mostra
   le decisioni quando ci sono (proposta) oppure i 16 strumenti sempre (oggi).
   Raccomandazione: decisioni prima; il launcher a un pollice sotto.
3. **Misurare 14 giorni prima di fissare tab e strumenti** — oppure decidere
   d'istinto le 4 tab adesso (quali?). Raccomandazione: misurare; nel
   frattempo rimettere Incassi fra le 4 (è l'unica col badge dei soldi).

E, scritto una volta per tutte in `ORA.md`: **Codex costruisce la Home,
Claude rivede e tiene i budget** — o l'inverso, ma uno solo.

---

## 5. Verifiche eseguite e limiti dichiarati

- Worktree su `origin/codex/portal-mobile-connected-20261014` (`4505bdf`),
  `npm ci`, Playwright dal `/opt` del sandbox, Chromium 1194.
- Browser: 16 suite su 17 verdi; `portalnavigationui` cade a 320 px (F4),
  riprodotto due volte.
- Soldi/firme: 11 su 12; `magicsigncustomui`/`magicsigncustomsigner` **non
  verificabili qui**: il sandbox non raggiunge `cdn.jsdelivr.net` (403 del
  proxy) e la suite scarica PDF.js. In CI passano.
- Non verificato: l'uso nella sessione reale (F8), il numero di proposte e di
  seguiti aperti in produzione (nessuna credenziale Firestore), il costo
  Firestore effettivo dei prossimi giorni.
- Screenshot delle suite (dati dimostrativi): home a 390/320/1440 px e Oggi a
  390/1280 — allegati alla sessione.
