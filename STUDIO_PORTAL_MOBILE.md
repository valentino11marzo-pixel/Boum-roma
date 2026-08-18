# STUDIO — Il portal in una mano (M2 · Portal App)

**Mandato dell'operatore** (2026-08-18): *"il portal da mobile deve essere come
un'app: ultra utile, tech e semplice da usare. I contratti: la sezione piena di
potenza, fatta male, accroccata, con duemila cose mal sizate e impossibile da
fillare tranquilli e appagati. Studia, analizza e proponi ricreazione totale o
miglioria."*

**Verdetto in una riga**: la potenza del portal è vera e va tenuta tutta; a
essere sbagliata su telefono è la PRESENTAZIONE. Quindi né patch (M1 lo era),
né rewrite (28.000 righe che incassano soldi non si riscrivono per un
problema di forma): **un layer di ricreazione dell'ESPERIENZA** sopra la
logica esistente, che su desktop non esiste e su telefono ridisegna
navigazione, liste, azioni e form. Spento il layer, il portale è IDENTICO a
prima — per costruzione, non per promessa.

**Cosa è stato consegnato con questo studio**: il layer completo e testato.
`css/portal-mobile.css` + `js/portal-mobile.js`, cablati in portal.html e in
sw.js, con 186 check verdi (`tests/mobile/run.mjs` sorgente +
`tests/mobile/ui.mjs` in un Chromium vero a 390px).

---

## 1. La diagnosi — perché "accroccato" è la parola giusta

La ricognizione (portal.html 754 righe di shell; TUTTA la SPA in
`js/portal-app.js`, 27.723 righe; più l'audit `PORTAL_AUDIT_2026-08.md` e i
suoi log di produzione) riduce il malessere mobile a **cinque cause radice**,
tutte di presentazione, nessuna di sostanza:

1. **La navigazione è da desktop.** Sidebar off-canvas con 32 voci dietro un
   hamburger: due tap e uno scroll per qualunque spostamento, zero
   segnaposto di "dove sono". Le app risolvono così da quindici anni: tab
   bar in basso, sotto il pollice.
2. **Le azioni sono icone nude da 25-36px.** `.btn-xs` (~25px) usata 134
   volte, `.btn-sm` 239 volte (Apple HIG: 44px). Il caso peggiore è il
   fascicolo contratto (`viewContract`, portal-app.js:16644): **~15-17
   bottoni nel footer** → su iPhone metà schermo di bottoni impilati,
   l'azione primaria per ultima.
3. **I form lunghi sono muri.** Il "Nuovo Contratto" È GIÀ un wizard a 4
   passi (`#cPage0..3` + `contractWizardNav`, portal-app.js:14743-15420) —
   ma con lo stepper che sfora in orizzontale e i passi densi. E i modali
   PIATTI sono peggio: **Modifica Contratto = 15 campi in una schermata**
   (riga 14788), **Immobile = 22 campi** (14739/14741), **Utente = 16-19**
   (14735/14737). "Impossibile da fillare tranquilli" è una descrizione
   letterale.
4. **Su schermi stretti ogni riga è un compromesso.** Le liste `.list-item`
   (contratti, pagamenti, fatture, utenti, documenti…) impacchettano
   icona+titolo+6 badge+meta+bottoni in una riga flex pensata larga.
5. **Micro-difetti da telefono**: input che zoomano, target sotto il dito,
   nessun feedback tattile, sheet e modali che non rispettano tastiera e
   safe-area. M1 ("Portal in tasca", portal.css:1204-1276) ha tolto il
   dolore acuto (safe-area, 44px, ricerca 🔍, scroll-lock) ma è un
   pacchetto di cerotti dichiarato tale: non cambia il MODELLO d'uso.

**Le scoperte che hanno orientato il progetto** (dalla mappatura, non
dall'intuito):
- Le liste principali **non sono tabelle**: sono div flex. Nel file esistono
  solo 6 `<table>` vere (adminflats, landlords, 3 fiscali, modale
  disponibilità). Quindi "tabelle→card" era il problema sbagliato; quello
  giusto è "righe flex→card + azioni degne".
- **~60 modali bypassano `openModal`** e scrivono `#modals.innerHTML`
  direttamente: l'unico punto di aggancio affidabile è un MutationObserver
  su `#modals`, non il wrapping della funzione.
- `saveContract` legge **`new FormData(#mForm)`**: qualunque campo spostato
  fuori dal form sparisce dai dati IN SILENZIO. È il vincolo numero uno di
  qualunque ristrutturazione dei form.
- Tutte le funzioni sono globali reali (nessuna IIFE): `goTo`, `openModal`,
  `contractWizardNav` si possono avvolgere e pilotare da un secondo script.
- I filtri scrivono `style.display = '' | 'none'` (mai `table-row`): cambiare
  il display delle righe via CSS non rompe nessun filtro.

## 2. La decisione — perché un layer e non un rewrite

| Opzione | Costo | Rischio | Cosa ne pensa questo studio |
|---|---|---|---|
| Patch CSS (ancora M1) | basso | basso | già fatta; non cambia il modello d'uso, il malessere resta |
| Rewrite mobile-first del portal | settimane | **altissimo** (28K righe vive, soldi veri, un solo operatore) | no: si ricostruirebbe la potenza per inseguire la forma |
| **Layer di esperienza (M2)** | giorni | **contenuto per costruzione** | ✅ ridisegna SOLO la presentazione; la logica resta l'unica autorità |

Il principio, preso dalle discipline già in casa (`_avail.js`, "una copia
sola"): **il layer non duplica MAI una decisione**. Ogni azione è un
`.click()` sul bottone originale (validazioni comprese), la tab bar è la
sidebar VERA specchiata dal DOM (voci, icone, badge — mai una seconda lista
che diverge), il wizard contratti naviga SOLO attraverso `contractWizardNav`
(la loro validazione resta l'unica). Zero scritture, zero Firestore, zero
fork.

## 3. Cosa fa il layer (M2, consegnato)

Attivo solo ≤920px e solo se `js/portal-mobile.js` parte; tutto il visivo
sta dietro `body.pm-on` in `css/portal-mobile.css`. Kill switch:
`?classic=1` (persistito) / `?app=1` per riattivare.

1. **Tab bar** (4 sezioni + Menu): pinnate le prime 4 preferite PRESENTI
   nella sidebar del ruolo (`dashboard, contracts, payments, viewings` per
   l'admin; le `my-*` per tenant/landlord — role-adaptive gratis). Badge
   specchiati; i badge delle sezioni non pinnate si SOMMANO sul Menu:
   niente sparisce. Si nasconde quando la tastiera è aperta
   (visualViewport) e quando l'app non è montata.
2. **Bottom sheet generico** (backdrop sfocato, maniglia, swipe-down):
   - **Menu** = la sidebar intera clonata a schede 2 colonne, con la card
     utente in testa; gli onclick inline sopravvivono al clone, quindi
     goTo/window.open/logout funzionano senza ricablaggio.
   - **Azioni riga**: nelle sezioni-lista ogni `.list-item` diventa card;
     i bottoni da 25px si nascondono (vivi) e compare la corsia: primaria
     ETICHETTATA a tutta larghezza + `⋯` che apre lo sheet con TUTTE le
     azioni (etichetta vera da title/aria/testo, righe 52px, distruttive
     in rosso).
   - **Footer modale ≥4 bottoni** (il fascicolo da 15!): primaria + Chiudi
     + `⋯` → sheet. Metà schermo di footer diventa una riga.
3. **Modali**: sotto i 920px tutte presentate come sheet dal basso; quelle
   grandi (≥6 campi o `lg/xl`) **full-screen** con header fisso, corpo
   scrollabile (max-height inline battuti), input 52px e tastiere giuste
   (`inputmode` decimale/tel/email stampati per nome campo).
4. **IL WIZARD SERENO — contratti**:
   - `addContract` (il wizard nativo): si RISTRUTTURA, non si ricostruisce.
     Via lo stepper che sforava; progress sottile oro, "Passo 2 di 4 ·
     Termini e canone", dots navigabili, barra fissa [Indietro][Avanti →]
     che proxy-a i bottoni originali: la validazione per-passo, il
     riepilogo (`buildContractReview`) e il submit restano i LORO. Bonus:
     ripartenza sempre dal passo 0 (chiude un bug latente:
     `contractWizardStep` non veniva mai azzerato alla riapertura).
   - I modali PIATTI (editContract, add/editProperty, add/editUser)
     diventano **wizard a capitoli semantici** (mappa dichiarativa `WIZ`:
     "Immobile e inquilino → Date e stato → Canone e deposito → Studenti →
     Note"), spostando i nodi DENTRO `#mForm` (FormData integra). Un campo
     non mappato finisce nel capitolo "Altro" — **mai perso**, e il test lo
     pretende. Chiusura col **Riepilogo**: tutti i valori riletti con
     calma, "Modifica" per capitolo, 💾 Salva = il requestSubmit del form
     vero. Il momento "appagati".
   - Guardie: il wizard Deal Link (già a passi), le superfici Magic Sign e
     il modale template (si ri-renderizza da solo) NON vengono toccati; un
     form che contiene una tabella non è un flusso lineare e resta com'è.
5. **Rotazione = ripristino automatico.** Tutto lo stato visivo dei wizard
   (stepper nascosto, righe-nav nascoste, pagina corrente, footer) è
   espresso SOLO con classi lette da regole `body.pm-on …`: un iPad che
   ruota oltre i 920px spegne il layer e il modale aperto torna ESATTAMENTE
   il desktop, senza un ripristino orchestrato nel JS (asserito per
   mutazione: il layer non scrive mai `style.display`).
6. **Cardify per le 6 tabelle vere** (adminflats/landlords…): thead→
   data-label, card 2 colonne, sticky-Azioni di M1 neutralizzata, azioni in
   corsia come le liste.

### Cablaggio
- `portal.html`: la CSS dopo portal.css, il JS dopo portal-app.js (le
  globali devono esistere).
- `sw.js`: i due file entrano nel ramo network-first-con-tetto-6s degli
  asset del portale (una shell stantia sopra un'app nuova sarebbe il bug
  M1 dei service worker).

### Test (la rete che tiene il layer onesto)
- `tests/mobile/run.mjs` — **151 check sulla sorgente**: ogni nome campo
  della mappa WIZ esiste davvero in portal-app.js (la config si legge dal
  file VERO in sandbox VM, mai ricopiata); tab e sezioni sono target reali;
  ordine di caricamento; sw; ogni `backdrop-filter` col gemello `-webkit-`;
  lo stato gated su `body.pm-on`; i wrap che non alterano i ritorni; il
  layer che non conia mai un `name=` e non tocca mai i dati.
- `tests/mobile/ui.mjs` — **35 check in un Chromium vero a 390px** con la
  CSS reale e il `contractWizardNav` REALE estratto dal sorgente (pattern
  desk.mjs): tab bar e badge, menu, card+sheet che eseguono l'azione
  originale, wizard nativo (i required vuoti NON avanzano — validazione
  loro), auto-wizard (capitoli, "Altro" mai perso, riepilogo coi valori
  veri, Salva=requestSubmit), footer compresso, rotazione avanti/indietro,
  kill switch.
- `npm test`: 57 suite, tutte verdi.

## 4. Cosa NON è stato toccato (e perché)

- **portal-app.js: zero modifiche.** Anche i due bug latenti trovati
  (`contractWizardStep` mai azzerato; `var(--surface)` usato decine di
  volte ma MAI definito in portal.css — sfondi che risolvono a
  trasparente; `.nav-badge.green` usata dal JS ma assente in CSS) sono
  stati compensati nel layer dove possibile e lasciati intatti a monte:
  questo lotto è di presentazione, un fix a monte merita il suo commit.
- **Desktop: zero pixel.** Disciplina M1 portata a livello di test.
- I `prompt()`/`alert()` nativi di saveContract (matematica canone, CAF
  studenti) restano: sono brutti ma corretti, e intercettarli
  significherebbe duplicare la validazione (vietato dal principio 1).

## 5. La roadmap proposta (fasi successive, in ordine di resa)

1. **M3 · La Deal Room in tasca** — l'audit l'ha già approvata (#19): su
   mobile la tab "Oggi" può diventare il call-sheet operativo (visite di
   oggi coi viaggi, firme in attesa, incassi del giorno) — i dati sono già
   tutti in `S`.
2. **Boot dieta (I1-I2 dell'audit)** — il layer rende il portal USABILE su
   iPhone; il boot da 2,3MB no-store resta il collo di bottiglia della
   VELOCITÀ. Mezza giornata, -60% tempo-a-utile.
3. **prompt() → mini-modali** (zona ARPE, mq, RLI): già segnalato
   dall'audit §6; ora che esiste lo sheet generico, ognuno è un'ora.
4. **Swipe actions sulle card** (trascina la riga → azioni rapide) e
   **pull-to-refresh**: zucchero da aggiungere SOLO dopo feedback d'uso
   reale del fondatore — ogni gesto invisibile è un costo di scoperta.
5. **FAB contestuale** ("+ Nuovo contratto" flottante nella sezione): da
   valutare dopo una settimana d'uso; la corsia page-actions orizzontale
   potrebbe bastare.
6. I due fix a monte gratuiti: definire `--surface` in portal.css e
   azzerare `contractWizardStep` in `openModal` (due righe, desktop
   compreso).

## 6. Come si prova (per il fondatore)

Da iPhone: aprire `/portal` — il layer è attivo da solo. Se qualcosa non
convince: `boomrome.com/portal?classic=1` torna al portale di prima
(persistito), `?app=1` riattiva. Le quattro cose da provare per prime:
1. la tab bar in basso (Contratti col badge);
2. una riga contratto → `⋯` → lo sheet delle azioni;
3. `+ Nuovo` → il wizard a passi con la barra fissa in basso;
4. `Modifica` su un contratto → i capitoli + il Riepilogo prima di salvare.

---

*Studio e implementazione M2 del 2026-08-18. Ricognizione: portal.html:1-754,
portal-app.js (mappa completa modali/liste/nav/boot), css/portal.css:1-1276,
PORTAL_AUDIT_2026-08.md. Consegna: css/portal-mobile.css,
js/portal-mobile.js, wiring portal.html/sw.js, tests/mobile/{run,ui}.mjs
(186 check), run-all aggiornato.*
